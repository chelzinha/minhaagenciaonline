/* =====================================================
   CAMINHO 1B - PRECO DE CONTRATO E DO CORREIOS APP (Comparador)
   - Fonte unica: tabelas cmp_* do D1 (16 pacotes de contrato + App),
     geradas por tools/comparador/gerar_comparador_d1.py.
   - Localidades (RMF, divisa, regiao metropolitana) vem do mesmo D1 do balcao
     (balcao_localidades), recebidas ja montadas pelo motor a vista.
   - NAO acessa a internet. NAO usa credencial dos Correios.
   - Validado contra postagens reais de contrato e de App do Atende (abr-set/2026).
   ===================================================== */
import { normalizarMunicipio, calcularPeso } from './preco-avista.js';

export const TABELAS_VERSAO = 'preco-tabelas-2026.10.03b';
const BASE_TTL_MS = 10 * 60 * 1000;
let baseMem = null; // { base, ate }

const r2 = (v) => Math.round((Number(v) + Number.EPSILON) * 100) / 100;
const erro = (msg) => Object.assign(new Error(msg), { status: 422 });

// ---------------------------------------------------------------- base (D1)
/** Indices em memoria. Funcao pura (usada nos testes). */
export function montarBaseTabelas({ tabelas, tarifas, faixaUf, classes, regras }) {
  const tar = new Map();
  const faixas = new Map(); // tabela|servico -> [pesos max ordenados]
  for (const t of tarifas) {
    const peso = Number(t.peso_max_g);
    tar.set([t.tabela, t.servico, t.coluna, t.tipo, peso].join('|'), Number(t.preco));
    if (t.tipo === 'FAIXA') {
      const k = t.tabela + '|' + t.servico;
      if (!faixas.has(k)) faixas.set(k, new Set());
      faixas.get(k).add(peso);
    }
  }
  const fx = new Map([...faixas].map(([k, s]) => [k, [...s].sort((a, b) => a - b)]));
  const re = {};
  for (const r of regras) re[r.chave] = Number(r.valor);
  const tabs = [...tabelas].sort((a, b) => Number(a.ordem) - Number(b.ordem));
  return {
    tabelas: tabs,
    porCodigo: new Map(tabs.map((t) => [t.codigo, t])),
    tar, fx,
    faixaUf: new Map(faixaUf.map((r) => [r.uf, { capital: Number(r.faixa_capital), interior: Number(r.faixa_interior) }])),
    classe: new Map(classes.map((r) => [r.uf + '|' + r.municipio_norm, r.classe])),
    re,
    vigencia: tabs[0] ? tabs[0].vigencia : '',
  };
}

/** Le as tabelas cmp_* do D1 (cache de 10 min por isolate). */
export async function carregarBaseTabelas(db) {
  const agora = Date.now();
  if (baseMem && baseMem.ate > agora) return baseMem.base;
  const [t, p, f, c, r] = await db.batch([
    db.prepare('SELECT codigo, nome, tipo, ordem, observacao, vigencia FROM cmp_tabelas'),
    db.prepare('SELECT tabela, servico, coluna, tipo, peso_max_g, preco FROM cmp_tarifas'),
    db.prepare('SELECT uf, faixa_capital, faixa_interior FROM cmp_faixa_uf'),
    db.prepare('SELECT uf, municipio_norm, classe FROM cmp_classe_cidade'),
    db.prepare('SELECT chave, valor FROM cmp_regras'),
  ]);
  const base = montarBaseTabelas({ tabelas: t.results, tarifas: p.results, faixaUf: f.results, classes: c.results, regras: r.results });
  if (!base.tabelas.length || base.tar.size === 0) throw Object.assign(new Error('Tabelas do comparador não carregadas no D1.'), { status: 503 });
  baseMem = { base, ate: agora + BASE_TTL_MS };
  return base;
}

// ---------------------------------------------------------------- trecho
/**
 * Coluna de preco do contrato e do App (L, E, N, P, I + numero), origem na RMF.
 * Regras da MATRIZ ORIGEM E DESTINO - CEARA, conferidas em postagens reais:
 *  1. Destino na RMF: SEDEX L3; PAC e Mini E3 (PAC nao tem coluna L).
 *  2. Divisa (Mossoro/RN): E3.
 *  3. Dentro do CE: E3 para cidades A+, A e B; E4 para as demais.
 *  4. Outra UF: N (capital, regiao metropolitana, cidade A+ ou A) ou P (cidade B), com a faixa
 *     do corredor Fortaleza E+; I (demais) com a faixa da Matriz.
 * @param loc  Map de balcao_localidades (base a vista)
 */
