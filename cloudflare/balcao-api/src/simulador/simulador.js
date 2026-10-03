/* =====================================================
   SIMULADOR DE FRETE (/simulador) - página pública para lojistas
   Origem fixa: Fortaleza/CE. Mesmo motor do /balcao e do /comparador (D1).

   O Brasil vira um conjunto finito de zonas de preço:
     zona = coluna do balcão (LOCAL, ESTADUAL, F1-F6) + escala (CAPITAL/INTERIOR)
            + coluna do contrato/App (L, E, N, P, I)
   Cada UF tem até 4 tipos de cidade (CAPITAL, POLO, MEDIA, INTERIOR);
   o CE tem RMF, CE_POLO e CE_INT; o RN tem DIVISA (Mossoró).

   Rotas (sem login, com limite por IP):
     GET /api/simulador/config            UFs, tipos de cidade, zonas, caixas e pesos
     GET /api/simulador/precos?c&l&a&p    preço de todas as zonas para uma embalagem
     GET /api/simulador/cep?cep=          cidade, UF, tipo e zona do CEP
   ===================================================== */
import { carregarBase, classificarTrecho, calcularPrecos, normalizarMunicipio } from '../preco/preco-avista.js';
import { carregarBaseTabelas, classificarTrechoTabela, calcularContrato, calcularApp } from '../preco/preco-tabelas.js';

export const SIMULADOR_VERSAO = 'simulador-2026.10.03b';
const ORIGEM = { uf: 'CE', municipio: 'FORTALEZA' };
const SERVICOS = ['SEDEX', 'PAC'];
const GENERICO = 'ZZ INTERIOR'; // cidade fora das listas: cai em "demais do interior"

/** Embalagens do simulador (C x L x A em cm). MINI = tamanho máximo do Mini Envios. */
export const CAIXAS = [
  { codigo: 'MINI', nome: 'Mini Envios', medidas: [24, 16, 4], pesoMaxG: 1000, destaque: true },
  { codigo: 'T1', nome: 'Tipo 1', medidas: [18, 13.5, 9] },
  { codigo: 'T2', nome: 'Tipo 2', medidas: [27, 18, 9] },
  { codigo: 'T3', nome: 'Tipo 3', medidas: [27, 22.5, 13.5] },
  { codigo: 'T4', nome: 'Tipo 4', medidas: [36, 27, 18] },
  { codigo: 'T6', nome: 'Tipo 6', medidas: [36, 27, 27] },
  { codigo: 'T5', nome: 'Tipo 5', medidas: [54, 36, 27] },
];
export const PESOS_G = [300, 1000, 3000, 5000, 10000, 15000, 30000];

