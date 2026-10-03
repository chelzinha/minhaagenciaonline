/* =====================================================
   COMPARADOR - RELATORIO COMERCIAL (HTML A4)
   Gera o HTML do estudo de frete a partir do resumo montado na tela.
   O PDF sai deste HTML (pdf.js). Sem dado sensivel: so totais e exemplos.
   Paginas: 1 resultado | 2 caracteristicas e como comecar (so quando ha economia)
            | 3 onde a diferenca aparece | 4 exemplos (ou simulacao), premissas e contato.
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
const envios = (n) => inteiro(n) + (Number(n) === 1 ? ' envio' : ' envios');

// ---------------------------------------------------------------- icones (biblioteca AGF, grade 24, duas cores)
const ICO = {
  caixa: '<path d="M4 10.4h16v7.8a2.4 2.4 0 0 1-2.4 2.4H6.4A2.4 2.4 0 0 1 4 18.2z" stroke="{P}"/><path d="m4 10.4 2.6-3.8h10.8l2.6 3.8" stroke="{P}"/><path d="M12 6.6v13.8" stroke="{A}"/>',
  seta: '<path d="M4.4 12h14" stroke="{P}"/><path d="m13.4 6.8 5.4 5.2-5.4 5.2" stroke="{A}"/>',
  trena: '<path d="M2.9 15.3 15.3 2.9a1.5 1.5 0 0 1 2.1 0l3.7 3.7a1.5 1.5 0 0 1 0 2.1L8.7 21.1a1.5 1.5 0 0 1-2.1 0l-3.7-3.7a1.5 1.5 0 0 1 0-2.1z" stroke="{P}"/><path d="m6.2 12 1.9 1.9M9.2 9l1.9 1.9M12.2 6l1.9 1.9M15.2 3l1.9 1.9" stroke="{A}"/>',
  monitor: '<rect x="2.6" y="4" width="18.8" height="13" rx="3.4" stroke="{P}"/><path d="M8.4 20.4h7.2" stroke="{A}"/><path d="M12 17v3.4" stroke="{A}"/>',
  lista: '<path d="M9 6.4h11.4M9 12h11.4M9 17.6h11.4" stroke="{P}"/><path d="M4 6.4h.01M4 12h.01M4 17.6h.01" stroke="{A}"/>',
  alerta: '<path d="M10.3 4.5a2 2 0 0 1 3.4 0l7.3 12.8a2 2 0 0 1-1.7 3H4.7a2 2 0 0 1-1.7-3z" stroke="{P}"/><path d="M12 10v4.2" stroke="{A}"/><path d="M12 17.4h.01" stroke="{A}"/>',
  check: '<circle cx="12" cy="12" r="9.2" stroke="{P}"/><path d="m7.8 12.2 2.9 2.9 5.5-5.9" stroke="{A}"/>',
  lamp: '<path d="M9.2 16.4a6 6 0 1 1 5.6 0v2.2H9.2z" stroke="{P}"/><path d="M10 21h4" stroke="{A}"/>',
  balao: '<path d="M12 3.6c4.9 0 8.8 3.2 8.8 7.4 0 4.1-3.9 7.4-8.8 7.4-.9 0-1.8-.1-2.6-.3l-4 2.3a.5.5 0 0 1-.8-.5l.5-3.2C3.9 15.5 3.2 13.5 3.2 11c0-4.2 3.9-7.4 8.8-7.4z" stroke="{P}"/><path d="M8.6 11h.01M12 11h.01M15.4 11h.01" stroke="{A}"/>',
  celular: '<rect x="6.6" y="2.4" width="10.8" height="19.2" rx="3.2" stroke="{P}"/><path d="M10.6 5.2h2.8" stroke="{A}"/><path d="M12 18.4h.01" stroke="{A}"/>',
  caminhao: '<path d="M4.4 6.4h6.6a1.8 1.8 0 0 1 1.8 1.8v7.6H4.4a1.8 1.8 0 0 1-1.8-1.8V8.2a1.8 1.8 0 0 1 1.8-1.8z" stroke="{P}"/><path d="M12.8 9.6h3.6l2.8 2.9v2.1a1.2 1.2 0 0 1-1.2 1.2h-5.2z" stroke="{P}"/><circle cx="6.6" cy="18" r="1.8" stroke="{A}"/><circle cx="16.4" cy="18" r="1.8" stroke="{A}"/>',
  fone: '<path d="M4 14.4v-2.6a8 8 0 0 1 16 0v2.6" stroke="{P}"/><rect x="2.6" y="13.6" width="3.8" height="5.4" rx="1.6" stroke="{A}"/><rect x="17.6" y="13.6" width="3.8" height="5.4" rx="1.6" stroke="{A}"/>',
  escudo: '<path d="M12 2.8 20 6v6.2c0 4.2-3.3 7.6-8 9-4.7-1.4-8-4.8-8-9V6z" stroke="{P}"/><path d="m8.6 12 2.4 2.4 4.4-4.8" stroke="{A}"/>',
  relogio: '<circle cx="12" cy="12" r="9.2" stroke="{P}"/><path d="M12 6.6V12h4.4" stroke="{A}"/>',
  fatura: '<path d="M6 2.8h12a1.4 1.4 0 0 1 1.4 1.4v16.6l-2.5-1.6-2.4 1.6-2.5-1.6-2.5 1.6-2.4-1.6-2.5 1.6V4.2A1.4 1.4 0 0 1 6 2.8z" stroke="{P}"/><path d="M8.6 8h6.8M8.6 11.6h6.8" stroke="{A}"/>',
  cofrinho: '<path d="M5 11.2a7 6 0 0 1 12.6-3.2l2.2-.8-.6 3a6.6 6 0 0 1 .4 2c0 2.2-1.1 4.1-2.8 5.2V20h-2.6v-1.6a8 8 0 0 1-2.6 0V20H9v-2.2A6 6 0 0 1 5 11.2z" stroke="{P}"/><path d="M10 7.4h3.4" stroke="{A}"/><path d="M15.4 11h.01" stroke="{A}"/>',
  info: '<circle cx="12" cy="12" r="9.2" stroke="{P}"/><path d="M12 11.2v5" stroke="{A}"/><path d="M12 7.8h.01" stroke="{A}"/>',
  grafico: '<path d="M3.6 20.4h16.8" stroke="{P}"/><path d="M6.6 16.8v-5M11.4 16.8V7.4M16.2 16.8v-7.6" stroke="{P}"/><path d="m5.4 8.6 4.8-3.4 3.8 2.4 5-3.8" stroke="{A}"/>',
};
const ic = (nome, s = 28, p = '#00416b', a = '#EA580C') =>
  `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke-width="${s <= 64 ? 1.9 : 1.4}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICO[nome].replace(/\{P\}/g, p).replace(/\{A\}/g, a)}</svg>`;

// ---------------------------------------------------------------- validacao
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
  const g = r.ganhadores && typeof r.ganhadores === 'object' ? r.ganhadores : { itens: [] };
  const ganhadores = {
    modo: g.modo === 'unico' ? 'unico' : 'disputa',
    total: Number(g.total) || 0,
    itens: (Array.isArray(g.itens) ? g.itens : []).slice(0, 4).map((it) => ({
      cenarios: (Array.isArray(it.cenarios) ? it.cenarios : []).filter((c) => cenarios.includes(c)),
      n: Math.max(0, Number(it.n) || 0),
      economiaMedia: n2(it.economiaMedia),
      servicoTop: String(it.servicoTop || '').slice(0, 10),
      faixaTop: String(it.faixaTop || '').slice(0, 20),
    })).filter((it) => it.cenarios.length),
  };
  return {
    cliente, cenarios, referencia, totais, nomes, ganhadores,
    preparadoPor: String(r.preparadoPor || CONTATO.nome).trim().slice(0, 60),
    validadeDias: Math.min(90, Math.max(1, Number(r.validadeDias) || 15)),
    postagens: Number(r.postagens) || 0,
    periodo: { inicio: String(r.periodo?.inicio || ''), fim: String(r.periodo?.fim || '') },
    porServico: grupo(r.porServico), porRegiao: grupo(r.porRegiao), porPeso: grupo(r.porPeso),
    exemplos,
    miniEnvios: Number(r.miniEnvios) || 0,
    pacoteContrato: String(r.pacoteContrato || 'Platinum').slice(0, 30),
    vigencia: String(r.vigencia || ''),
    incluirValorDeclarado: r.incluirValorDeclarado !== false,
    simulacao: r.simulacao === true,
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

// ---------------------------------------------------------------- conteudo por tarifa
/** Caracteristicas da tarifa proposta: [icone, titulo, texto]. Contrato e Clube Correios sao pacotes de contrato. */
function caracteristicas(proposta) {
  if (proposta === 'CONTRATO' || proposta === 'CLUBE') {
    return [
      ['fatura', 'Pagamento por fatura', 'As postagens do mês são cobradas em uma fatura única. Nada de pagamento no balcão a cada envio.'],
      ['monitor', 'Etiqueta pronta antes de sair', 'Etiquetas e declaração de conteúdo são geradas no sistema. A postagem chega identificada e o atendimento é mais rápido.'],
      ['escudo', 'Seguro mais barato', 'O valor declarado custa 1% sobre o que passa de R$ 25,63. No balcão e no App, custa 2%.'],
      ['caixa', 'Mini Envios para objetos leves', 'Tarifa própria para objetos de até 300 g que cabem em 24 x 16 x 4 cm, como acessórios e cosméticos.'],
      ['trena', 'Caixa leve paga pelo peso real', 'O peso cúbico só entra quando passa de 5 kg. Caixas grandes e leves não pagam a mais por volume.'],
      ['fone', 'Atendimento da AGF', 'Suporte da AGF José Bonifácio para cadastro, etiquetas, conferência de fatura e dúvidas do dia a dia.'],
    ];
  }
  if (proposta === 'APP') {
    return [
      ['celular', 'Pré-postagem pelo celular', 'Remetente, destinatário e medidas da caixa são preenchidos no App Correios antes de sair de casa.'],
      ['trena', 'Paga pelo tamanho da caixa', 'O App cobra sempre o peso cúbico: altura x largura x comprimento, dividido por 7000. Objeto pesado em caixa pequena sai mais barato.'],
      ['alerta', 'Atenção à caixa grande', 'Caixa grande e leve pode sair mais cara que no balcão. A embalagem justa ao produto é o que garante a economia.'],
      ['cofrinho', 'Sem contrato e sem fatura', 'O pagamento é feito no próprio App, a cada envio. Não há volume mínimo nem compromisso mensal.'],
      ['relogio', 'Postagem rápida na AGF', 'O objeto chega com o código da pré-postagem. No balcão, a equipe só confere e posta.'],
      ['escudo', 'Valor declarado', 'O seguro custa 2% sobre o que passa de R$ 25,63, como no balcão.'],
    ];
  }
  return [];
}

