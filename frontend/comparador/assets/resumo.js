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

const contagemTop = (lista) => {
  const m = new Map();
  for (const k of lista) m.set(k, (m.get(k) || 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || '';
};

/**
 * Quem ganha em cada envio entre as opcoes propostas (sem a referencia, que costuma ser o balcao).
 * Opcoes com o mesmo preco em todos os envios (ex.: Clube Correios e Platinum 2026) viram um grupo so.
 * Com uma unica alternativa, conta em quantos envios ela sai mais barata que a referencia.
 */
export function ganhadores(linhas, cenarios, referencia) {
  const comp = linhas.filter((l) => comparavel(l, cenarios));
  const alts = cenarios.filter((c) => c !== referencia);
  const grupos = [];
  for (const c of alts) {
    const g = grupos.find((gr) => comp.every((l) => Math.abs(l[gr[0]].total - l[c].total) < 0.005));
    g ? g.push(c) : grupos.push([c]);
  }
  const unico = grupos.length === 1;
  const itens = grupos.map((g) => ({ cenarios: g, envios: [] }));
  for (const l of comp) {
    if (unico) { if (l[grupos[0][0]].total < l[referencia].total - 0.004) itens[0].envios.push(l); continue; }
    let melhor = 0;
    grupos.forEach((g, i) => { if (l[g[0]].total < l[grupos[melhor][0]].total) melhor = i; });
    itens[melhor].envios.push(l);
  }
  return {
    modo: unico ? 'unico' : 'disputa',
    total: comp.length,
    itens: itens.map((it) => {
      const c = it.cenarios[0];
      const eco = it.envios.reduce((s, l) => s + (l[referencia].total - l[c].total), 0);
      return {
        cenarios: it.cenarios,
        n: it.envios.length,
        economiaMedia: it.envios.length ? r2(eco / it.envios.length) : 0,
        servicoTop: contagemTop(it.envios.map((l) => l.servico)),
        faixaTop: contagemTop(it.envios.map((l) => faixaPeso(l.pesoG))),
      };
    }).sort((a, b) => b.n - a.n),
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
export function montarRelatorio({ linhas, cenarios, referencia, nomes, cliente, preparadoPor, validadeDias, periodo: per, pacoteNome, vigencia, incluirValorDeclarado, simulacao = false }) {
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
    ganhadores: ganhadores(linhas, cenarios, referencia),
    simulacao: !!simulacao,
    pacoteContrato: pacoteNome,
    vigencia,
    incluirValorDeclarado,
    emitidoEm: new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10),
  };
}