const NOMES_TIPO = {
  RMF: 'Fortaleza e região metropolitana', CE_POLO: 'Interior do CE, cidade polo', CE_INT: 'Demais cidades do Ceará',
  DIVISA: 'Mossoró (divisa com o CE)', CAPITAL: 'Capital e região metropolitana', POLO: 'Cidade polo do interior',
  MEDIA: 'Cidade média do interior', INTERIOR: 'Demais cidades do interior',
};
const CAPITAIS = {
  AC: 'RIO BRANCO', AL: 'MACEIO', AP: 'MACAPA', AM: 'MANAUS', BA: 'SALVADOR', CE: 'FORTALEZA', DF: 'BRASILIA', ES: 'VITORIA',
  GO: 'GOIANIA', MA: 'SAO LUIS', MT: 'CUIABA', MS: 'CAMPO GRANDE', MG: 'BELO HORIZONTE', PA: 'BELEM', PB: 'JOAO PESSOA',
  PR: 'CURITIBA', PE: 'RECIFE', PI: 'TERESINA', RJ: 'RIO DE JANEIRO', RN: 'NATAL', RS: 'PORTO ALEGRE', RO: 'PORTO VELHO',
  RR: 'BOA VISTA', SC: 'FLORIANOPOLIS', SP: 'SAO PAULO', SE: 'ARACAJU', TO: 'PALMAS',
};
// Acentos de nomes que no D1 só existem normalizados (tabela de classificação de cidades).
const ACENTOS = {
  Sao: 'São', Jose: 'José', Joao: 'João', Ribeirao: 'Ribeirão', Antao: 'Antão', Conceicao: 'Conceição', Uberlandia: 'Uberlândia',
  Marilia: 'Marília', Maringa: 'Maringá', Taubate: 'Taubaté', Jacarei: 'Jacareí', Aracatuba: 'Araçatuba', Criciuma: 'Criciúma',
  Chapeco: 'Chapecó', Camboriu: 'Camboriú', Iguacu: 'Iguaçu', Rondonopolis: 'Rondonópolis', Araguaina: 'Araguaína',
  Paranagua: 'Paranaguá', Paranavai: 'Paranavaí', Parnaiba: 'Parnaíba', Mossoro: 'Mossoró', Divinopolis: 'Divinópolis',
  Teofilo: 'Teófilo', Macae: 'Macaé', Itaguai: 'Itaguaí', Catalao: 'Catalão', Jatai: 'Jataí', Ijui: 'Ijuí', Corumba: 'Corumbá',
  Pora: 'Porã', Tres: 'Três', Tangara: 'Tangará', Vitoria: 'Vitória', Goncalves: 'Gonçalves', Balneario: 'Balneário',
  Parana: 'Paraná', Mucajai: 'Mucajaí', Axixa: 'Axixá', Araucaria: 'Araucária', Santarem: 'Santarém', Maraba: 'Marabá',
  Ilheus: 'Ilhéus', Cristovao: 'Cristóvão', Petropolis: 'Petrópolis', Sertaozinho: 'Sertãozinho', Guaratingueta: 'Guaratinguetá',
  Itajai: 'Itajaí', Jundiai: 'Jundiaí', Anapolis: 'Anápolis', Luziania: 'Luziânia', Camacari: 'Camaçari', Simoes: 'Simões',
  Jaboatao: 'Jaboatão', Goiania: 'Goiânia', Brasilia: 'Brasília', Belem: 'Belém', Macapa: 'Macapá', Maceio: 'Maceió',
  Cuiaba: 'Cuiabá', Luis: 'Luís', Florianopolis: 'Florianópolis', Uberaba: 'Uberaba', Eusebio: 'Eusébio', Maracanau: 'Maracanaú',
  Guaiuba: 'Guaiúba', Goncalo: 'Gonçalo', 'Niteroí': 'Niterói', 'Cristovão': 'Cristóvão', Aparecida: 'Aparecida',
};
const r2 = (v) => Math.round((Number(v) + Number.EPSILON) * 100) / 100;
const erro = (msg, status = 422) => Object.assign(new Error(msg), { status });

