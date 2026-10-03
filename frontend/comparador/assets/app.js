/* app.js - Comparador de Tarifas v5 (rota /comparador)
   Fluxo: CSV do cliente -> lote no Worker (D1) -> comparação na tela -> PDF comercial (Worker). */
import { Api } from './api.js';
import { parseCsv, mapearColunas, montarLinhas } from './csv.js';
import { CENARIOS, resumir, comparavel, melhorDaLinha, periodo, montarRelatorio } from './resumo.js';

const CFG = window.AGFCOMPARADOR_CONFIG || {};
const COR = { AVISTA: '#94A3B8', CONTRATO: '#0D9488', CLUBE: '#0078D4', APP: '#D97706' };
const POR_PAGINA = 50;
const $ = (id) => document.getElementById(id);

const state = {
  config: null,
  arquivo: '',
  entrada: [],          // linhas lidas do CSV
  semMedidas: false,
  periodo: { inicio: '', fim: '' },
  resultado: null,      // { linhas, tabelaContrato, vigencia, opcoes }
  referencia: 'AVISTA',
  grupo: 'porServico',
  pagina: 1,
};

// ---------------------------------------------------------------- helpers
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const brl = (v) => (v == null || !Number.isFinite(Number(v)) ? '-' : 'R$ ' + Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const pct = (v) => (Number.isFinite(v) ? Math.round(v).toLocaleString('pt-BR') + '%' : '-');
const int = (v) => Number(v || 0).toLocaleString('pt-BR');
const dataBR = (iso) => { const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? `${m[3]}/${m[2]}/${m[1]}` : ''; };
const toast = (msg, erro) => (window.AgfHeader && AgfHeader.toast ? AgfHeader.toast(msg, erro) : alert(msg));
const carregando = (on) => { if (window.AgfHeader && AgfHeader.loading) on ? AgfHeader.loading.start() : AgfHeader.loading.done(); };

function pacoteNome() {
  const sel = $('pacoteContrato');
  return sel.options[sel.selectedIndex] ? sel.options[sel.selectedIndex].text : 'Platinum';
}
function nomes() {
  return { AVISTA: 'Balcão à vista', CONTRATO: 'Contrato ' + pacoteNome(), CLUBE: 'Clube Correios', APP: 'Correios App' };
}
function cenariosMarcados() {
  return CENARIOS.filter((c) => document.querySelector(`.cmp-cen input[value="${c}"]`).checked);
}
function mensagem(el, texto, tipo = 'erro') {
  el.hidden = !texto;
  el.className = 'cmp-msg ' + tipo;
  el.innerHTML = texto || '';
}

// ---------------------------------------------------------------- base
async function carregarConfig() {
  try {
    const c = await Api.config();
    state.config = c;
    const sel = $('pacoteContrato');
    sel.innerHTML = c.tabelas.filter((t) => t.tipo === 'CONTRATO' && t.codigo !== 'CLUBE_CORREIOS')
      .map((t) => `<option value="${esc(t.codigo)}"${t.codigo === 'PLATINUM' ? ' selected' : ''}>${esc(t.nome)}</option>`).join('');
    const clube = c.tabelas.find((t) => t.codigo === 'CLUBE_CORREIOS');
    if (clube && clube.observacao) $('clubeNota').textContent = clube.observacao;
    $('vigencia').textContent = dataBR(c.vigenciaTabelas) || '-';
    $('baseStatus').textContent = `Tabelas do D1 carregadas: balcão à vista (${dataBR(c.vigenciaAvista)}), ${c.tabelas.filter((t) => t.tipo === 'CONTRATO').length} pacotes de contrato e Correios App (${dataBR(c.vigenciaTabelas)}).`;
    $('baseDot').classList.add('ok');
  } catch (e) {
    $('baseStatus').textContent = 'Não foi possível carregar as tabelas: ' + e.message;
    $('baseDot').classList.add('erro');
  }
  atualizarBotaoCalcular();
}

// ---------------------------------------------------------------- arquivo
async function lerArquivo(file) {
  if (!file) return;
  if (!/\.csv$/i.test(file.name) && file.type !== 'text/csv') { mensagem($('fileMsg'), 'Escolha um arquivo .csv exportado do Portal Postal.'); return; }
  try {
    aceitarCsv(await file.text(), file.name);
  } catch (e) {
    mensagem($('fileMsg'), 'Não foi possível ler o arquivo: ' + esc(e.message));
  }
}

function aceitarCsv(texto, nome) {
  const { cabecalhos, linhas } = parseCsv(texto);
  const { mapa, faltando, semMedidas } = mapearColunas(cabecalhos);
  if (faltando.length) {
    mensagem($('fileMsg'), `O arquivo não tem as colunas obrigatórias: <b>${esc(faltando.join(', '))}</b>. Exporte o relatório "postagens analítico" do Portal Postal.`);
    return;
  }
  if (!linhas.length) { mensagem($('fileMsg'), 'O arquivo está vazio.'); return; }
  state.arquivo = nome;
  state.entrada = montarLinhas(linhas, mapa);
  state.semMedidas = semMedidas;
  state.periodo = periodo(state.entrada.map((l) => l.data));
  state.resultado = null;
  $('resultado').hidden = true;
  const sedex = state.entrada.filter((l) => /SEDEX/i.test(l.servico) || ['4014', '3220', '04014', '03220'].includes(String(l.codigo))).length;
  const per = state.periodo.inicio ? ` | ${dataBR(state.periodo.inicio)} a ${dataBR(state.periodo.fim)}` : '';
  $('fileInfo').hidden = false;
  $('fileInfo').innerHTML = `<span class="material-symbols-rounded" aria-hidden="true">description</span>
    <div><b>${esc(nome)}</b><small>${int(state.entrada.length)} postagens${per} | ${int(sedex)} SEDEX, ${int(state.entrada.length - sedex)} outras</small></div>`;
  mensagem($('fileMsg'), semMedidas ? 'O arquivo não tem altura, largura e comprimento. Correios App e Mini Envios dependem das medidas: o App sai na faixa mínima e o Mini Envios não entra.' : '', 'aviso');
  atualizarBotaoCalcular();
  $('calcButton').focus();
}

async function usarExemplo() {
  try {
    const r = await fetch(CFG.exemploCsv || './data/exemplo_postagens.csv', { cache: 'no-store' });
    if (!r.ok) throw new Error('arquivo de exemplo não encontrado');
    aceitarCsv(await r.text(), 'exemplo_postagens.csv');
  } catch (e) {
    mensagem($('fileMsg'), 'Não foi possível abrir o exemplo: ' + esc(e.message));
  }
}

function atualizarBotaoCalcular() {
  const n = cenariosMarcados().length;
  $('calcButton').disabled = !state.config || !state.entrada.length || n < 2;
  $('calcButton').title = n < 2 ? 'Marque pelo menos duas tabelas.' : '';
}

// ---------------------------------------------------------------- calculo
function opcoesAtuais() {
  return { tabelaContrato: $('pacoteContrato').value, usarMini: $('usarMini').checked, incluirValorDeclarado: $('incluirVD').checked };
}

async function calcular() {
  const opcoes = opcoesAtuais();
  const tam = Number(CFG.loteTamanho) || (state.config && state.config.loteMaxLinhas) || 400;
  const total = state.entrada.length;
  const linhas = [];
  $('calcButton').disabled = true;
  $('progresso').hidden = false;
  carregando(true);
  try {
    for (let i = 0; i < total; i += tam) {
      $('progBar').style.width = Math.round((i / total) * 100) + '%';
      $('progTxt').textContent = `Calculando ${int(Math.min(i + tam, total))} de ${int(total)} postagens...`;
      const pedaco = state.entrada.slice(i, i + tam);
      let r;
      try { r = await Api.lote({ ...opcoes, linhas: pedaco }); }
      catch (e) { if (e.status && e.status < 500) throw e; r = await Api.lote({ ...opcoes, linhas: pedaco }); }
      linhas.push(...r.linhas);
      if (i === 0) state.resultado = { vigencia: r.vigencia };
    }
    $('progBar').style.width = '100%';
    state.resultado = { linhas, tabelaContrato: opcoes.tabelaContrato, vigencia: state.resultado.vigencia, opcoes, pacoteNome: pacoteNome() };
    const marcados = cenariosMarcados();
    if (!marcados.includes(state.referencia)) state.referencia = marcados[0];
    state.pagina = 1;
    $('resultado').hidden = false;
    renderResultado();
    $('resultado').scrollIntoView({ behavior: 'smooth', block: 'start' });
    toast(`${int(linhas.length)} postagens comparadas.`);
  } catch (e) {
    toast(e.message, true);
  } finally {
    carregando(false);
    $('progresso').hidden = true;
    atualizarBotaoCalcular();
  }
}

/** Opções mudaram depois do cálculo: o resultado na tela não vale mais. */
function marcarDesatualizado() {
  if (!state.resultado) return;
  const o = state.resultado.opcoes, n = opcoesAtuais();
  const mudou = o.tabelaContrato !== n.tabelaContrato || o.usarMini !== n.usarMini || o.incluirValorDeclarado !== n.incluirValorDeclarado;
  $('resultado').classList.toggle('desatualizado', mudou);
  $('resMeta').dataset.aviso = mudou ? 'Opções alteradas. Clique em Comparar para atualizar.' : '';
  if (!mudou) renderResultado();
}

// ---------------------------------------------------------------- render
function renderResultado() {
  const res = state.resultado;
  if (!res) return;
  const cen = cenariosMarcados();
  if (cen.length < 2) { $('hero').innerHTML = '<p class="cmp-vazio">Marque pelo menos duas tabelas para comparar.</p>'; return; }
  if (!cen.includes(state.referencia)) state.referencia = cen[0];
  const nm = nomes();
  nm.CONTRATO = 'Contrato ' + res.pacoteNome;
  const r = resumir(res.linhas, cen, state.referencia);
  const per = state.periodo.inicio ? `${dataBR(state.periodo.inicio)} a ${dataBR(state.periodo.fim)} | ` : '';
  $('resMeta').textContent = `${per}${int(r.comparaveis)} de ${int(r.linhas)} postagens na comparação | ${state.arquivo}`;

  $('referencia').innerHTML = cen.map((c) => `<option value="${c}"${c === state.referencia ? ' selected' : ''}>${esc(nm[c])}</option>`).join('');

  const ref = r.totais[state.referencia], prop = r.totais[r.proposta];
  const n = Math.max(1, r.comparaveis);
  const ganha = r.economia > 0.009;
  $('hero').innerHTML = ganha
    ? `<div><small>Economia com ${esc(nm[r.proposta])}, contra ${esc(nm[state.referencia])}</small>
        <strong>${brl(r.economia)}</strong><span>${pct((r.economia / ref) * 100)} a menos | ${brl(prop / n)} por envio, antes ${brl(ref / n)}</span></div>`
    : `<div><small>Resultado</small><strong class="menor">${esc(nm[state.referencia])} já é a opção mais barata</strong><span>${brl(ref / n)} por envio</span></div>`;

  $('tiles').innerHTML = cen.map((c) => {
    const dif = c === state.referencia || !ref ? null : ((r.totais[c] - ref) / ref) * 100;
    const cls = c === r.proposta && ganha ? ' melhor' : c === state.referencia ? ' ref' : '';
    return `<div class="cmp-tile${cls}" style="--c:${COR[c]}">
      <span class="t-n">${esc(nm[c])}${c === state.referencia ? ' <em>referência</em>' : ''}</span>
      <strong>${brl(r.totais[c])}</strong>
      <span class="t-s">${brl(r.totais[c] / n)} por envio</span>
      <span class="t-d ${dif == null ? '' : dif < 0 ? 'neg' : 'pos'}">${dif == null ? 'Base da comparação' : (dif > 0 ? '+' : '') + pct(dif) + ' contra a referência'}</span>
    </div>`;
  }).join('');

  const alertas = [];
  if (r.conferencia.verificadas) {
    const ok = r.conferencia.conferem, tot = r.conferencia.verificadas;
    alertas.push([ok === tot ? 'ok' : 'aviso', `Conferência: ${int(ok)} de ${int(tot)} valores pagos no arquivo batem com a tabela à vista do balcão.`]);
  }
  if (r.revisar) alertas.push(['aviso', `${int(r.revisar)} postagens sem cidade, UF ou peso. Veja o filtro "Revisar" na tabela.`]);
  if (r.ignoradas) alertas.push(['info', `${int(r.ignoradas)} postagens de outros serviços (SEDEX 10, SEDEX 12, cartas) ficaram fora.`]);
  if (r.foraDaComparacao) alertas.push(['info', `${int(r.foraDaComparacao)} postagens sem preço em alguma tabela escolhida (peso ou valor declarado acima do limite) ficaram fora dos totais.`]);
  if (cen.includes('CONTRATO') && cen.includes('CLUBE') && res.tabelaContrato === 'PLATINUM') alertas.push(['info', 'Na tabela 2026, Clube Correios e Platinum têm os mesmos preços.']);
  if (r.miniEnvios) alertas.push(['info', `Mini Envios aplicado em ${int(r.miniEnvios)} postagens PAC que cabem no formato.`]);
  $('alerts').innerHTML = alertas.map(([t, m]) => `<p class="cmp-alert ${t}">${esc(m)}</p>`).join('');

  renderGrupos(r, cen, nm);
  const soma = Object.values(r.melhores).reduce((a, b) => a + b, 0) || 1;
  $('melhores').innerHTML = cen.map((c) => `<div class="m-l"><b>${esc(nm[c])}</b><div class="m-t"><i style="width:${(r.melhores[c] / soma * 100).toFixed(1)}%;background:${COR[c]}"></i></div><span>${int(r.melhores[c])}</span></div>`).join('');
  $('melhoresNota').textContent = 'Número de postagens em que cada tabela sai mais barata. Empate conta para a primeira da lista.';
  renderLinhas(cen, nm);
}

function renderGrupos(r, cen, nm) {
  const grupos = r[state.grupo] || [];
  const cab = `<thead><tr><th>${state.grupo === 'porServico' ? 'Serviço' : state.grupo === 'porRegiao' ? 'Destino' : 'Peso'}</th><th class="n">Envios</th>${cen.map((c) => `<th class="n"><i class="dot" style="background:${COR[c]}"></i>${esc(nm[c])}</th>`).join('')}</tr></thead>`;
  const linha = (g, cls = '') => {
    const m = cen.reduce((a, c) => (g.valores[c] < g.valores[a] ? c : a), cen[0]);
    return `<tr class="${cls}"><td>${esc(g.grupo)}</td><td class="n">${int(g.n)}</td>${cen.map((c) => `<td class="n${c === m ? ' melhor' : ''}">${brl(g.valores[c])}</td>`).join('')}</tr>`;
  };
  $('tabGrupos').innerHTML = cab + '<tbody>' + grupos.map((g) => linha(g)).join('') + linha({ grupo: 'Total', n: r.comparaveis, valores: r.totais }, 'tot') + '</tbody>';
}

function linhasFiltradas() {
  const busca = $('busca').value.trim().toUpperCase();
  const svc = $('filtroServico').value, st = $('filtroStatus').value;
  return state.resultado.linhas.filter((l) =>
    (!svc || l.servico === svc) && (!st || l.status === st) &&
    (!busca || `${l.id} ${l.cidade} ${l.uf}`.toUpperCase().includes(busca)));
}

function renderLinhas(cen, nm) {
  const lista = linhasFiltradas();
  const paginas = Math.max(1, Math.ceil(lista.length / POR_PAGINA));
  state.pagina = Math.min(state.pagina, paginas);
  const ini = (state.pagina - 1) * POR_PAGINA;
  const cab = `<thead><tr><th>Objeto</th><th>Destino</th><th>Serviço</th><th class="n">Peso</th><th class="n">Pago</th>${cen.map((c) => `<th class="n"><i class="dot" style="background:${COR[c]}"></i>${esc(nm[c])}</th>`).join('')}</tr></thead>`;
  const corpo = lista.slice(ini, ini + POR_PAGINA).map((l) => {
    const destino = `${esc(l.cidade)}/${esc(l.uf)}`;
    if (l.status !== 'CALCULADO') {
      return `<tr class="st-${l.status.toLowerCase()}"><td>${esc(l.id)}</td><td>${destino}</td><td>${esc(l.servicoOriginal || l.servico)}</td><td class="n">${int(l.pesoG)} g</td><td class="n">${brl(l.valorPago)}</td><td colspan="${cen.length}" class="aviso">${esc(l.aviso || '')}</td></tr>`;
    }
    const m = comparavel(l, cen) ? melhorDaLinha(l, cen) : null;
    const celula = (c) => {
      const v = l[c];
      if (!v || !v.ok) return `<td class="n falta" title="${esc(v ? v.erro : '')}">-</td>`;
      const tags = (v.mini ? '<sup title="Mini Envios">M</sup>' : '') + (v.aviso ? '<sup title="' + esc(v.aviso) + '">!</sup>' : '');
      return `<td class="n${c === m ? ' melhor' : ''}" title="Coluna ${esc(v.coluna)}">${brl(v.total)}${tags}</td>`;
    };
    const confere = l.pagoConfereAvista === false ? ' class="n difere" title="Diferente da tabela à vista"' : ' class="n"';
    return `<tr><td>${esc(l.id)}</td><td>${destino}<small>${esc(l.trecho || '')}</small></td><td>${esc(l.servico)}</td><td class="n">${int(l.pesoG)} g</td><td${confere}>${brl(l.valorPago)}</td>${cen.map(celula).join('')}</tr>`;
  }).join('');
  $('tabLinhas').innerHTML = cab + '<tbody>' + (corpo || `<tr><td colspan="${5 + cen.length}" class="cmp-vazio">Nenhuma postagem com esse filtro.</td></tr>`) + '</tbody>';
  $('paginacao').innerHTML = paginas > 1
    ? `<button class="cmp-btn" data-p="${state.pagina - 1}" ${state.pagina === 1 ? 'disabled' : ''}>Anterior</button><span>Página ${state.pagina} de ${paginas} | ${int(lista.length)} postagens</span><button class="cmp-btn" data-p="${state.pagina + 1}" ${state.pagina === paginas ? 'disabled' : ''}>Próxima</button>`
    : `<span>${int(lista.length)} postagens</span>`;
}

// ---------------------------------------------------------------- exportar
function exportarCsv() {
  if (!state.resultado) return;
  const cen = CENARIOS;
  const nm = nomes();
  const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const num = (v) => (v == null ? '' : String(v).replace('.', ','));
  const cab = ['OBJETO', 'SERVICO', 'CIDADE', 'UF', 'TRECHO', 'PESO_G', 'VALOR_PAGO', ...cen.map((c) => nm[c].toUpperCase()), 'MAIS_BARATO', 'SITUACAO', 'AVISO'];
  const linhas = state.resultado.linhas.map((l) => {
    const ok = cen.filter((c) => l[c] && l[c].ok);
    const melhor = ok.length ? nm[melhorDaLinha(l, ok)] : '';
    return [l.id, l.servico, l.cidade, l.uf, l.trecho || '', l.pesoG, num(l.valorPago), ...cen.map((c) => (l[c] && l[c].ok ? num(l[c].total) : '')), melhor, l.status, l.aviso || ''].map(q).join(';');
  });
  const blob = new Blob(['﻿' + [cab.map(q).join(';'), ...linhas].join('\n')], { type: 'text/csv;charset=utf-8' });
  baixar(blob, 'comparativo_' + state.arquivo.replace(/\.csv$/i, '') + '.csv');
}

function baixar(blob, nome) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

// ---------------------------------------------------------------- pdf
function abrirPdf() {
  if (!state.resultado) { toast('Carregue o CSV e clique em Comparar antes de gerar o PDF.', true); return; }
  if ($('resultado').classList.contains('desatualizado')) { toast('As opções mudaram. Clique em Comparar para atualizar antes do PDF.', true); return; }
  const nm = nomes(); nm.CONTRATO = 'Contrato ' + state.resultado.pacoteNome;
  const marcados = cenariosMarcados();
  $('pdfCenarios').innerHTML = CENARIOS.map((c) => `<label style="--c:${COR[c]}"><input type="checkbox" value="${c}"${marcados.includes(c) ? ' checked' : ''}/><i></i>${esc(nm[c])}</label>`).join('');
  atualizarDialogo();
  mensagem($('pdfMsg'), '');
  $('pdfDialog').showModal();
  $('pdfCliente').focus();
}

function cenariosPdf() {
  return [...$('pdfCenarios').querySelectorAll('input:checked')].map((i) => i.value);
}

function atualizarDialogo() {
  const nm = nomes(); nm.CONTRATO = 'Contrato ' + state.resultado.pacoteNome;
  const cen = cenariosPdf();
  const atual = $('pdfReferencia').value || state.referencia;
  $('pdfReferencia').innerHTML = cen.map((c) => `<option value="${c}"${c === atual ? ' selected' : ''}>${esc(nm[c])}</option>`).join('');
  if (cen.length < 2) { $('pdfPrevia').innerHTML = '<p class="cmp-alert aviso">Marque pelo menos dois comparativos.</p>'; $('pdfGerar').disabled = $('pdfImprimir').disabled = true; return; }
  $('pdfGerar').disabled = $('pdfImprimir').disabled = false;
  const r = resumir(state.resultado.linhas, cen, $('pdfReferencia').value);
  const ganha = r.economia > 0.009;
  $('pdfPrevia').innerHTML = `<p><b>${int(r.comparaveis)}</b> postagens no PDF. ${ganha
    ? `Mais econômico: <b>${esc(nm[r.proposta])}</b>, ${brl(r.economia)} a menos que ${esc(nm[$('pdfReferencia').value])}.`
    : `${esc(nm[$('pdfReferencia').value])} já é a opção mais barata.`}</p>`;
}

function pedidoRelatorio() {
  const cliente = $('pdfCliente').value.trim();
  if (!cliente) { mensagem($('pdfMsg'), 'Digite o nome do cliente que vai aparecer no PDF.'); $('pdfCliente').focus(); return null; }
  const cen = cenariosPdf();
  if (cen.length < 2) { mensagem($('pdfMsg'), 'Marque pelo menos dois comparativos.'); return null; }
  const nm = nomes(); nm.CONTRATO = 'Contrato ' + state.resultado.pacoteNome;
  return montarRelatorio({
    linhas: state.resultado.linhas, cenarios: cen, referencia: $('pdfReferencia').value, nomes: nm, cliente,
    preparadoPor: $('pdfPreparado').value.trim() || 'AGF José Bonifácio', validadeDias: Number($('pdfValidade').value) || 15,
    periodo: state.periodo, pacoteNome: state.resultado.pacoteNome, vigencia: state.resultado.vigencia,
    incluirValorDeclarado: state.resultado.opcoes.incluirValorDeclarado,
  });
}

async function gerarPdf(ev) {
  ev.preventDefault();
  const rel = pedidoRelatorio();
  if (!rel) return;
  mensagem($('pdfMsg'), '');
  const btn = $('pdfGerar');
  btn.disabled = true; btn.classList.add('busy');
  carregando(true);
  try {
    const resp = await Api.pdf(rel);
    const blob = await resp.blob();
    const nome = (resp.headers.get('content-disposition') || '').match(/filename="([^"]+)"/);
    baixar(blob, nome ? nome[1] : 'Estudo_de_frete.pdf');
    toast('PDF gerado.');
    $('pdfDialog').close();
  } catch (e) {
    mensagem($('pdfMsg'), esc(e.message) + (e.codigo === 'PDF_INDISPONIVEL' ? ' Use "Abrir para imprimir" e salve como PDF.' : ''));
  } finally {
    btn.disabled = false; btn.classList.remove('busy');
    carregando(false);
  }
}

