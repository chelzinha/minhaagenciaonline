/* =====================================================
   COMPARADOR - RELATORIO COMERCIAL (HTML A4, 3 paginas)
   Gera o HTML do estudo de frete a partir do resumo montado na tela.
   O PDF sai deste HTML (pdf.js). Sem dado sensivel: so totais e exemplos.
   Sistema visual: AGF_SISTEMA_VISUAL_DOCUMENTOS v3.3 (Poppins + Inter, tinta #00416b, amarelo #FFD100).
   Regra de impressao: so fundo branco. Nada de cor chapada; destaque por borda e cor de texto.
   ===================================================== */
import { LOGO_AGF } from './logo.js';

export const CENARIOS = ['AVISTA', 'CONTRATO', 'CLUBE', 'APP'];
const COR = { AVISTA: '#94A3B8', CONTRATO: '#0D9488', CLUBE: '#0078D4', APP: '#D97706' };
const CONTATO = {
  nome: 'AGF José Bonifácio',
  endereco: 'Av. Aguanambi, 674, José Bonifácio, Fortaleza/CE',
  telefone: '(85) 92002-3386',
  email: 'agfjosebonifacio@gmail.com',
};

// ---------------------------------------------------------------- helpers
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const n2 = (v) => Math.round((Number(v) + Number.EPSILON) * 100) / 100;
const brl = (v, cent = true) => 'R$ ' + Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: cent ? 2 : 0, maximumFractionDigits: cent ? 2 : 0 });
const pct = (v) => Math.round(Number(v) || 0).toLocaleString('pt-BR') + '%';
const inteiro = (v) => Number(v || 0).toLocaleString('pt-BR');
const dataBR = (iso) => { const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? `${m[3]}/${m[2]}/${m[1]}` : ''; };
const kg = (g) => (Number(g || 0) / 1000).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' kg';

/** Valida e normaliza o pedido de relatorio vindo da tela. */
export function validarRelatorio(p) {
  const falha = (m) => { throw Object.assign(new Error(m), { status: 422 }); };
  const r = p && typeof p === 'object' ? p : falha('Relatório vazio.');
  const cliente = String(r.cliente || '').trim().slice(0, 80);
  if (!cliente) falha('Informe o nome do cliente que vai aparecer no PDF.');
  const cenarios = CENARIOS.filter((c) => Array.isArray(r.cenarios) && r.cenarios.includes(c));
  if (cenarios.length < 2) falha('Selecione pelo menos dois comparativos.');
  const referencia = cenarios.includes(r.referencia) ? r.referencia : cenarios[0];
  const totais = {};
  for (const c of cenarios) {
    const v = Number(r.totais && r.totais[c]);
    if (!Number.isFinite(v) || v < 0) falha('Total ausente para ' + c + '.');
    totais[c] = n2(v);
  }
  const nomes = {};
  for (const c of cenarios) nomes[c] = String((r.nomes && r.nomes[c]) || c).slice(0, 40);
  const grupo = (lista) => (Array.isArray(lista) ? lista : []).slice(0, 8).map((g) => ({
    grupo: String(g.grupo || '').slice(0, 40), n: Number(g.n) || 0,
    valores: Object.fromEntries(cenarios.map((c) => [c, n2(g.valores && g.valores[c])])),
  }));
  const exemplos = (Array.isArray(r.exemplos) ? r.exemplos : []).slice(0, 8).map((e) => ({
    servico: String(e.servico || '').slice(0, 10), destino: String(e.destino || '').slice(0, 40), pesoG: Number(e.pesoG) || 0,
    valores: Object.fromEntries(cenarios.map((c) => [c, n2(e.valores && e.valores[c])])),
    mini: !!e.mini,
  }));
  return {
    cliente, cenarios, referencia, totais, nomes,
    preparadoPor: String(r.preparadoPor || CONTATO.nome).trim().slice(0, 60),
    validadeDias: Math.min(90, Math.max(1, Number(r.validadeDias) || 15)),
    postagens: Number(r.postagens) || 0,
    periodo: { inicio: String(r.periodo?.inicio || ''), fim: String(r.periodo?.fim || '') },
    porServico: grupo(r.porServico), porRegiao: grupo(r.porRegiao), porPeso: grupo(r.porPeso),
    exemplos,
    miniEnvios: Number(r.miniEnvios) || 0,
    melhores: Object.fromEntries(cenarios.map((c) => [c, Math.max(0, Number(r.melhores && r.melhores[c]) || 0)])),
    pacoteContrato: String(r.pacoteContrato || 'Platinum').slice(0, 30),
    vigencia: String(r.vigencia || ''),
    incluirValorDeclarado: r.incluirValorDeclarado !== false,
    emitidoEm: String(r.emitidoEm || new Date().toISOString().slice(0, 10)),
  };
}