export function classificarTrechoTabela(baseT, loc, origem, destino) {
  const locO = loc.get(origem.uf + '|' + normalizarMunicipio(origem.municipio));
  if (!locO || locO.trecho_especial !== 'LOCAL') throw erro('As tabelas de contrato e App estão carregadas para origem na Região Metropolitana de Fortaleza.');
  const uf = String(destino.uf || '').toUpperCase();
  const mun = normalizarMunicipio(destino.municipio);
  const locD = loc.get(uf + '|' + mun);
  const classe = baseT.classe.get(uf + '|' + mun) || '';
  if (locD && locD.trecho_especial === 'LOCAL') return { tipo: 'LOCAL', coluna: { SEDEX: 'L3', PAC: 'E3', MINI: 'E3' }, motivo: 'Local (Região Metropolitana de Fortaleza)', classe };
  if (locD && locD.trecho_especial === 'DIVISA') return { tipo: 'DIVISA', coluna: 'E3', motivo: 'Divisa (Mossoró/RN)', classe };
  if (uf === origem.uf) {
    const prioritario = ['A+', 'A', 'B'].includes(classe);
    return { tipo: 'ESTADUAL', coluna: prioritario ? 'E3' : 'E4', motivo: prioritario ? 'Estadual, cidade prioritária' : 'Estadual', classe };
  }
  const f = baseT.faixaUf.get(uf);
  if (!f) throw erro('UF de destino inválida: ' + (uf || 'vazia') + '.');
  const capital = (locD && locD.classe_avista === 'CAPITAL') || classe === 'A+' || classe === 'A';
  if (capital) return { tipo: 'NACIONAL', coluna: 'N' + f.capital, motivo: 'Capital ou cidade A+/A', classe };
  if (classe === 'B') return { tipo: 'NACIONAL', coluna: 'P' + f.capital, colunaSemP: 'I' + f.interior, motivo: 'Interior prioritário (cidade B)', classe };
  return { tipo: 'NACIONAL', coluna: 'I' + f.interior, motivo: 'Interior', classe };
}

function colunaDoServico(trecho, servico) {
  return typeof trecho.coluna === 'string' ? trecho.coluna : trecho.coluna[servico];
}

// ---------------------------------------------------------------- preco
function precoFaixa(baseT, tabela, servico, coluna, pesoG) {
  const lista = baseT.fx.get(tabela + '|' + servico);
  if (!lista) return null;
  const k = (tipo, p) => baseT.tar.get([tabela, servico, coluna, tipo, p].join('|'));
  const p = Math.max(1, Math.ceil(pesoG));
  const teto = lista[lista.length - 1];
  for (const f of lista) if (p <= f) { const v = k('FAIXA', f); return v == null ? null : { preco: v, faixa: f }; }
  const vTeto = k('FAIXA', teto), kg = k('KG_ADICIONAL', teto);
  if (vTeto == null || kg == null) return null;
  const extras = Math.ceil((p - teto) / 1000);
  return { preco: r2(vTeto + extras * kg), faixa: teto + extras * 1000 };
}

function adValorem(vd, indenizacao, pct) {
  return vd > 0 ? r2(Math.max(0, vd - indenizacao) * pct) : 0;
}

function dimensoes(e) {
  return [e.alturaCm, e.larguraCm, e.comprimentoCm].map(Number).map((v) => (v > 0 ? v : 0));
}

/** Mini Envios: so para PAC, ate 1 kg real, dentro do formato e do valor declarado maximo. */
function precoMini(baseT, tabela, trecho, entrada) {
  const re = baseT.re;
  const dims = dimensoes(entrada).sort((a, b) => b - a);
  const vd = Math.max(0, Number(entrada.valorDeclarado) || 0);
  if (!(dims[0] > 0 && dims[1] > 0 && dims[2] > 0)) return { ok: false, motivo: 'Sem medidas para conferir o formato.' };
  if (dims[0] > re.MINI_COMP_MAX_CM || dims[1] > re.MINI_LARG_MAX_CM || dims[2] > re.MINI_ALT_MAX_CM) return { ok: false, motivo: 'Fora do formato do Mini Envios.' };
  const peso = Math.ceil(Number(entrada.pesoG) || 0);
  if (peso <= 0 || peso > re.MINI_PESO_MAX_G) return { ok: false, motivo: 'Peso acima de 1 kg.' };
  if (vd > re.MINI_VD_MAX) return { ok: false, motivo: 'Valor declarado acima do máximo do Mini Envios.' };
  const coluna = colunaDoServico(trecho, 'MINI');
  const pb = peso <= re.MINI_PESO_TABELA_G ? precoFaixa(baseT, tabela, 'MINI', coluna, peso) : precoFaixa(baseT, tabela, 'PAC', coluna, peso);
  if (!pb) return { ok: false, motivo: 'Sem tarifa de Mini Envios para o trecho ' + coluna + '.' };
  const vdValor = adValorem(vd, re.MINI_INDENIZACAO, re.MINI_VD_PCT);
  return { ok: true, total: r2(pb.preco + vdValor), precoBase: pb.preco, vdValor, coluna };
}

/**
 * Preco de contrato (qualquer pacote: PLATINUM, CLUBE_CORREIOS, DIAMANTE_1 ...).
 * entrada: { pesoG, alturaCm, larguraCm, comprimentoCm, tipoObjeto, valorDeclarado, ar, maoPropria }
 * AR e MP do contrato: valores a faturar da Tabela de Servicos Nacionais (cmp_regras CTR_AR, CTR_MP).
 */