async function imprimir() {
  const rel = pedidoRelatorio();
  if (!rel) return;
  const janela = window.open('', '_blank');
  if (!janela) { mensagem($('pdfMsg'), 'O navegador bloqueou a nova janela. Libere pop-ups para este site.'); return; }
  janela.document.write('<p style="font-family:sans-serif;padding:24px">Montando o estudo...</p>');
  try {
    const resp = await Api.relatorioHtml(rel);
    const html = await resp.text();
    janela.document.open(); janela.document.write(html); janela.document.close();
    janela.onload = () => setTimeout(() => janela.print(), 400);
  } catch (e) {
    janela.close();
    mensagem($('pdfMsg'), esc(e.message));
  }
}

// ---------------------------------------------------------------- eventos
function ligarEventos() {
  $('csvFile').addEventListener('change', (e) => { lerArquivo(e.target.files && e.target.files[0]); e.target.value = ''; });
  const drop = $('dropZone');
  drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('sobre'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('sobre'));
  drop.addEventListener('drop', (e) => { e.preventDefault(); drop.classList.remove('sobre'); lerArquivo(e.dataTransfer.files && e.dataTransfer.files[0]); });
  $('sampleButton').addEventListener('click', usarExemplo);
  document.querySelectorAll('.cmp-cen input').forEach((i) => i.addEventListener('change', () => { atualizarBotaoCalcular(); if (state.resultado) renderResultado(); }));
  ['pacoteContrato', 'usarMini', 'incluirVD'].forEach((id) => $(id).addEventListener('change', marcarDesatualizado));
  $('calcButton').addEventListener('click', calcular);
  $('referencia').addEventListener('change', (e) => { state.referencia = e.target.value; renderResultado(); });
  document.querySelectorAll('.cmp-tabs button').forEach((b) => b.addEventListener('click', () => {
    document.querySelectorAll('.cmp-tabs button').forEach((x) => x.setAttribute('aria-selected', String(x === b)));
    state.grupo = b.dataset.g; renderResultado();
  }));
  ['busca', 'filtroServico', 'filtroStatus'].forEach((id) => $(id).addEventListener('input', () => { state.pagina = 1; renderResultado(); }));
  $('paginacao').addEventListener('click', (e) => { const p = e.target.closest('[data-p]'); if (p && !p.disabled) { state.pagina = Number(p.dataset.p); renderResultado(); } });
  $('exportButton').addEventListener('click', exportarCsv);
  $('pdfButton').addEventListener('click', abrirPdf);
  $('pdfFechar').addEventListener('click', () => $('pdfDialog').close());
  $('pdfCenarios').addEventListener('change', atualizarDialogo);
  $('pdfReferencia').addEventListener('change', atualizarDialogo);
  $('pdfForm').addEventListener('submit', gerarPdf);
  $('pdfImprimir').addEventListener('click', imprimir);
  $('pdfDialog').addEventListener('click', (e) => { if (e.target === $('pdfDialog')) $('pdfDialog').close(); });
}

ligarEventos();
carregarConfig();