function diasPeriodo(p) {
  const a = Date.parse(p.inicio), b = Date.parse(p.fim);
  return Number.isFinite(a) && Number.isFinite(b) && b >= a ? Math.round((b - a) / 86400000) + 1 : 0;
}

function addDias(iso, d) {
  const t = Date.parse(iso);
  return Number.isFinite(t) ? new Date(t + d * 86400000).toISOString().slice(0, 10) : '';
}

// ---------------------------------------------------------------- blocos
const ICONES = {
  cal: '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M8 3v4M16 3v4M3 10h18"/><path d="M8 14h3" stroke="#f2a900"/>',
  tag: '<path d="M20 13 11.5 21.5a2 2 0 0 1-2.8 0L2.5 15.3a2 2 0 0 1 0-2.8L11 4h7a2 2 0 0 1 2 2z"/><circle cx="16" cy="8" r="1.6" stroke="#f2a900"/>',
  escudo: '<path d="M12 3 4.5 6v5.5c0 4.6 3.2 8.3 7.5 9.5 4.3-1.2 7.5-4.9 7.5-9.5V6z"/><path d="m8.8 12 2.2 2.2 4.2-4.4" stroke="#f2a900"/>',
  caixa: '<path d="m12 2.8 8.5 4.6v9.2L12 21.2l-8.5-4.6V7.4z"/><path d="M3.8 7.6 12 12l8.2-4.4M12 12v9"/><path d="m7.6 5.1 8.4 4.6" stroke="#f2a900"/>',
  celular: '<rect x="6.5" y="2.5" width="11" height="19" rx="2.6"/><path d="M10 5.5h4"/><path d="M11 18.5h2" stroke="#f2a900"/>',
  regua: '<rect x="2.8" y="8" width="18.4" height="8" rx="2.4"/><path d="M7 8v3M11 8v4M15 8v3M19 8v4" stroke="#f2a900"/>',
  seta: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  ideia: '<path d="M9 18h6M10 21.5h4"/><path d="M8.5 15.5A7 7 0 1 1 15.5 15.5c-.8.7-1.5 1.4-1.5 2.5h-4c0-1.1-.7-1.8-1.5-2.5Z"/><path d="M12 7v3" stroke="#f2a900"/>',
};
const ic = (nome, tam = 22, cor = '#00416b', traco = 1.9) =>
  `<svg width="${tam}" height="${tam}" viewBox="0 0 24 24" fill="none" stroke="${cor}" stroke-width="${traco}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONES[nome]}</svg>`;

function beneficios(r, proposta) {
  if (proposta === 'CONTRATO') {
    const itens = [
      ['cal', 'Pagamento por fatura mensal', 'Sem acerto no balcão a cada envio.'],
      ['tag', 'Etiqueta pronta antes de sair', 'A postagem chega identificada e o atendimento fica mais rápido.'],
      ['escudo', 'Valor declarado mais barato', 'Taxa de 1% no contrato, contra 2% no balcão e no App.'],
      ['caixa', 'Mini Envios liberado', 'Tarifa própria para objetos leves e pequenos.'],
    ];
    return itens;
  }
  if (proposta === 'APP') {
    return [
      ['celular', 'Pré-postagem pelo celular', 'Os dados do envio são preenchidos no App antes de chegar à agência.'],
      ['regua', 'Preço pelo tamanho da caixa', 'O App cobra o peso cúbico. Caixa justa ao produto deixa o envio mais barato.'],
      ['tag', 'Atendimento mais rápido', 'A postagem já chega registrada e só é conferida no balcão.'],
      ['cal', 'Sem contrato', 'Pagamento no próprio App, a cada envio.'],
    ];
  }
  return [];
}

