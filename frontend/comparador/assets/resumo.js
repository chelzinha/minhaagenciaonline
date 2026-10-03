/* resumo.js - agrega o resultado do lote para a tela e para o PDF.
   Funcoes puras: nada de DOM, nada de rede. */

export const CENARIOS = ['AVISTA', 'CONTRATO', 'CLUBE', 'APP'];
const NORDESTE = ['MA', 'PI', 'RN', 'PB', 'PE', 'AL', 'SE', 'BA'];
const SUDESTE = ['SP', 'RJ', 'MG', 'ES'];
export const REGIOES = ['Fortaleza e região', 'Interior do Ceará', 'Nordeste', 'Sudeste', 'Sul, Centro-Oeste e Norte'];
export const FAIXAS = ['Até 300 g', '301 g a 1 kg', '1 a 3 kg', '3 a 10 kg', 'Acima de 10 kg'];

const r2 = (v) => Math.round((Number(v) + Number.EPSILON) * 100) / 100;

export function regiao(l) {
  if (l.uf === 'CE') return /Local/.test(l.trecho || '') ? REGIOES[0] : REGIOES[1];
  if (/Divisa/.test(l.trecho || '') || NORDESTE.includes(l.uf)) return REGIOES[2];
  if (SUDESTE.includes(l.uf)) return REGIOES[3];
  return REGIOES[4];
}

export function faixaPeso(g) {
  const p = Number(g) || 0;
  if (p <= 300) return FAIXAS[0];
  if (p <= 1000) return FAIXAS[1];
  if (p <= 3000) return FAIXAS[2];
  if (p <= 10000) return FAIXAS[3];
  return FAIXAS[4];
}

/** Linha entra na comparacao quando todos os cenarios escolhidos tem preco. */
export function comparavel(l, cenarios) {
  return l.status === 'CALCULADO' && cenarios.every((c) => l[c] && l[c].ok);
}

/** Cenario mais barato da linha (empate: o primeiro na ordem da lista). */
export function melhorDaLinha(l, cenarios) {
  return cenarios.reduce((a, c) => (l[c].total < l[a].total ? c : a), cenarios[0]);
}

function agrupar(linhas, cenarios, chave, ordem) {
  const m = new Map();
  for (const l of linhas) {
    const k = chave(l);
    if (!m.has(k)) m.set(k, { grupo: k, n: 0, valores: Object.fromEntries(cenarios.map((c) => [c, 0])) });
    const g = m.get(k);
    g.n++;
    for (const c of cenarios) g.valores[c] += l[c].total;
  }
  const lista = [...m.values()].map((g) => ({ ...g, valores: Object.fromEntries(Object.entries(g.valores).map(([c, v]) => [c, r2(v)])) }));
  return ordem ? lista.sort((a, b) => ordem.indexOf(a.grupo) - ordem.indexOf(b.grupo)) : lista.sort((a, b) => b.n - a.n);
}

export function resumir(linhas, cenarios, referencia) {
  const comp = linhas.filter((l) => comparavel(l, cenarios));
  const calculadas = linhas.filter((l) => l.status === 'CALCULADO');
  const totais = Object.fromEntries(cenarios.map((c) => [c, r2(comp.reduce((s, l) => s + l[c].total, 0))]));
  const melhores = Object.fromEntries(cenarios.map((c) => [c, 0]));
  for (const l of comp) melhores[melhorDaLinha(l, cenarios)]++;
  const conferidas = calculadas.filter((l) => l.pagoConfereAvista !== null && l.pagoConfereAvista !== undefined);
  const outros = cenarios.filter((c) => c !== referencia);
  const proposta = outros.length ? outros.reduce((a, c) => (totais[c] < totais[a] ? c : a), outros[0]) : referencia;
  return {
    linhas: linhas.length,
    comparaveis: comp.length,
    foraDaComparacao: calculadas.length - comp.length,
    revisar: linhas.filter((l) => l.status === 'REVISAR').length,
    ignoradas: linhas.filter((l) => l.status === 'IGNORADO').length,
    totais, melhores, proposta,
    economia: r2((totais[referencia] || 0) - (totais[proposta] || 0)),
    porServico: agrupar(comp, cenarios, (l) => l.servico, ['SEDEX', 'PAC']),
    porRegiao: agrupar(comp, cenarios, regiao, REGIOES),
    porPeso: agrupar(comp, cenarios, (l) => faixaPeso(l.pesoG), FAIXAS),
    miniEnvios: comp.filter((l) => (cenarios.includes('CONTRATO') && l.CONTRATO.mini) || (cenarios.includes('CLUBE') && l.CLUBE.mini)).length,
    conferencia: { verificadas: conferidas.length, conferem: conferidas.filter((l) => l.pagoConfereAvista).length },
  };
}

/** Ate n exemplos com maior diferenca entre a referencia e a proposta, destinos variados. */
export function escolherExemplos(linhas, cenarios, referencia, proposta, n = 6) {
  const comp = linhas.filter((l) => comparavel(l, cenarios));
  const ordenadas = [...comp].sort((a, b) => (b[referencia].total - b[proposta].total) - (a[referencia].total - a[proposta].total));
  const vistos = new Set(), saida = [];
  for (const l of ordenadas) {
    const k = l.cidade + '|' + l.servico;
    if (vistos.has(k)) continue;
    vistos.add(k);
    saida.push(l);
    if (saida.length >= n) break;
  }
  return saida;
}

/** Datas dd/mm/aaaa (Portal Postal) ou aaaa-mm-dd -> { inicio, fim } em ISO. */
export function periodo(datas) {
  const iso = datas.map((d) => {
    const s = String(d || '').trim();
    let m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
    if (m) return `${m[3]}-${m[2]}-${m[1]}`;
    m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m ? `${m[1]}-${m[2]}-${m[3]}` : '';
  }).filter(Boolean).sort();
  return iso.length ? { inicio: iso[0], fim: iso[iso.length - 1] } : { inicio: '', fim: '' };
}

const titulo = (s) => String(s || '').toLowerCase().replace(/(^|\s|\/)(\S)/g, (m, a, b) => a + b.toUpperCase()).replace(/\b(Do|Da|De|Dos|Das|E)\b/g, (x) => x.toLowerCase());

/** Pedido do relatorio para o Worker (PDF). */
export function montarRelatorio({ linhas, cenarios, referencia, nomes, cliente, preparadoPor, validadeDias, periodo: per, pacoteNome, vigencia, incluirValorDeclarado }) {
  const r = resumir(linhas, cenarios, referencia);
  const ex = escolherExemplos(linhas, cenarios, referencia, r.proposta);
  return {
    cliente, preparadoPor, validadeDias, cenarios, referencia, nomes,
    postagens: r.comparaveis,
    periodo: per,
    totais: r.totais,
    porServico: r.porServico, porRegiao: r.porRegiao, porPeso: r.porPeso,
    exemplos: ex.map((l) => ({
      servico: l.servico, destino: titulo(l.cidade) + '/' + l.uf, pesoG: l.pesoG,
      valores: Object.fromEntries(cenarios.map((c) => [c, l[c].total])),
      mini: cenarios.some((c) => (c === 'CONTRATO' || c === 'CLUBE') && l[c].mini),
    })),
    miniEnvios: r.miniEnvios,
    melhores: r.melhores,
    pacoteContrato: pacoteNome,
    vigencia,
    incluirValorDeclarado,
    emitidoEm: new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10),
  };
}