function nomeBonito(norm, acentuado) {
  return String(acentuado || norm).toLowerCase()
    .replace(/(^|[\s'-])(\S)/g, (m, a, b) => a + b.toUpperCase())
    .split(' ').map((w) => ACENTOS[w] || w).join(' ')
    .replace(/ (De|Do|Da|Dos|Das|E|D') /g, (m) => m.toLowerCase());
}

/** Tipo de cidade a partir dos trechos do balcão (ta) e do contrato (tt). */
export function tipoDaCidade(ta, tt, uf) {
  if (tt.tipo === 'LOCAL') return 'RMF';
  if (tt.tipo === 'DIVISA') return 'DIVISA';
  if (tt.tipo === 'ESTADUAL') return tt.coluna === 'E3' ? 'CE_POLO' : 'CE_INT';
  const c = String(tt.coluna)[0];
  if (c === 'N') return ta.escala === 'CAPITAL' ? 'CAPITAL' : 'POLO';
  if (c === 'P') return 'MEDIA';
  return uf === 'CE' ? 'CE_INT' : 'INTERIOR';
}
const chaveZona = (ta, tt) => [ta.coluna, ta.escala, typeof tt.coluna === 'string' ? tt.coluna : tt.coluna.SEDEX + '-' + tt.coluna.PAC].join('_');

function classificar(baseA, baseT, uf, municipio) {
  const destino = { uf, municipio };
  const ta = classificarTrecho(baseA, ORIGEM, destino);
  const tt = classificarTrechoTabela(baseT, baseA.loc, ORIGEM, destino);
  return { ta, tt, tipo: tipoDaCidade(ta, tt, uf), zona: chaveZona(ta, tt) };
}

// ---------------------------------------------------------------- mapa de zonas (cache por isolate)
let mapaMem = null; // { chave, mapa }

/** UFs -> tipos -> { zona, n, ex[] } e zonas -> trechos de uma cidade representativa. Função pura. */
export function montarMapa(baseA, baseT) {
  const cidades = new Map(); // uf|norm -> nome acentuado (ou '')
  for (const k of baseT.classe.keys()) cidades.set(k, '');
  for (const [k, l] of baseA.loc) cidades.set(k, l.municipio || '');
  const ufs = [...new Set([...baseA.col.keys()].filter((k) => k.startsWith('CE|')).map((k) => k.split('|')[1]).concat('CE'))];
  for (const uf of ufs) cidades.set(uf + '|' + GENERICO, null);

  const mapa = {}; const zonas = {};
  for (const [k, acentuado] of cidades) {
    const [uf, norm] = k.split('|');
    let c;
    try { c = classificar(baseA, baseT, uf, norm); } catch (_) { continue; }
    if (!zonas[c.zona]) zonas[c.zona] = { uf, municipio: norm, balcao: c.ta.coluna + ' ' + c.ta.escala, contrato: c.tt.coluna };
    const tipos = (mapa[uf] ??= {});
    const g = (tipos[c.tipo] ??= { zona: c.zona, nome: NOMES_TIPO[c.tipo], n: 0, ex: [] });
    if (acentuado === null) continue;
    g.n++;
    if (g.ex.length < 6) g.ex.push(nomeBonito(norm, acentuado));
  }
  for (const [uf, tipos] of Object.entries(mapa)) {
    for (const [t, g] of Object.entries(tipos)) {
      if ((t === 'CAPITAL' || t === 'RMF') && CAPITAIS[uf]) {
        const cap = nomeBonito(CAPITAIS[uf], baseA.loc.get(uf + '|' + CAPITAIS[uf])?.municipio);
        g.ex = [cap, ...g.ex.filter((x) => x !== cap)];
      }
      g.ex = g.ex.slice(0, 4);
    }
  }
  return { ufs: mapa, zonas };
}

async function carregarMapa(env) {
  const [baseA, baseT] = await Promise.all([carregarBase(env.DB), carregarBaseTabelas(env.DB)]);
  const chave = baseA.vigencia + '|' + baseT.vigencia + '|' + baseT.classe.size + '|' + baseA.loc.size;
  if (!mapaMem || mapaMem.chave !== chave) mapaMem = { chave, mapa: montarMapa(baseA, baseT) };
  return { baseA, baseT, mapa: mapaMem.mapa };
}

export async function configSimulador(env) {
  const { baseA, baseT, mapa } = await carregarMapa(env);
  const re = baseT.re, ad = baseA.ad;
  const adicionais = {
    arAvista: ad.AR, arContrato: re.CTR_AR, vdMinimo: ad.INDENIZACAO_AUTOMATICA,
    vdMaximo: { MINI: re.MINI_VD_MAX, PAC: Math.min(re.CTR_VD_MAX_PAC, Number((baseA.servicos.find((x) => x.chave === 'PAC') || {}).vd_max) || Infinity),
      SEDEX: Math.min(re.CTR_VD_MAX_SEDEX, Number((baseA.servicos.find((x) => x.chave === 'SEDEX') || {}).vd_max) || Infinity) },
  };
  return { versao: SIMULADOR_VERSAO, vigencia: baseT.vigencia || baseA.vigencia, ufs: mapa.ufs, caixas: CAIXAS, pesos: PESOS_G, adicionais };
}

// ---------------------------------------------------------------- preços
function lerEntrada(q) {
  const n = (v) => Number(String(v == null ? '' : v).replace(',', '.'));
  const c = n(q.c), l = n(q.l), a = n(q.a), p = Math.ceil(n(q.p));
  if (![c, l, a].every((v) => v > 0 && v <= 200)) throw erro('Informe as medidas da embalagem em cm.');
  if (!(p > 0 && p <= 30000)) throw erro('Informe o peso entre 1 g e 30 kg.');
  const vd = q.vd == null || q.vd === '' ? 0 : n(q.vd);
  if (!(vd >= 0 && vd <= 50000)) throw erro('Valor declarado inválido.');
  return { comprimentoCm: c, larguraCm: l, alturaCm: a, pesoG: p, valorDeclarado: Math.round(vd * 100) / 100, ar: q.ar === '1' };
}
const total = (r) => (r && r.ok ? r2(r.total) : null);

/**
 * Preço de uma embalagem em uma zona: balcão, contrato (Platinum e Clube, com Mini Envios) e App.
 * e.valorDeclarado e e.ar entram em todos: balcão (2% e AR à vista), contrato (1% e AR a faturar),
 * Mini Envios (2%, até o máximo do serviço) e App (2% e AR à vista).
 */
export function precosDaZona(baseA, baseT, z, e) {
  const destino = { uf: z.uf, municipio: z.municipio };
  const ta = classificarTrecho(baseA, ORIGEM, destino);
  const tt = classificarTrechoTabela(baseT, baseA.loc, ORIGEM, destino);
  const av = calcularPrecos(baseA, e, ta).opcoes;
  const out = { AVISTA: {}, PLATINUM: {}, CLUBE: {}, APP_PESO: {}, APP_VOLUME: {} };
  for (const s of SERVICOS) {
    out.AVISTA[s] = total(av.find((o) => o.chave === s));
    for (const [k, tabela] of [['PLATINUM', 'PLATINUM'], ['CLUBE', 'CLUBE_CORREIOS']]) {
      const r = calcularContrato(baseT, e, tt, { tabela, servico: s, usarMini: s === 'PAC' });
      if (s === 'PAC') {
        out[k].MINI = r.mini && r.mini.ok ? r2(r.mini.total + (e.ar ? baseT.re.CTR_AR : 0)) : null; // AR também no Mini Envios
        out[k].PAC = r.ok ? r2(r.servicoUsado === 'MINI' ? calcularContrato(baseT, e, tt, { tabela, servico: 'PAC', usarMini: false }).total : r.total) : null;
      } else out[k][s] = total(r);
    }
    const adicionais = { AR: baseA.ad.AR || 0, MP: baseA.ad.MP || 0 };
    out.APP_PESO[s] = total(calcularApp(baseT, e, tt, { servico: s, considerarPesoReal: true, adicionais }));
    out.APP_VOLUME[s] = total(calcularApp(baseT, e, tt, { servico: s, adicionais }));
  }
  return out;
}

export async function precosSimulador(env, q) {
  const e = lerEntrada(q);
  const { baseA, baseT, mapa } = await carregarMapa(env);
  const zonas = {};
  for (const [k, z] of Object.entries(mapa.zonas)) zonas[k] = precosDaZona(baseA, baseT, z, e);
  const vol = e.comprimentoCm * e.larguraCm * e.alturaCm;
  const cub6 = Math.ceil(vol / baseT.re.CTR_DIVISOR * 1000), cub7 = Math.ceil(vol / baseT.re.APP_DIVISOR * 1000);
  return {
    entrada: e,
    pesoTarifadoG: {
      contrato: cub6 > baseT.re.CTR_ISENCAO_CUBAGEM_KG * 1000 ? Math.max(e.pesoG, cub6) : e.pesoG,
      appPeso: Math.max(e.pesoG, cub7), appVolume: cub7,
    },
    miniCabe: zonas[Object.keys(zonas)[0]]?.PLATINUM.MINI != null,
    zonas,
  };
}

export async function cepSimulador(env, buscarCep, cep) {
  const r = await buscarCep(env, cep);
  const { baseA, baseT, mapa } = await carregarMapa(env);
  const uf = String(r.uf || '').toUpperCase();
  if (!mapa.ufs[uf]) throw erro('CEP fora das áreas atendidas pelo simulador.');
  let c;
  try { c = classificar(baseA, baseT, uf, normalizarMunicipio(r.municipio)); } catch (e2) { throw erro(e2.message); }
  return { cep: r.cep, cidade: r.municipio, uf, tipo: c.tipo, zona: c.zona };
}