function proximosPassos(proposta) {
  if (proposta === 'CONTRATO' || proposta === 'CLUBE') {
    return [
      ['Aceite da proposta', 'Confirme por WhatsApp ou e-mail com a AGF.'],
      ['Cadastro', 'A AGF envia a lista de documentos e cuida do cadastro com os Correios.'],
      ['Primeira postagem', 'Acesso ao sistema de etiquetas e orientação na primeira remessa.'],
    ];
  }
  if (proposta === 'APP') {
    return [
      ['Baixe o App', 'App Correios, disponível para Android e iPhone.'],
      ['Faça a pré-postagem', 'Informe remetente, destinatário, peso e medidas da caixa.'],
      ['Poste na AGF', 'Traga o objeto com o código da pré-postagem.'],
    ];
  }
  return [];
}

function premissas(r) {
  const t = [];
  t.push(`Tabelas dos Correios com vigência a partir de ${dataBR(r.vigencia) || '12/04/2026'}, origem Fortaleza/CE.`);
  if (r.cenarios.some((c) => c === 'AVISTA' || c === 'CONTRATO' || c === 'CLUBE')) t.push('Balcão e contrato: peso cobrado é o maior entre o real e o cúbico (divisor 6000), quando o cúbico passa de 5 kg.');
  if (r.cenarios.includes('APP')) t.push('Correios App: cobra sempre o peso cúbico (divisor 7000), mesmo quando o peso real é maior.');
  t.push(r.incluirValorDeclarado ? 'Valor declarado incluído quando informado na postagem.' : 'Valor declarado não incluído na comparação.');
  if ((r.cenarios.includes('CONTRATO') || r.cenarios.includes('CLUBE')) && r.miniEnvios > 0) t.push(`Mini Envios aplicado em ${inteiro(r.miniEnvios)} envios PAC leves que cabem no formato.`);
  t.push('Estimativa comercial. A tarifa final é a da tabela vigente na data de cada postagem.');
  return t;
}

function barras(r, grupos) {
  if (!grupos.length) return '';
  const max = Math.max(1, ...grupos.flatMap((g) => r.cenarios.map((c) => g.valores[c] || 0)));
  return grupos.map((g) => {
    const ref = g.valores[r.referencia] || 0;
    const outros = r.cenarios.filter((c) => c !== r.referencia);
    const melhor = outros.reduce((a, c) => ((g.valores[c] || 0) < (g.valores[a] || 0) ? c : a), outros[0]);
    const dif = ref > 0 ? ((g.valores[melhor] - ref) / ref) * 100 : 0;
    return `<div class="br">
      <div class="br-l"><b>${esc(g.grupo)}</b><span>${inteiro(g.n)} envios</span></div>
      <div class="br-t">${r.cenarios.map((c) => `<i style="width:${((g.valores[c] || 0) / max * 100).toFixed(1)}%;background:${COR[c]}"></i>`).join('')}</div>
      <div class="br-v"><b class="${dif < 0 ? 'neg' : 'pos'}">${dif < 0 ? '' : '+'}${pct(dif)}</b><span>${esc(r.nomes[melhor])}</span></div>
    </div>`;
  }).join('');
}

function legenda(r) {
  return `<div class="leg">${r.cenarios.map((c) => `<span><i style="background:${COR[c]}"></i>${esc(r.nomes[c])}</span>`).join('')}</div>`;
}