function comoComecar(proposta) {
  if (proposta === 'CONTRATO' || proposta === 'CLUBE') {
    return [
      ['balao', 'Aceite da proposta', 'Confirme por WhatsApp ou e-mail com a AGF.'],
      ['lista', 'Documentos', 'A AGF envia a lista e cuida do cadastro com os Correios.'],
      ['monitor', 'Acesso ao sistema', 'Liberação do sistema de etiquetas, com orientação da equipe.'],
      ['caixa', 'Primeira postagem', 'A AGF acompanha a primeira remessa do começo ao fim.'],
    ];
  }
  if (proposta === 'APP') {
    return [
      ['celular', 'Baixe o App Correios', 'Disponível para Android e iPhone. O cadastro é gratuito.'],
      ['trena', 'Meça a caixa', 'Altura, largura e comprimento em centímetros. O preço depende delas.'],
      ['monitor', 'Faça a pré-postagem', 'Preencha os dados do envio e pague no App.'],
      ['caixa', 'Poste na AGF', 'Traga o objeto com o código da pré-postagem.'],
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
  if ((r.cenarios.includes('CONTRATO') || r.cenarios.includes('CLUBE')) && r.miniEnvios > 0) t.push(`Mini Envios aplicado em ${envios(r.miniEnvios)} PAC leves que cabem no formato.`);
  if (r.simulacao) t.push('Simulação com envios de exemplo. Os valores ilustram o método e não são do histórico do cliente.');
  t.push('Estimativa comercial. A tarifa final é a da tabela vigente na data de cada postagem.');
  return t;
}

// ---------------------------------------------------------------- blocos
function barras(r, grupos) {
  if (!grupos.length) return '';
  const max = Math.max(1, ...grupos.flatMap((g) => r.cenarios.map((c) => g.valores[c] || 0)));
  return grupos.map((g) => {
    const ref = g.valores[r.referencia] || 0;
    const outros = r.cenarios.filter((c) => c !== r.referencia);
    const melhor = outros.reduce((a, c) => ((g.valores[c] || 0) < (g.valores[a] || 0) ? c : a), outros[0]);
    const dif = ref > 0 ? ((g.valores[melhor] - ref) / ref) * 100 : 0;
    return `<div class="br">
      <div class="br-l"><b>${esc(g.grupo)}</b><span>${envios(g.n)}</span></div>
      <div class="br-t">${r.cenarios.map((c) => `<i style="width:${((g.valores[c] || 0) / max * 100).toFixed(1)}%;background:${COR[c]}"></i>`).join('')}</div>
      <div class="br-v"><b class="${dif < 0 ? 'neg' : 'pos'}">${dif < 0 ? '' : '+'}${pct(dif)}</b><span>${esc(r.nomes[melhor])}</span></div>
    </div>`;
  }).join('');
}

function legenda(r) {
  return `<div class="leg">${r.cenarios.map((c) => `<span><i style="background:${COR[c]}"></i>${esc(r.nomes[c])}</span>`).join('')}</div>`;
}

/** "Onde cada opcao ganha": sem a referencia. Grupos com o mesmo preco aparecem juntos. */
function blocoGanhadores(r) {
  const g = r.ganhadores;
  if (!g.itens.length || !g.total) return '';
  const nome = (it) => it.cenarios.map((c) => esc(r.nomes[c])).join(' e ');
  const nota = (it) => (it.cenarios.length > 1 ? '<em>mesmo preço</em>' : '');
  const onde = (it) => (it.n && it.servicoTop ? `Mais vezes em ${esc(it.servicoTop)}, ${esc(it.faixaTop.toLowerCase())}` : '');
  const titulo = g.modo === 'unico'
    ? `Em quantos envios ${nome(g.itens[0])} sai mais barato que ${esc(r.nomes[r.referencia])}`
    : `Qual opção sai mais barata em cada envio`;
  const sub = g.modo === 'unico' ? '' : `<p class="gn-sub">Comparação entre as opções propostas, envio a envio, sem ${esc(r.nomes[r.referencia])}.</p>`;
  return `<div class="gn">
    <div class="rot gn-t">${titulo}</div>${sub}
    ${g.itens.map((it) => {
      const p = (it.n / g.total) * 100;
      const cor = COR[it.cenarios[0]];
      return `<div class="gn-l">
        <div class="gn-n"><b>${nome(it)}</b>${nota(it)}<span>${onde(it)}</span></div>
        <div class="gn-b"><div class="gn-tr"><i style="width:${p.toFixed(1)}%;background:${cor}"></i></div>
          <span><b style="color:${cor === COR.AVISTA ? '#475569' : cor}">${pct(p)}</b> ${inteiro(it.n)} de ${envios(g.total)}</span></div>
        <div class="gn-e">${it.n ? `<b>${brl(it.economiaMedia)}</b><span>a menos nesses envios, em média</span>` : ''}</div>
      </div>`;
    }).join('')}
  </div>`;
}

/** Onde a economia e maior: melhor grupo de destino, peso e servico (so com ao menos 3 envios). */
function blocoDestaques(r, proposta) {
  const ref = r.referencia;
  const melhor = (grupos) => grupos.filter((g) => g.n >= 3 && g.valores[ref] > 0)
    .map((g) => ({ g, p: ((g.valores[ref] - g.valores[proposta]) / g.valores[ref]) * 100 }))
    .sort((a, b) => b.p - a.p)[0];
  const itens = [['caminhao', 'Destino', melhor(r.porRegiao)], ['caixa', 'Faixa de peso', melhor(r.porPeso)], ['lista', 'Serviço', melhor(r.porServico)]]
    .filter(([, , m]) => m && m.p > 0);
  if (!itens.length) return '';
  return `<div class="dq"><div class="rot dq-t">Onde a economia é maior</div><div class="dq-g n${itens.length}">${itens.map(([i, rot, m]) => `<div class="dq-i">
    <div class="dq-h">${ic(i, 30, '#00416b', '#EA580C')}<span class="rot">${rot}</span></div>
    <b>${esc(m.g.grupo)}</b><strong>-${pct(m.p)}</strong><span>${envios(m.g.n)}</span></div>`).join('')}</div></div>`;
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
  const carac = ganha ? caracteristicas(proposta) : [];
  const passos = ganha ? comoComecar(proposta) : [];
  const temP2 = carac.length > 0;
  const totalPag = temP2 ? 4 : 3;
  const pg = (i) => `${i}/${totalPag}`;
  const nomeProp = esc(r.nomes[proposta]);

  // ---------------- pagina 1
  const hero = ganha ? `
    <div class="hero">
      <div class="hero-pct">
        <span class="rot">Economia</span>
        <b>${pct(economiaPct)}</b>
        <span class="hero-pct-s">a menos no frete com ${nomeProp}</span>
      </div>
      <div class="hero-num">
        <div><span class="rot">${r.simulacao ? 'Na simulação' : 'No período analisado'}</span><b>${brl(economia)}</b></div>
        ${anual > 0 ? `<div><span class="rot">Projeção em 12 meses</span><b class="verde">${brl(anual, false)}</b></div>` : ''}
        <div><span class="rot">Custo por envio</span><b class="menor">${brl(totalProp / n)} <s>${brl(totalRef / n)}</s></b></div>
      </div>
    </div>` : `
    <div class="hero neutro">
      <div class="hero-pct"><span class="rot">Resultado</span><b class="txt">${esc(r.nomes[ref])} já é a opção mais econômica</b>
      <span class="hero-pct-s">${brl(totalRef / n)} por envio no período analisado</span></div>
    </div>`;

  const tickets = r.cenarios.map((c) => {
    const dif = totalRef > 0 && c !== ref ? ((r.totais[c] - totalRef) / totalRef) * 100 : null;
    const tag = c === ref ? 'Hoje' : c === proposta && ganha ? 'Mais econômico' : '';
    return `<div class="ticket ${c === proposta && ganha ? 'prop' : ''}">
      <div class="t-h"><b>${esc(r.nomes[c])}</b>${tag ? `<span class="tag">${tag}</span>` : ''}</div>
      <div class="t-v">${brl(r.totais[c])}</div>
      <div class="t-d ${dif == null ? 'base' : dif < 0 ? 'neg' : 'pos'}">${dif == null ? 'Base da comparação' : (dif > 0 ? '+' : '') + pct(dif)}</div>
      <dl><dt>Por envio</dt><dd>${brl(r.totais[c] / n)}</dd></dl>
    </div>`;
  }).join('');

  const destaques = ganha && r.ganhadores.itens.length <= 1 ? blocoDestaques(r, proposta) : '';
  const chamada = temP2 ? `<div class="chamada">${ic('lamp', 30, '#00416b', '#f2a900')}<p>Na próxima página: <b>características de ${nomeProp}</b> e <b>como começar</b>.</p></div>` : '';

  // ---------------- pagina 2
  const pagina2 = temP2 ? `
<section class="pagina">
  <div class="filete"></div>
  <div class="sec"><h2>${ic('check', 30, '#00416b', '#0D9488')}Características de ${nomeProp}</h2><p>O que muda no dia a dia</p></div>
  <div class="carac">${carac.map(([i, t, d]) => `<div class="cr"><div class="cr-ic">${ic(i, 34, '#00416b', '#EA580C')}</div><div><b>${esc(t)}</b><p>${esc(d)}</p></div></div>`).join('')}</div>
  <div class="sec"><h2>${ic('seta', 30, '#00416b', '#EA580C')}Como começar</h2><p>${passos.length} etapas</p></div>
  <div class="passos n${passos.length}">${passos.map(([i, t, d], k) => `<div class="passo"><div class="p-top"><span class="n">${k + 1}</span>${ic(i, 34, '#00416b', '#EA580C')}</div><b>${esc(t)}</b><p>${esc(d)}</p></div>`).join('')}</div>
  <div class="resumo-prop">
    <div><span class="rot">Resumo</span><b>${nomeProp}</b><p>${brl(totalProp)} ${r.simulacao ? 'na simulação' : 'no período'}, contra ${brl(totalRef)} com ${esc(r.nomes[ref])}.</p></div>
    <div class="rp-pct"><b>${pct(economiaPct)}</b><span>a menos</span></div>
  </div>
  <div class="rodape"><span>Estudo de frete, ${esc(r.cliente)}</span><b>${pg(2)}</b></div>
</section>` : '';

  // ---------------- tabelas
  const menor = (v) => r.cenarios.reduce((a, c) => (v[c] < v[a] ? c : a), r.cenarios[0]);
  const celulas = (v, extra = () => '') => { const m = menor(v); return r.cenarios.map((c) => `<td class="n ${c === m ? 'destaque' : ''}">${brl(v[c])}${extra(c)}</td>`).join(''); };
  const servicos = r.porServico.map((g) => `<tr><td><b>${esc(g.grupo)}</b><span class="sub">${envios(g.n)}</span></td>${celulas(g.valores)}</tr>`).join('');
  const totalLinha = `<tr class="tot"><td><b>Total</b><span class="sub">${envios(r.postagens)}</span></td>${celulas(r.totais)}</tr>`;
  const maxEx = r.cenarios.length >= 4 ? 5 : 6;
  const exemplos = r.exemplos.slice(0, maxEx).map((e) => `<tr><td><span class="sv ${e.servico.toLowerCase()}">${esc(e.servico)}</span></td><td>${esc(e.destino)}</td><td class="n">${kg(e.pesoG)}</td>${celulas(e.valores, (c) => ((c === 'CONTRATO' || c === 'CLUBE') && e.mini ? '<sup>M</sup>' : ''))}</tr>`).join('');
  const cols = r.cenarios.map((c) => `<th class="n">${esc(r.nomes[c])}</th>`).join('');
  const pDif = temP2 ? 3 : 2, pFim = temP2 ? 4 : 3;
  const tituloEx = r.simulacao ? 'Simulação com envios de exemplo' : 'Exemplos do seu histórico';
  const subEx = r.simulacao ? 'Dados ilustrativos' : 'Mesmo objeto, mesmo destino';

  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Estudo de frete - ${esc(r.cliente)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Poppins:wght@600;700;800&display=swap" rel="stylesheet">
<style>${CSS}</style></head><body>
<section class="pagina">
  <div class="faixa-topo"><img src="${LOGO_AGF}" alt="AGF José Bonifácio"><span class="chip">${r.simulacao ? 'Simulação de frete' : 'Estudo de frete'}</span></div>
  <div class="para">
    <div><div class="rot">Preparado para</div><div class="quem">${esc(r.cliente)}</div></div>
    <div class="meta">${r.simulacao ? `Simulação: <b>${envios(r.postagens)} de exemplo</b>` : `Base: <b>${inteiro(r.postagens)} postagens</b>${periodoTxt ? `<br>${periodoTxt}` : ''}`}<br>Origem: Fortaleza/CE<br>Emitido em ${dataBR(r.emitidoEm)}</div>
  </div>
  <h1>${ganha ? `Quanto o seu frete custaria<br>com ${nomeProp}` : 'Comparativo de tarifas<br>do seu frete'}</h1>
  ${hero}
  <div class="tickets n${r.cenarios.length}">${tickets}</div>
  ${blocoGanhadores(r)}
  ${destaques || chamada}
  <div class="rodape"><span>${esc(r.preparadoPor)}</span><b>${pg(1)}</b></div>
</section>
${pagina2}
<section class="pagina">
  <div class="filete"></div>
  <div class="sec"><h2>${ic('grafico', 30, '#00416b', '#EA580C')}Onde a diferença aparece</h2><p>${r.simulacao ? 'Valores da simulação' : 'Valores do período analisado'}</p></div>
  <table class="c${r.cenarios.length}"><thead><tr><th>Serviço</th>${cols}</tr></thead><tbody>${servicos}${totalLinha}</tbody></table>
  <div class="sec"><h2>${ic('caminhao', 30, '#00416b', '#EA580C')}Por destino</h2>${legenda(r)}</div>
  <div class="bars">${barras(r, r.porRegiao)}</div>
  <div class="sec"><h2>${ic('caixa', 30, '#00416b', '#EA580C')}Por peso</h2>${legenda(r)}</div>
  <div class="bars">${barras(r, r.porPeso)}</div>
  <p class="nota">Percentual: diferença da opção mais barata de cada linha em relação a ${esc(r.nomes[ref])}. Nas tabelas, o menor valor de cada linha aparece em verde.</p>
  <div class="rodape"><span>Estudo de frete, ${esc(r.cliente)}</span><b>${pg(pDif)}</b></div>
</section>
<section class="pagina">
  <div class="filete"></div>
  ${exemplos ? `<div class="sec"><h2>${ic(r.simulacao ? 'lamp' : 'lista', 30, '#00416b', '#EA580C')}${tituloEx}</h2><p>${subEx}</p></div>
  <table class="ex c${r.cenarios.length}"><thead><tr><th>Serviço</th><th>Destino</th><th class="n">Peso</th>${cols}</tr></thead><tbody>${exemplos}</tbody></table>
  ${r.exemplos.some((e) => e.mini) ? '<p class="nota"><sup>M</sup> Enviado como Mini Envios.</p>' : ''}` : ''}
  <div class="sec"><h2>${ic('info', 30, '#00416b', '#EA580C')}Premissas do cálculo</h2><p>Para conferência</p></div>
  <div class="prem">${premissas(r).map((t) => `<div class="li"><i></i><p>${esc(t)}</p></div>`).join('')}</div>
  <div class="contato">
    <div class="ct-ic">${ic('fone', 40, '#00416b', '#EA580C')}</div>
    <div><h2>Fale com a ${esc(CONTATO.nome)}</h2><p>${esc(CONTATO.endereco)}<br>${esc(CONTATO.telefone)} | ${esc(CONTATO.email)}</p></div>
    <div class="val"><span>Proposta válida até</span><b>${validade}</b></div>
  </div>
  <div class="fecho">${esc(CONTATO.nome)}<i></i><span>Agência de Correios Franqueada</span><b class="pgf">${pg(pFim)}</b></div>
</section>
</body></html>`;
}

const CSS = `
:root{--tinta:#00416b;--azul:#0078D4;--grafite:#374151;--apoio:#6B7280;--fio:#E5E7EB;--fio-forte:#D7DEE6;
--amarelo:#FFD100;--ouro:#f2a900;--turquesa:#0D9488;--verde:#0B5E58;--laranja:#9A3412;
--f-tit:'Poppins','Segoe UI',Arial,sans-serif;--f-txt:'Inter','Segoe UI',Roboto,Arial,sans-serif}
*{margin:0;padding:0;box-sizing:border-box}
@page{size:210mm 297mm;margin:0}
html,body{background:#fff}
body{font-family:var(--f-txt);color:var(--grafite);font-size:15.5px;line-height:1.5;-webkit-font-smoothing:antialiased;font-variant-numeric:tabular-nums;
 -webkit-print-color-adjust:exact;print-color-adjust:exact}
svg{display:block;flex:none}
.pagina{position:relative;width:210mm;height:297mm;padding:52px 58px 88px;overflow:hidden;display:flex;flex-direction:column;break-after:page;page-break-after:always;background:#fff}
.pagina:last-child{break-after:auto;page-break-after:auto}
.faixa-topo{background:#fff;margin:-52px -58px 0;padding:20px 58px 16px;display:flex;align-items:center;justify-content:space-between;border-bottom:3px solid var(--amarelo)}
.faixa-topo img{height:32px;display:block}
.chip{font-family:var(--f-tit);font-weight:700;font-size:11.5px;letter-spacing:.14em;text-transform:uppercase;color:var(--tinta);background:#fff;border:2px solid var(--tinta);padding:8px 16px;border-radius:999px}
.filete{position:absolute;left:58px;right:58px;top:26px;border-top:3px solid var(--amarelo)}
.rodape{position:absolute;left:58px;right:58px;bottom:40px;display:flex;justify-content:space-between;border-top:1px solid var(--fio);padding-top:10px;font-size:12.5px;color:var(--apoio)}
.rodape b{font-family:var(--f-tit);color:var(--tinta);font-size:14px}
.rot{font-family:var(--f-tit);font-weight:700;font-size:11.5px;letter-spacing:.14em;text-transform:uppercase;color:var(--apoio)}
h1{font-family:var(--f-tit);font-weight:800;font-size:36px;line-height:1.08;letter-spacing:-.03em;color:var(--tinta);margin-top:18px}
h2{font-family:var(--f-tit);font-weight:700;font-size:22px;letter-spacing:-.02em;color:var(--tinta);line-height:1.2;display:flex;align-items:center;gap:10px}
.para{margin-top:24px;display:flex;justify-content:space-between;align-items:flex-end;gap:24px}
.quem{font-family:var(--f-tit);font-weight:700;font-size:24px;color:var(--tinta);margin-top:8px;line-height:1.2}
.meta{text-align:right;font-size:13px;color:var(--apoio);line-height:1.6}
.meta b{color:var(--tinta);font-weight:600}

/* destaque: percentual grande a esquerda, valores a direita */
.hero{margin-top:18px;border:2.5px solid var(--tinta);border-radius:24px;padding:18px 26px;display:grid;grid-template-columns:auto 1fr;gap:26px;align-items:center;background:#fff}
.hero-pct{display:flex;flex-direction:column;padding-right:26px;border-right:1.5px dashed var(--fio-forte)}
.hero-pct .rot{color:var(--verde)}
.hero-pct b{font-family:var(--f-tit);font-weight:800;font-size:96px;line-height:.95;letter-spacing:-.05em;color:var(--verde);margin-top:2px}
.hero-pct b.txt{font-size:30px;letter-spacing:-.02em;color:var(--tinta);line-height:1.15;max-width:15em}
.hero-pct-s{font-family:var(--f-tit);font-weight:600;font-size:16px;color:var(--tinta);margin-top:6px;max-width:13em;line-height:1.25}
.hero.neutro{grid-template-columns:1fr}.hero.neutro .hero-pct{border-right:0;padding-right:0}.hero.neutro .hero-pct-s{max-width:none}
.hero-num{display:grid;gap:12px}
.hero-num div{display:flex;flex-direction:column}
.hero-num b{font-family:var(--f-tit);font-weight:800;font-size:34px;letter-spacing:-.03em;color:var(--tinta);line-height:1.1}
.hero-num b.verde{color:var(--verde)}
.hero-num b.menor{font-size:22px}
.hero-num s{font-size:15px;font-weight:600;color:var(--apoio);margin-left:6px;text-decoration-thickness:1.5px}

.tickets{display:grid;gap:14px;margin-top:20px}
.tickets.n2{grid-template-columns:1fr 1fr}.tickets.n3{grid-template-columns:repeat(3,1fr)}.tickets.n4{grid-template-columns:repeat(4,1fr);gap:10px}
.ticket{position:relative;border:2px solid var(--fio-forte);border-bottom:0;border-radius:16px 16px 0 0;padding:16px 16px 20px;background:#fff}
.ticket::after{content:"";position:absolute;left:-2px;right:-2px;bottom:-10px;height:12px;
 background:radial-gradient(circle at 7px -1px,transparent 7px,var(--fio-forte) 7px 9px,transparent 9px) 0 0/14px 12px repeat-x}
.ticket .t-h{display:flex;justify-content:space-between;align-items:flex-start;gap:6px;min-height:38px}
.ticket .t-h b{font-family:var(--f-tit);font-weight:700;font-size:15px;color:var(--tinta);line-height:1.2}
.ticket .t-v{font-family:var(--f-tit);font-weight:800;font-size:25px;letter-spacing:-.03em;color:var(--tinta);margin-top:6px;line-height:1.1;white-space:nowrap}
.ticket .t-d{font-family:var(--f-tit);font-weight:800;font-size:26px;letter-spacing:-.02em;margin-top:6px;line-height:1.1}
.ticket .t-d.neg{color:var(--verde)}.ticket .t-d.pos{color:var(--laranja)}
.ticket .t-d.base{font-size:13px;font-weight:600;color:var(--apoio);letter-spacing:0;padding:7px 0}
.tickets.n4 .t-v{font-size:19px}.tickets.n4 .t-d{font-size:21px}
.tickets .ticket .t-d.base{font-size:13px;font-weight:600;color:var(--apoio);letter-spacing:0;padding:7px 0}.tickets.n4 .t-h b{font-size:13px}.tickets.n4 .ticket{padding:14px 12px 18px}
.ticket dl{margin-top:10px;border-top:1.5px dashed var(--fio-forte);padding-top:8px;display:flex;justify-content:space-between;font-size:12.5px}
.ticket dt{color:var(--apoio)}.ticket dd{font-weight:600;color:var(--grafite);white-space:nowrap}
.ticket.prop{border-color:var(--turquesa);border-width:3px}
.ticket.prop::after{background:radial-gradient(circle at 7px -1px,transparent 7px,var(--turquesa) 7px 9px,transparent 9px) 0 0/14px 12px repeat-x}
.ticket.prop .t-v{color:var(--verde)}
.tag{font-family:var(--f-tit);font-weight:700;font-size:8.5px;letter-spacing:.1em;text-transform:uppercase;padding:3px 6px;border-radius:5px;background:#fff;border:1.5px solid var(--fio-forte);color:var(--apoio);white-space:nowrap}
.ticket.prop .tag{border-color:var(--turquesa);color:var(--verde)}

/* onde cada opcao ganha */
.gn{margin-top:18px}
.gn-t{color:var(--tinta)}
.gn-sub{font-size:12.5px;color:var(--apoio);margin-top:3px}
.gn-l{display:grid;grid-template-columns:200px 1fr 150px;gap:16px;align-items:center;padding:8px 0;border-bottom:1px dashed var(--fio-forte)}
.gn-l:first-of-type{margin-top:6px}
.gn-n b{display:block;font-family:var(--f-tit);font-weight:700;font-size:14.5px;color:var(--tinta);line-height:1.2}
.gn-n em{font-style:normal;font-size:10px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--apoio);border:1px solid var(--fio-forte);border-radius:5px;padding:1px 5px;margin-top:3px;display:inline-block}
.gn-n span{display:block;font-size:12px;color:var(--apoio);margin-top:2px}
.gn-tr{height:12px;border:1px solid var(--fio-forte);border-radius:6px;overflow:hidden;background:#fff}
.gn-tr i{display:block;height:100%;border-radius:6px}
.gn-b span{display:block;font-size:12.5px;color:var(--apoio);margin-top:5px}
.gn-b span b{font-family:var(--f-tit);font-weight:800;font-size:17px;margin-right:4px}
.gn-e{text-align:right}
.gn-e b{display:block;font-family:var(--f-tit);font-weight:800;font-size:18px;color:var(--verde)}
.gn-e span{font-size:11px;color:var(--apoio);white-space:nowrap}
.dq{margin-top:auto;padding-top:18px}
.dq-t{color:var(--tinta);margin-bottom:10px}
.dq-g{display:grid;gap:12px}.dq-g.n3{grid-template-columns:repeat(3,1fr)}.dq-g.n2{grid-template-columns:1fr 1fr}.dq-g.n1{grid-template-columns:1fr}
.dq-i{border:2px solid var(--fio);border-radius:18px;padding:14px 16px;display:flex;flex-direction:column}
.dq-h{display:flex;align-items:center;gap:8px}
.dq-i b{font-family:var(--f-tit);font-weight:700;font-size:15px;color:var(--tinta);margin-top:10px;line-height:1.2}
.dq-i strong{font-family:var(--f-tit);font-weight:800;font-size:34px;color:var(--verde);letter-spacing:-.04em;line-height:1.05;margin-top:4px}
.dq-i span{font-size:12px;color:var(--apoio)}
.chamada{margin-top:auto;margin-bottom:4px;display:flex;align-items:center;gap:14px;border:2px dashed var(--ouro);border-radius:16px;padding:14px 18px}
.chamada p{font-size:15px;color:var(--tinta)}

/* pagina 2 */
.sec{display:flex;align-items:baseline;justify-content:space-between;gap:16px;padding-bottom:10px;border-bottom:3px solid var(--tinta);margin-top:26px}
.pagina>.filete+.sec{margin-top:8px}
.sec p{font-size:13px;color:var(--apoio)}
.carac{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:18px}
.cr{display:grid;grid-template-columns:58px 1fr;gap:14px;border:2px solid var(--fio);border-radius:18px;padding:16px 16px 16px 14px;align-items:start}
.cr-ic{width:58px;height:58px;border-radius:16px;border:2px solid var(--ouro);display:grid;place-items:center;background:#fff}
.cr b{font-family:var(--f-tit);font-weight:700;font-size:16px;color:var(--tinta);display:block;line-height:1.25}
.cr p{font-size:13.5px;color:var(--grafite);line-height:1.45;margin-top:4px}
.passos{display:grid;gap:12px;margin-top:18px}
.passos.n3{grid-template-columns:repeat(3,1fr)}.passos.n4{grid-template-columns:repeat(4,1fr)}
.passo{border:2px solid var(--fio);border-radius:18px;padding:14px 14px 16px}
.p-top{display:flex;align-items:center;justify-content:space-between}
.passo .n{width:36px;height:36px;border-radius:50%;background:#fff;border:2.5px solid var(--ouro);display:grid;place-items:center;font-family:var(--f-tit);font-weight:800;font-size:15px;color:var(--tinta)}
.passo b{display:block;margin-top:12px;font-family:var(--f-tit);font-weight:700;font-size:15px;color:var(--tinta);line-height:1.25}
.passo p{font-size:12.5px;color:var(--apoio);line-height:1.45;margin-top:4px}
.resumo-prop{margin-top:auto;border:2.5px solid var(--turquesa);border-radius:20px;padding:18px 22px;display:grid;grid-template-columns:1fr auto;gap:20px;align-items:center}
.resumo-prop .rot{color:var(--verde)}
.resumo-prop b{font-family:var(--f-tit);font-weight:800;font-size:22px;color:var(--tinta);display:block;margin-top:2px}
.resumo-prop p{font-size:14px;margin-top:2px}
.rp-pct{text-align:right}
.rp-pct b{font-size:46px;color:var(--verde);letter-spacing:-.04em;line-height:1}
.rp-pct span{font-family:var(--f-tit);font-weight:600;font-size:14px;color:var(--verde)}

/* tabelas */
table{width:100%;border-collapse:separate;border-spacing:0;margin-top:14px;font-size:13.5px;border:2px solid var(--tinta);border-radius:12px;overflow:hidden}
th{font-family:var(--f-tit);font-weight:700;font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:var(--tinta);background:#fff;text-align:left;padding:10px 10px;border-bottom:2px solid var(--tinta);box-shadow:inset 0 -5px 0 -2px var(--amarelo)}
th.n,td.n{text-align:right;white-space:nowrap}
td{padding:9px 10px;border-bottom:1px solid var(--fio);vertical-align:middle}
td+td{border-left:1px solid var(--fio)}
th+th{border-left:1px solid var(--fio)}
tr:last-child td{border-bottom:0}
td .sub{display:block;font-size:11.5px;color:var(--apoio)}
td b{color:var(--tinta);font-weight:600}
td.destaque{color:var(--verde);font-weight:700}
tr.tot td{border-top:2px solid var(--tinta);font-weight:700}
table.c4{font-size:12.5px}table.c4 td{padding:8px 7px}table.c4 th{padding:9px 7px;font-size:9px;letter-spacing:.06em}
table.ex.c4 th:nth-child(2),table.ex.c4 td:nth-child(2){white-space:nowrap}
.sv{font-family:var(--f-tit);font-weight:700;font-size:10px;letter-spacing:.08em;padding:2px 6px;border-radius:5px;border:1.5px solid;background:#fff}
.sv.pac{color:var(--azul)}.sv.sedex{color:#8a5a00}
sup{font-size:8px;color:var(--turquesa);font-weight:700;margin-left:2px}
.leg{display:flex;flex-wrap:wrap;gap:6px 14px;font-size:11.5px;color:var(--apoio)}
.leg i{display:inline-block;width:10px;height:10px;border-radius:3px;vertical-align:-1px;margin-right:5px}
.bars{margin-top:12px;display:grid;gap:10px}
.br{display:grid;grid-template-columns:190px 1fr 130px;gap:14px;align-items:center}
.br-l b{display:block;font-family:var(--f-tit);font-weight:600;font-size:13.5px;color:var(--tinta);line-height:1.2}
.br-l span{font-size:11.5px;color:var(--apoio)}
.br-t{display:flex;flex-direction:column;gap:2px}
.br-t i{display:block;height:6px;border-radius:3px;min-width:2px}
.br-v{text-align:right;line-height:1.1}
.br-v b{display:block;font-family:var(--f-tit);font-weight:800;font-size:20px;letter-spacing:-.02em}
.br-v b.neg{color:var(--verde)}.br-v b.pos{color:var(--laranja)}
.br-v span{font-size:11px;color:var(--apoio)}
.nota{margin-top:12px;font-size:12px;color:var(--apoio)}
.prem{margin-top:12px;display:grid;gap:5px;margin-bottom:20px}
.prem .li{display:grid;grid-template-columns:14px 1fr;gap:10px;font-size:13px;line-height:1.5}
.prem .li i{width:8px;height:8px;border:2px solid var(--turquesa);border-radius:2px;transform:rotate(45deg);margin-top:6px}
.contato{margin-top:auto;border:2px solid var(--tinta);border-radius:20px;padding:20px 24px;display:grid;grid-template-columns:auto 1fr auto;gap:18px;align-items:center;position:relative}
.contato::before,.contato::after{content:"";position:absolute;width:16px;height:16px;border:3px solid var(--amarelo)}
.contato::before{left:-3px;top:-3px;border-right:0;border-bottom:0;border-radius:10px 0 0 0}
.contato::after{right:-3px;bottom:-3px;border-left:0;border-top:0;border-radius:0 0 10px 0}
.ct-ic{width:60px;height:60px;border-radius:50%;border:2px solid var(--ouro);display:grid;place-items:center}
.contato h2{font-size:19px}.contato p{font-size:13px;margin-top:6px;line-height:1.55}
.contato .val{text-align:right}
.contato .val b{display:block;font-family:var(--f-tit);font-weight:800;font-size:24px;color:var(--tinta);letter-spacing:-.02em;line-height:1.1}
.contato .val span{font-size:12px;color:var(--apoio)}
.fecho{margin-top:18px;padding-top:14px;border-top:2px solid var(--tinta);display:flex;justify-content:center;gap:12px;align-items:center;font-family:var(--f-tit);font-weight:700;font-size:12px;letter-spacing:.13em;text-transform:uppercase;color:var(--tinta);position:relative}
.fecho i{width:0;height:14px;border-left:2px solid var(--amarelo);display:block}
.fecho span{color:var(--apoio);font-weight:600}
.fecho .pgf{position:absolute;right:0;font-size:14px;letter-spacing:0}
@media screen{body{background:#8e97a1;display:flex;flex-direction:column;align-items:center;gap:20px;padding:20px 0}.pagina{box-shadow:0 6px 24px rgba(0,0,0,.18)}}
`;