export function calcularContrato(baseT, entrada, trecho, { tabela, servico, usarMini = true }) {
  const re = baseT.re;
  if (!baseT.porCodigo.has(tabela)) return { ok: false, erro: 'Tabela de contrato desconhecida: ' + tabela + '.' };
  if (servico !== 'SEDEX' && servico !== 'PAC') return { ok: false, erro: 'Serviço sem comparação.' };
  const peso = calcularPeso(entrada, { CUBAGEM_DIVISOR: re.CTR_DIVISOR, CUBAGEM_ISENCAO_KG: re.CTR_ISENCAO_CUBAGEM_KG });
  if (peso.pesoRealG <= 0) return { ok: false, erro: 'Peso ausente.' };
  // Limite de 30 kg vale para o peso real; o cúbico acima disso é cobrado com kg adicional (conferido no Atende).
  if (peso.pesoRealG > re.LIMITE_PESO_G) return { ok: false, erro: 'Peso acima de 30 kg.' };
  const vd = Math.max(0, Number(entrada.valorDeclarado) || 0);
  if (vd > (servico === 'SEDEX' ? re.CTR_VD_MAX_SEDEX : re.CTR_VD_MAX_PAC)) return { ok: false, erro: 'Valor declarado acima do máximo do contrato.' };
  const coluna = colunaDoServico(trecho, servico);
  const pb = precoFaixa(baseT, tabela, servico, coluna, peso.pesoTarifadoG);
  if (!pb) return { ok: false, erro: 'Sem tarifa de ' + servico + ' para o trecho ' + coluna + '.' };
  const dims = dimensoes(entrada);
  const manuseio = String(entrada.tipoObjeto || '').toUpperCase() === 'ROLO' || dims.some((d) => d > re.DIMENSAO_ESPECIAL_CM);
  const vdValor = adValorem(vd, re.CTR_INDENIZACAO, re.CTR_VD_PCT);
  const arMp = r2((entrada.ar ? re.CTR_AR : 0) + (entrada.maoPropria ? re.CTR_MP : 0));
  const extras = r2(arMp + (manuseio ? re.MANUSEIO_ESPECIAL : 0));
  const total = r2(pb.preco + vdValor + extras);
  const res = { ok: true, total, precoBase: pb.preco, vdValor, extras, coluna, pesoTarifadoG: peso.pesoTarifadoG, servicoUsado: servico };
  if (usarMini && servico === 'PAC') {
    const mini = precoMini(baseT, tabela, trecho, entrada);
    res.mini = mini;
    const miniTotal = mini.ok ? r2(mini.total + arMp) : null;
    if (mini.ok && miniTotal < total) Object.assign(res, { total: miniTotal, precoBase: mini.precoBase, vdValor: mini.vdValor, servicoUsado: 'MINI', coluna: mini.coluna });
  }
  return res;
}

/**
 * Preco no Correios App: peso cubico (divisor 7000), ad valorem 2%. AR e MP a vista (do balcao).
 * considerarPesoReal=false (padrao, como o Atende registra): so o cubico.
 * considerarPesoReal=true (regra oficial, usada no /simulador "por peso"): maior entre real e cubico.
 */
export function calcularApp(baseT, entrada, trecho, { servico, adicionais = {}, considerarPesoReal = false }) {
  const re = baseT.re;
  if (servico !== 'SEDEX' && servico !== 'PAC') return { ok: false, erro: 'Serviço sem comparação.' };
  const dims = dimensoes(entrada);
  const semMedidas = !(dims[0] > 0 && dims[1] > 0 && dims[2] > 0);
  const cubicoG = semMedidas ? 1 : Math.ceil((dims[0] * dims[1] * dims[2] / re.APP_DIVISOR) * 1000);
  const tarifadoG = considerarPesoReal ? Math.max(cubicoG, Math.ceil(Number(entrada.pesoG) || 0)) : cubicoG;
  if (Math.ceil(Number(entrada.pesoG) || 0) > re.LIMITE_PESO_G) return { ok: false, erro: 'Peso acima de 30 kg.' };
  let coluna = colunaDoServico(trecho, servico);
  let pb = precoFaixa(baseT, 'APP', servico, coluna, tarifadoG);
  if (!pb && trecho.colunaSemP) { coluna = trecho.colunaSemP; pb = precoFaixa(baseT, 'APP', servico, coluna, tarifadoG); }
  if (!pb) return { ok: false, erro: 'Sem tarifa do App para o trecho ' + coluna + '.' };
  const vd = Math.max(0, Number(entrada.valorDeclarado) || 0);
  const vdValor = adValorem(vd, re.APP_INDENIZACAO, re.APP_VD_PCT);
  const extras = r2((entrada.ar ? adicionais.AR || 0 : 0) + (entrada.maoPropria ? adicionais.MP || 0 : 0));
  return {
    ok: true, total: r2(pb.preco + vdValor + extras), precoBase: pb.preco, vdValor, extras, coluna,
    pesoTarifadoG: tarifadoG, aviso: semMedidas ? 'Sem medidas: App calculado na faixa mínima.' : '',
  };
}