// ---------------------------------------------------------------- html
export function montarHtmlRelatorio(pedido) {
  const r = validarRelatorio(pedido);
  const ref = r.referencia;
  const outros = r.cenarios.filter((c) => c !== ref);
  const proposta = outros.reduce((a, c) => (r.totais[c] < r.totais[a] ? c : a), outros[0]);
  const totalRef = r.totais[ref], totalProp = r.totais[proposta];
  const economia = n2(totalRef - totalProp);
  const economiaPct = totalRef > 0 ? (economia / totalRef) * 100 : 0;
  const dias = diasPeriodo(r.periodo);
  const anual = dias >= 28 ? (economia / dias) * 365 : 0;
  const n = Math.max(1, r.postagens);
  const ganha = economia > 0.009;
  const periodoTxt = r.periodo.inicio && r.periodo.fim ? `${dataBR(r.periodo.inicio)} a ${dataBR(r.periodo.fim)}` : '';
  const validade = dataBR(addDias(r.emitidoEm, r.validadeDias));
  const titulo = ganha ? `Quanto o seu frete custaria<br>com ${esc(r.nomes[proposta])}` : 'Comparativo de tarifas<br>do seu frete';

  const hero = ganha ? `
    <div class="hero">
      <div class="rot">Economia estimada no período</div>
      <div class="big">${brl(economia)}<small>${pct(economiaPct)} a menos</small></div>
      <div class="linha">
        ${anual > 0 ? `<div class="am"><b>${brl(anual, false)}</b><span>projeção em 12 meses, no mesmo ritmo</span></div>` : ''}
        <div><b>${brl(totalProp / n)}</b><span>custo médio por envio, antes ${brl(totalRef / n)}</span></div>
      </div>
    </div>` : `
    <div class="hero neutro">
      <div class="rot">Resultado</div>
      <div class="big menor">${esc(r.nomes[ref])} já é a opção mais econômica</div>
      <div class="linha"><div><b>${brl(totalRef / n)}</b><span>custo médio por envio no período</span></div></div>
    </div>`;

  const tickets = r.cenarios.map((c) => {
    const dif = totalRef > 0 && c !== ref ? ((r.totais[c] - totalRef) / totalRef) * 100 : null;
    const tag = c === ref ? 'Referência' : c === proposta && ganha ? 'Mais econômico' : '';
    return `<div class="ticket ${c === proposta && ganha ? 'prop' : ''} ${c === ref ? 'ref' : ''}">
      <div class="t-h"><b>${esc(r.nomes[c])}</b>${tag ? `<span class="tag">${tag}</span>` : ''}</div>
      <div class="t-v">${brl(r.totais[c])}</div>
      <dl><dt>Por envio</dt><dd>${brl(r.totais[c] / n)}</dd>
      <dt>${c === ref ? 'Base' : 'Diferença'}</dt><dd class="${dif != null && dif < 0 ? 'neg' : ''}">${dif == null ? '-' : (dif > 0 ? '+' : '') + pct(dif)}</dd></dl>
    </div>`;
  }).join('');

  const somaMelhores = r.cenarios.reduce((a, c) => a + r.melhores[c], 0);
  const blocoMelhores = somaMelhores > 0 ? `<div class="rot ganha-t">Opção mais barata em cada envio</div>
    <div class="ganha">${r.cenarios.map((c) => `<div class="g-l"><b>${esc(r.nomes[c])}</b>
      <div class="g-t"><i style="width:${(r.melhores[c] / somaMelhores * 100).toFixed(1)}%;background:${COR[c]}"></i></div>
      <span>${inteiro(r.melhores[c])} ${r.melhores[c] === 1 ? 'envio' : 'envios'}</span></div>`).join('')}</div>` : '';
  const bens = ganha ? beneficios(r, proposta) : [];
  const blocoBens = bens.length ? `<div class="rot ben-t">O que muda na rotina</div>
    <div class="ben">${bens.map(([i, t, d]) => `<div class="it"><div class="ic">${ic(i)}</div><div><b>${esc(t)}</b><p>${esc(d)}</p></div></div>`).join('')}</div>` : '';

  // Destaque: o menor valor de cada linha
  const menor = (v) => r.cenarios.reduce((a, c) => (v[c] < v[a] ? c : a), r.cenarios[0]);
  const celulas = (v, extra = () => '') => { const m = menor(v); return r.cenarios.map((c) => `<td class="n ${c === m ? 'destaque' : ''}">${brl(v[c])}${extra(c)}</td>`).join(''); };
  const servicos = r.porServico.map((g) => `<tr><td><b>${esc(g.grupo)}</b><span class="sub">${inteiro(g.n)} envios</span></td>${celulas(g.valores)}</tr>`).join('');
  const totalLinha = `<tr class="tot"><td><b>Total</b><span class="sub">${inteiro(r.postagens)} envios</span></td>${celulas(r.totais)}</tr>`;

  const maxEx = r.cenarios.length >= 4 ? 5 : 6;
  const exemplos = r.exemplos.slice(0, maxEx).map((e) => `<tr><td><span class="sv ${e.servico.toLowerCase()}">${esc(e.servico)}</span></td><td>${esc(e.destino)}</td><td class="n">${kg(e.pesoG)}</td>${celulas(e.valores, (c) => ((c === 'CONTRATO' || c === 'CLUBE') && e.mini ? '<sup>M</sup>' : ''))}</tr>`).join('');
  const passos = ganha ? proximosPassos(proposta) : [];
  const cols = r.cenarios.map((c) => `<th class="n">${esc(r.nomes[c])}</th>`).join('');

  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Estudo de frete - ${esc(r.cliente)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Poppins:wght@600;700;800&display=swap" rel="stylesheet">
<style>${CSS}</style></head><body>
<section class="pagina">
  <div class="faixa-topo"><img src="${LOGO_AGF}" alt="AGF José Bonifácio"><span class="chip">Estudo de frete</span></div>
  <div class="para">
    <div><div class="rot">Preparado para</div><div class="quem">${esc(r.cliente)}</div></div>
    <div class="meta">Base: <b>${inteiro(r.postagens)} postagens</b>${periodoTxt ? `<br>${periodoTxt}` : ''}<br>Origem: Fortaleza/CE<br>Emitido em ${dataBR(r.emitidoEm)}</div>
  </div>
  <h1>${titulo}</h1>
  ${hero}
  <div class="tickets n${r.cenarios.length}">${tickets}</div>
  ${blocoMelhores}
  ${blocoBens}
  <div class="rodape"><span>${esc(r.preparadoPor)}</span><b>1/3</b></div>
</section>
<section class="pagina">
  <div class="filete"></div>
  <div class="sec"><h2>Onde a diferença aparece</h2><p>Valores do período analisado</p></div>
  <table><thead><tr><th>Serviço</th>${cols}</tr></thead><tbody>${servicos}${totalLinha}</tbody></table>
  <div class="sec"><h2>Por destino</h2>${legenda(r)}</div>
  <div class="bars">${barras(r, r.porRegiao)}</div>
  <div class="sec"><h2>Por peso</h2>${legenda(r)}</div>
  <div class="bars">${barras(r, r.porPeso)}</div>
  <p class="nota">Percentual: diferença da opção mais barata de cada linha em relação a ${esc(r.nomes[ref])}. Nas tabelas, o menor valor de cada linha aparece em verde.</p>
  <div class="rodape"><span>Estudo de frete, ${esc(r.cliente)}</span><b>2/3</b></div>
</section>
<section class="pagina">
  <div class="filete"></div>
  ${exemplos ? `<div class="sec"><h2>Exemplos do seu histórico</h2><p>Mesmo objeto, mesmo destino</p></div>
  <table class="ex"><thead><tr><th>Serviço</th><th>Destino</th><th class="n">Peso</th>${cols}</tr></thead><tbody>${exemplos}</tbody></table>
  ${r.exemplos.some((e) => e.mini) ? '<p class="nota"><sup>M</sup> Enviado como Mini Envios.</p>' : ''}` : ''}
  ${passos.length ? `<div class="sec"><h2>Como começar</h2><p>Três etapas</p></div>
  <div class="passos">${passos.map(([t, d], i) => `<div class="passo"><div class="n">${i + 1}</div><b>${esc(t)}</b><p>${esc(d)}</p></div>`).join('')}</div>` : ''}
  <div class="sec"><h2>Premissas do cálculo</h2><p>Para conferência</p></div>
  <div class="prem">${premissas(r).map((t) => `<div class="li"><i></i><p>${esc(t)}</p></div>`).join('')}</div>
  <div class="contato">
    <div><h2>Fale com a ${esc(CONTATO.nome)}</h2><p>${esc(CONTATO.endereco)}<br>${esc(CONTATO.telefone)} | ${esc(CONTATO.email)}</p></div>
    <div class="val"><span>Proposta válida até</span><b>${validade}</b></div>
  </div>
  <div class="fecho">${esc(CONTATO.nome)}<i></i><span>Agência de Correios Franqueada</span></div>
</section>
</body></html>`;
}

const CSS = `
:root{--tinta:#00416b;--azul:#0078D4;--grafite:#374151;--apoio:#6B7280;--fio:#E5E7EB;--fio-forte:#D7DEE6;--neutro:#F5F7FA;
--amarelo:#FFD100;--ouro:#f2a900;--turquesa:#0D9488;--turquesa-f:#E6F8F6;--amarelo-f:#FFF8D6;--azul-f:#E6F1FB;
--f-tit:'Poppins','Segoe UI',Arial,sans-serif;--f-txt:'Inter','Segoe UI',Roboto,Arial,sans-serif}
*{margin:0;padding:0;box-sizing:border-box}
@page{size:210mm 297mm;margin:0}
html,body{background:#fff}
body{font-family:var(--f-txt);color:var(--grafite);font-size:14.5px;line-height:1.5;-webkit-font-smoothing:antialiased;font-variant-numeric:tabular-nums;
 -webkit-print-color-adjust:exact;print-color-adjust:exact}
.pagina{position:relative;width:210mm;height:297mm;padding:56px 60px 92px;overflow:hidden;display:flex;flex-direction:column;break-after:page;page-break-after:always}
.pagina:last-child{break-after:auto;page-break-after:auto}
.faixa-topo{background:#fff;margin:-56px -60px 0;padding:20px 60px 16px;display:flex;align-items:center;justify-content:space-between;border-bottom:3px solid var(--amarelo)}
.faixa-topo img{height:30px;display:block}
.chip{font-family:var(--f-tit);font-weight:700;font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:var(--tinta);background:#fff;border:2px solid var(--tinta);padding:8px 16px;border-radius:999px}
.filete{position:absolute;left:60px;right:60px;top:28px;height:0;border-top:3px solid var(--amarelo)}
.rodape{position:absolute;left:60px;right:60px;bottom:44px;display:flex;justify-content:space-between;border-top:1px solid var(--fio);padding-top:10px;font-size:12px;color:var(--apoio)}
.rodape b{font-family:var(--f-tit);color:var(--tinta);font-size:14px}
.rot{font-family:var(--f-tit);font-weight:700;font-size:11px;letter-spacing:.15em;text-transform:uppercase;color:var(--apoio)}
h1{font-family:var(--f-tit);font-weight:800;font-size:34px;line-height:1.08;letter-spacing:-.03em;color:var(--tinta);margin-top:20px}
h2{font-family:var(--f-tit);font-weight:700;font-size:20px;letter-spacing:-.02em;color:var(--tinta);line-height:1.2}
.para{margin-top:26px;display:flex;justify-content:space-between;align-items:flex-end;gap:24px}
.quem{font-family:var(--f-tit);font-weight:600;font-size:21px;color:var(--tinta);margin-top:10px;line-height:1.2}
.meta{text-align:right;font-size:12.5px;color:var(--apoio);line-height:1.6}
.meta b{color:var(--tinta);font-weight:600}
.hero{margin-top:20px;background:#fff;border:2.5px solid var(--tinta);border-radius:22px;padding:22px 28px 20px;color:var(--tinta);position:relative;overflow:hidden}
.hero::before{content:"";position:absolute;left:0;top:18px;bottom:18px;width:0;border-left:5px solid var(--amarelo);border-radius:0 4px 4px 0}
.hero .rot{color:#8a5a00}
.hero .big{font-family:var(--f-tit);font-weight:800;font-size:50px;line-height:1;letter-spacing:-.035em;margin-top:10px;position:relative;z-index:1}
.hero .big small{font-size:19px;font-weight:600;letter-spacing:-.01em;color:#0B5E58;margin-left:10px}
.hero .big.menor{font-size:28px;letter-spacing:-.02em}
.hero .linha{display:flex;gap:34px;margin-top:16px;padding-top:14px;border-top:1.5px dashed var(--fio-forte);position:relative;z-index:1}
.hero .linha div{display:flex;flex-direction:column}
.hero .linha b{font-family:var(--f-tit);font-weight:700;font-size:22px;letter-spacing:-.02em}
.hero .linha span{font-size:12px;color:var(--apoio)}
.hero .linha .am b{color:#0B5E58}
.tickets{display:grid;gap:14px;margin-top:20px}
.tickets.n2{grid-template-columns:1fr 1fr}.tickets.n3{grid-template-columns:repeat(3,1fr)}.tickets.n4{grid-template-columns:repeat(4,1fr);gap:10px}
.ticket{position:relative;border:2px solid var(--fio-forte);border-bottom:0;border-radius:16px 16px 0 0;padding:16px 16px 22px;background:#fff}
.ticket::after{content:"";position:absolute;left:-2px;right:-2px;bottom:-10px;height:12px;
 background:radial-gradient(circle at 7px -1px,transparent 7px,var(--fio-forte) 7px 9px,transparent 9px) 0 0/14px 12px repeat-x}
.ticket .t-h{display:flex;justify-content:space-between;align-items:flex-start;gap:6px;min-height:36px}
.ticket .t-h b{font-family:var(--f-tit);font-weight:700;font-size:14px;color:var(--tinta);line-height:1.2}
.ticket .t-v{font-family:var(--f-tit);font-weight:800;font-size:25px;letter-spacing:-.03em;color:var(--tinta);margin-top:6px;line-height:1.1}
.tickets.n4 .t-v{font-size:19px}
.tickets.n4 .t-h b{font-size:12.5px}
.tickets.n4 .ticket{padding:14px 12px 20px}
.tickets.n4 dl{font-size:11px}
.ticket .t-v,.ticket dd{white-space:nowrap}
.ticket dl{margin-top:12px;border-top:1.5px dashed var(--fio-forte);padding-top:9px;display:grid;grid-template-columns:1fr auto;row-gap:4px;font-size:12px}
.ticket dt{color:var(--apoio)}.ticket dd{font-weight:600;color:var(--grafite);text-align:right}
.ticket dd.neg{color:#0B5E58}
.ticket.prop{border-color:var(--turquesa);border-width:3px;background:#fff}
.ticket.prop::after{background:radial-gradient(circle at 7px -1px,transparent 7px,var(--turquesa) 7px 9px,transparent 9px) 0 0/14px 12px repeat-x}
.ticket.prop .t-v{color:#0B5E58}
.tag{font-family:var(--f-tit);font-weight:700;font-size:8.5px;letter-spacing:.1em;text-transform:uppercase;padding:3px 6px;border-radius:5px;background:#fff;border:1.5px solid var(--fio-forte);color:var(--apoio);white-space:nowrap}
.ticket.prop .tag{border-color:var(--turquesa);color:#0B5E58}
.ganha-t{margin-top:24px;margin-bottom:10px}
.ganha{display:grid;gap:7px}
.g-l{display:grid;grid-template-columns:150px 1fr 80px;gap:12px;align-items:center;font-size:12.5px}
.g-l b{font-family:var(--f-tit);font-weight:600;color:var(--tinta);font-size:12.5px}
.g-l span{text-align:right;color:var(--apoio)}
.g-t{height:10px;background:#fff;border:1px solid var(--fio-forte);border-radius:5px;overflow:hidden}
.g-t i{display:block;height:100%;border-radius:5px}
.ben-t{margin-top:auto;padding-top:18px;margin-bottom:12px}
.ben{display:grid;grid-template-columns:1fr 1fr;gap:12px 22px}
.ben .it{display:grid;grid-template-columns:40px 1fr;gap:12px;align-items:start}
.ben .ic{width:40px;height:40px;border-radius:12px;background:#fff;border:1.5px solid var(--ouro);display:grid;place-items:center}
.ben b{font-family:var(--f-tit);font-weight:600;font-size:13.5px;color:var(--tinta);display:block;line-height:1.25}
.ben p{font-size:12px;color:var(--apoio);line-height:1.4;margin-top:2px}
.sec{display:flex;align-items:baseline;justify-content:space-between;gap:16px;padding-bottom:9px;border-bottom:3px solid var(--tinta);margin-top:26px}
.pagina>.filete+.sec{margin-top:6px}
.sec p{font-size:12.5px;color:var(--apoio)}
table{width:100%;border-collapse:separate;border-spacing:0;margin-top:14px;font-size:12.5px;border:2px solid var(--tinta);border-radius:12px;overflow:hidden}
th{font-family:var(--f-tit);font-weight:700;font-size:9.5px;letter-spacing:.1em;text-transform:uppercase;color:var(--tinta);background:#fff;text-align:left;padding:9px 10px;border-bottom:2px solid var(--tinta);box-shadow:inset 0 -5px 0 -2px var(--amarelo)}
th.n,td.n{text-align:right;white-space:nowrap}
td{padding:8px 10px;border-bottom:1px solid var(--fio);vertical-align:middle}
tr:last-child td{border-bottom:0}
td+td{border-left:1px solid var(--fio)}
th+th{border-left:1px solid var(--fio)}
td .sub{display:block;font-size:11px;color:var(--apoio)}
td b{color:var(--tinta);font-weight:600}
td.destaque{color:#0B5E58;font-weight:700}
tr.tot td{border-top:2px solid var(--tinta);font-weight:700}
.sv{font-family:var(--f-tit);font-weight:700;font-size:9.5px;letter-spacing:.08em;padding:2px 6px;border-radius:5px;border:1.5px solid;background:#fff}
.sv.pac{color:var(--azul)}.sv.sedex{color:#8a5a00}
sup{font-size:8px;color:var(--turquesa);font-weight:700;margin-left:2px}
.leg{display:flex;flex-wrap:wrap;gap:6px 14px;font-size:11px;color:var(--apoio)}
.leg i{display:inline-block;width:10px;height:10px;border-radius:3px;vertical-align:-1px;margin-right:5px}
.bars{margin-top:12px;display:grid;gap:9px}
.br{display:grid;grid-template-columns:190px 1fr 118px;gap:14px;align-items:center}
.br-l b{display:block;font-family:var(--f-tit);font-weight:600;font-size:12.5px;color:var(--tinta);line-height:1.2}
.br-l span{font-size:11px;color:var(--apoio)}
.br-t{display:flex;flex-direction:column;gap:2px}
.br-t i{display:block;height:6px;border-radius:3px;min-width:2px}
.br-v{text-align:right;line-height:1.15}
.br-v b{display:block;font-family:var(--f-tit);font-weight:700;font-size:14px}
.br-v b.neg{color:#0B5E58}.br-v b.pos{color:#9A3412}
.br-v span{font-size:10.5px;color:var(--apoio)}
.nota{margin-top:12px;font-size:11.5px;color:var(--apoio)}
.passos{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin-top:16px}
.passo{border:2px solid var(--fio);border-radius:16px;padding:14px 16px}
.passo .n{width:34px;height:34px;border-radius:50%;background:#fff;border:2.5px solid var(--ouro);display:grid;place-items:center;font-family:var(--f-tit);font-weight:800;font-size:14px;color:var(--tinta)}
.passo b{display:block;margin-top:9px;font-family:var(--f-tit);font-weight:700;font-size:14px;color:var(--tinta);line-height:1.25}
.passo p{font-size:12px;color:var(--apoio);line-height:1.45;margin-top:4px}
.prem{margin-top:12px;display:grid;gap:4px;margin-bottom:20px}
.prem .li{display:grid;grid-template-columns:14px 1fr;gap:10px;font-size:12px;line-height:1.5}
.prem .li i{width:8px;height:8px;border:2px solid var(--turquesa);border-radius:2px;transform:rotate(45deg);margin-top:6px}
.contato{margin-top:auto;border:2px solid var(--tinta);border-radius:20px;padding:20px 24px;display:grid;grid-template-columns:1fr auto;gap:20px;align-items:center;position:relative}
.contato::before,.contato::after{content:"";position:absolute;width:16px;height:16px;border:3px solid var(--amarelo)}
.contato::before{left:-3px;top:-3px;border-right:0;border-bottom:0;border-radius:10px 0 0 0}
.contato::after{right:-3px;bottom:-3px;border-left:0;border-top:0;border-radius:0 0 10px 0}
.contato h2{font-size:18px}.contato p{font-size:12.5px;margin-top:6px;line-height:1.55}
.contato .val{text-align:right}
.contato .val b{display:block;font-family:var(--f-tit);font-weight:800;font-size:24px;color:var(--tinta);letter-spacing:-.02em;line-height:1.1}
.contato .val span{font-size:11.5px;color:var(--apoio)}
.fecho{margin-top:18px;padding-top:14px;border-top:2px solid var(--tinta);display:flex;justify-content:center;gap:12px;align-items:center;font-family:var(--f-tit);font-weight:700;font-size:11.5px;letter-spacing:.13em;text-transform:uppercase;color:var(--tinta)}
.fecho i{width:2px;height:14px;background:var(--amarelo);display:block}
.fecho span{color:var(--apoio);font-weight:600}
@media screen{body{background:#8e97a1;display:flex;flex-direction:column;align-items:center;gap:20px;padding:20px 0}.pagina{background:#fff;box-shadow:0 6px 24px rgba(0,0,0,.18)}}
`;
