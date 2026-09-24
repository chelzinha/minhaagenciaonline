/**
 * AGF Cadastros - Motor de identidade de clientes (NOME REMETENTE x CLIENTE PORTAL)
 *
 * Regra de negocio:
 *  - CLIENTE PORTAL = BALCAO, GAS SHOPPING METRO ou GAS SHOPPING CENTRO FASHION  -> identidade vem do NOME REMETENTE (limpo)
 *  - Qualquer outro CLIENTE PORTAL                                               -> identidade e o proprio CLIENTE PORTAL
 *  - Dois CLIENTE PORTAL diferentes nunca viram um cliente so (o Portal e a verdade).
 *  - Decisao humana vence o motor. "Nao e o mesmo cliente" vira restricao permanente.
 *
 * O motor e deterministico e puro (sem I/O). Roda igual no Worker e no Node (testes).
 */

export const MOTOR_VERSAO = '2026-09-24.1';

export const ORIGENS_COMPARTILHADAS = {
  'BALCAO': 'BALCAO',
  'GAS SHOPPING METRO': 'METRO',
  'GAS SHOPPING CENTRO FASHION': 'CF',
  'GAS CENTRO FASHION': 'CF',
};

const JUNK = new Set(['', 'REMETENTE', 'BALCAO', 'SEM REGISTRO', 'SEM REMETENTE', 'NAO INFORMADO', 'CLIENTE', 'X', 'XX', 'XXX',
  'TESTE', 'NA', 'N A', 'NULL', 'GAS SHOPPING METRO', 'GAS SHOPPING CENTRO FASHION', 'CONSUMIDOR', 'DIVERSOS']);
const LEGAL = new Set(['LTDA', 'ME', 'EPP', 'EIRELI', 'SA', 'S', 'A', 'MEI', 'SS', 'SLU', 'CIA']);
const GERACAO = new Set(['FILHO', 'FILHA', 'JUNIOR', 'JR', 'NETO', 'NETA', 'SOBRINHO', 'SEGUNDO', 'II']);
const CONECTIVOS = new Set(['DE', 'DA', 'DO', 'DAS', 'DOS', 'E']);
const EMPRESA = new Set(['COMERCIO', 'COM', 'SERVICOS', 'SERVICO', 'INDUSTRIA', 'IND', 'DISTRIBUIDORA', 'CONFECCOES', 'ATACADISTA',
  'REPRESENTACOES', 'EMPRESA', 'INSTITUTO', 'ASSOCIACAO', 'FUNDACAO', 'COMPANHIA', 'CLINICA', 'BANCO', 'AGENCIA', 'TRANSPORTE',
  'TRANSPORTES', 'LOGISTICA', 'CONSULTORIA', 'CONSULTORES', 'EQUIPAMENTOS', 'IMPORTACAO', 'IMPORTACOES', 'EXPORTACAO',
  'COOPERATIVA', 'SECRETARIA', 'PREFEITURA', 'UNIVERSIDADE', 'FACULDADE', 'ESCOLA', 'COLEGIO', 'IGREJA', 'COMUNIDADE',
  'SINDICATO', 'CONDOMINIO', 'HOSPITAL', 'LABORATORIO', 'FARMACIA', 'MODAS', 'MODA', 'PRESENTES', 'CALCADOS', 'TECIDOS',
  'ROUPAS', 'VEICULOS', 'PECAS', 'AUTOPECAS', 'MATERIAIS', 'PRODUTOS', 'LOJA', 'STORE', 'ESTETICA', 'ODONTO', 'ODONTOLOGICA',
  'ADVOCACIA', 'ADVOGADOS', 'CONTABILIDADE', 'ENGENHARIA', 'TECNOLOGIA', 'INFORMATICA', 'EDUCACIONAL', 'EDITORA', 'GRAFICA',
  'ALIMENTOS', 'BIJUTERIAS', 'ACESSORIOS', 'SEMIJOIAS', 'JOIAS', 'COSMETICOS', 'DELEGACIA', 'TRIBUNAL', 'MINISTERIO',
  'CONSELHO', 'MUNICIPIO', 'ESTADO', 'GOVERNO']);

/** Regras que o motor aplica sozinho (agrupamento automatico). */
export const REGRAS = {
  DECISAO_MANUAL: 'Decisao manual registrada',
  DECISAO_PLANILHA: 'Decisao manual da planilha CADASTRO_MESTRE_CLIENTES',
  IGUAL_PORTAL: 'Mesmo nome de um cliente do Portal (ou mesma grafia normalizada)',
  SEM_ESPACO: 'Mesmo nome digitado sem espacos ou com outra pontuacao',
  MESMO_CNPJ_RAIZ: 'Mesmo CNPJ raiz no inicio do nome (MEI)',
  NOME_CORTADO: 'Nome cortado pelo sistema; existe um unico nome mais completo',
  MESMAS_PALAVRAS: 'Mesmas palavras em outra ordem ou sem conectivos',
  GRAFIA_QUASE_IGUAL: 'Erro de digitacao minimo (>= 95% igual, 3+ palavras)',
};

/** Motivos que so viram sugestao (decisao humana). */
export const MOTIVOS_SUGESTAO = {
  NOME_CONTIDO: 'Um nome esta contido no outro',
  NOME_CONTIDO_COMUM: 'Nome curto e comum contido no outro',
  NOME_CONTIDO_GERACAO: 'Contido, mas o outro tem FILHO/JUNIOR/NETO',
  GRAFIA_PARECIDA: 'Grafia parecida',
};

// ---------------------------------------------------------------- normalizacao

export function corrigirCodificacao(s) {
  s = String(s ?? '').replace(/_x008[0-9A-F]_/g, '');
  if (/[ÃÂ]/.test(s)) {
    try {
      const bytes = new Uint8Array([...s].map((c) => {
        const code = c.charCodeAt(0);
        if (code > 255) throw new Error('fora');
        return code;
      }));
      const t = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
      s = t;
    } catch (_) { /* mantem */ }
  }
  return s;
}

export function semAcento(s) {
  return s.normalize('NFKD').replace(/[̀-ͯ]/g, '');
}

export function chaveBase(s) {
  s = semAcento(corrigirCodificacao(s).replace(/(\p{L})[¿�](\p{L})/gu, '$1$2')).toUpperCase();
  return s.replace(/[^A-Z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}

export function analisarNome(raw) {
  let b = chaveBase(raw);
  let doc = '';
  const m = b.match(/^(\d[\d ]{6,13}\d)\s+(?=[A-Z])/);
  if (m) { doc = m[1].replace(/ /g, ''); b = b.slice(m[0].length); }
  b = b.replace(/\s+C\s?\d{1,2}$/, '');
  const toks = b ? b.split(' ') : [];
  let core = toks.filter((t) => !/^\d+$/.test(t));
  if (!core.length) core = toks.slice();
  while (core.length > 1 && LEGAL.has(core[core.length - 1])) core.pop();
  const semSufixo = core.filter((t) => t !== 'LTDA' && t !== 'EIRELI' && t !== 'EPP');
  if (semSufixo.length) core = semSufixo;
  const h = Math.floor(core.length / 2);
  if (core.length >= 2 && core.length % 2 === 0 && core.slice(0, h).join(' ') === core.slice(h).join(' ')) core = core.slice(0, h);
  return { full: b, core: core.join(' '), compact: core.join(''), doc, toks: core };
}

export function ehLixo(p) {
  return JUNK.has(p.core) || p.compact.length < 3 || !/[A-Z]{2}/.test(p.compact);
}

export function nomeExibicao(raw) {
  return corrigirCodificacao(raw).replace(/(\p{L})[¿�](\p{L})/gu, '$1$2').toUpperCase().replace(/\s+/g, ' ').trim();
}

// ---------------------------------------------------------------- comparacao

function tokensSig(toks) { return toks.filter((t) => !CONECTIVOS.has(t) && t.length >= 2); }

function prefixoDe(x, y) {
  if (x.length > y.length) return false;
  for (let i = 0; i < x.length; i++) {
    if (i === x.length - 1) { if (!y[i].startsWith(x[i])) return false; }
    else if (x[i] !== y[i]) return false;
  }
  return x.join(' ') !== y.join(' ');
}

/** Similaridade tipo difflib (Ratcliff/Obershelp). */
export function similaridade(a, b) {
  if (!a.length && !b.length) return 1;
  const matches = (s1, s2) => {
    if (!s1.length || !s2.length) return 0;
    let best = 0, i1 = 0, i2 = 0;
    const prev = new Array(s2.length + 1).fill(0);
    for (let i = 1; i <= s1.length; i++) {
      let diag = 0;
      for (let j = 1; j <= s2.length; j++) {
        const tmp = prev[j];
        prev[j] = s1[i - 1] === s2[j - 1] ? diag + 1 : 0;
        if (prev[j] > best) { best = prev[j]; i1 = i - best; i2 = j - best; }
        diag = tmp;
      }
    }
    if (!best) return 0;
    return best + matches(s1.slice(0, i1), s2.slice(0, i2)) + matches(s1.slice(i1 + best), s2.slice(i2 + best));
  };
  return (2 * matches(a, b)) / (a.length + b.length);
}

function pontuarPar(a, b, freq) {
  const sa = tokensSig(a), sb = tokensSig(b);
  if (!sa.length || !sb.length) return null;
  const wa = a.filter((t) => !CONECTIVOS.has(t)), wb = b.filter((t) => !CONECTIVOS.has(t));
  const fa = wa[0], fb = wb[0];
  const primeiroOk = fa === fb || (fa.length >= 4 && fb.startsWith(fa)) || (fb.length >= 4 && fa.startsWith(fb));
  if (!primeiroOk) return null;
  // iniciais soltas diferentes (F & A x F W) indicam empresas diferentes
  const ia = wa.filter((t) => t.length === 1).join(''), ib = wb.filter((t) => t.length === 1).join('');
  if (ia && ib && ia !== ib) return null;
  const setA = new Set(wa), setB = new Set(wb);
  if (setA.size >= 2 && setA.size === setB.size && [...setA].every((t) => setB.has(t))) return [97, 'MESMAS_PALAVRAS'];
  const [small, big] = sa.length <= sb.length ? [sa, sb] : [sb, sa];
  const bigSet = new Set(big);
  if (small.length >= 2 && small.every((t) => bigSet.has(t)) && new Set(small).size < bigSet.size) {
    const smallSet = new Set(small);
    const extra = big.filter((t) => !smallSet.has(t));
    if (extra.some((t) => GERACAO.has(t))) return [70, 'NOME_CONTIDO_GERACAO'];
    if (small.length >= 3) return [90, 'NOME_CONTIDO'];
    if (small.some((t) => (freq.get(t) || 0) <= 12)) return [84, 'NOME_CONTIDO'];
    return [72, 'NOME_CONTIDO_COMUM'];
  }
  const r = similaridade(wa.join(' '), wb.join(' '));
  if (r >= 0.95 && Math.min(sa.length, sb.length) >= 3 && wa.length === wb.length) return [96, 'GRAFIA_QUASE_IGUAL'];
  if (r >= 0.90 && Math.min(sa.length, sb.length) >= 2) return [Math.floor(r * 100) - 2, 'GRAFIA_PARECIDA'];
  return null;
}

function segmentar(compact, vocab) {
  const n = compact.length;
  const best = new Array(n + 1).fill(null);
  best[0] = [0, []];
  for (let i = 0; i < n; i++) {
    if (!best[i]) continue;
    for (let j = i + 2; j <= Math.min(n, i + 16); j++) {
      const w = compact.slice(i, j);
      const f = vocab.get(w);
      if (!f) continue;
      const sc = best[i][0] + w.length * w.length + Math.min(f, 50) / 50;
      if (!best[j] || sc > best[j][0]) best[j] = [sc, best[i][1].concat([w])];
    }
  }
  return best[n] ? best[n][1] : null;
}

// ---------------------------------------------------------------- union-find com restricoes

class Grupos {
  constructor() { this.p = new Map(); this.portal = new Map(); this.proibidos = new Map(); }
  raiz(x) {
    if (!this.p.has(x)) this.p.set(x, x);
    let r = x;
    while (this.p.get(r) !== r) r = this.p.get(r);
    while (this.p.get(x) !== r) { const nx = this.p.get(x); this.p.set(x, r); x = nx; }
    return r;
  }
  proibir(a, b) {
    for (const [x, y] of [[a, b], [b, a]]) {
      if (!this.proibidos.has(x)) this.proibidos.set(x, new Set());
      this.proibidos.get(x).add(y);
    }
  }
  podeUnir(ra, rb, membros) {
    if (this.portal.get(ra) && this.portal.get(rb)) return 'DOIS_PORTAIS';
    const ma = membros(ra), mb = new Set(membros(rb));
    for (const x of ma) {
      const proib = this.proibidos.get(x);
      if (proib) for (const y of proib) if (mb.has(y)) return 'SEPARADO_MANUALMENTE';
    }
    return null;
  }
}

// ---------------------------------------------------------------- execucao

/**
 * @param {Array<{origem:'PORTAL'|'BALCAO'|'METRO'|'CF', nome:string, postagens:number, valor:number}>} nomes
 *        nomes recebidos, agregados por origem + grafia
 * @param {object} decisoes
 *   - unir:     Array<[chaveNoA, chaveNoB]>  (humano disse: mesmo cliente)
 *   - separar:  Array<[chaveNoA, chaveNoB]>  (humano disse: nao e o mesmo)
 *   - planilha: Array<[nomeRecebido, nomeManual]> decisoes legadas da planilha
 * @returns {{nos:Map, grupos:Array, sugestoes:Array, log:Array, descartados:Array}}
 */
export function executarMotor(nomes, decisoes = {}) {
  const nos = new Map();
  const descartados = [];
  const grafiaNo = new Map();            // `${origem}\u0001${grafia}` -> chave do no (ou null)
  for (const it of nomes) {
    const p = analisarNome(it.nome);
    const tipo = it.origem === 'PORTAL' ? 'P' : 'S';
    const gk = `${it.origem}\u0001${it.nome}`;
    if ((tipo === 'S' && ehLixo(p)) || !p.core) { descartados.push(it); grafiaNo.set(gk, null); continue; }
    const chave = `${tipo}:${p.core}`;
    grafiaNo.set(gk, chave);
    let no = nos.get(chave);
    if (!no) {
      no = { chave, tipo, p, postagens: 0, valor: 0, grafias: new Map(), origens: new Map(), stoks: p.toks };
      nos.set(chave, no);
    }
    no.postagens += it.postagens || 0;
    no.valor += it.valor || 0;
    no.grafias.set(it.nome, (no.grafias.get(it.nome) || 0) + (it.postagens || 0));
    no.origens.set(it.origem, (no.origens.get(it.origem) || 0) + (it.postagens || 0));
  }

  const g = new Grupos();
  const membrosPorRaiz = new Map();
  for (const k of nos.keys()) {
    g.raiz(k); membrosPorRaiz.set(k, [k]);
    if (nos.get(k).tipo === 'P') g.portal.set(k, k);
  }
  const membros = (r) => membrosPorRaiz.get(r) || [r];
  const log = [];
  const unir = (a, b, regra) => {
    if (!nos.has(a) || !nos.has(b)) return false;
    const ra = g.raiz(a), rb = g.raiz(b);
    if (ra === rb) return false;
    const bloqueio = g.podeUnir(ra, rb, membros);
    if (bloqueio) { log.push({ a, b, regra, bloqueado: bloqueio }); return false; }
    // mantem como raiz o lado que tem Portal
    const [keep, drop] = g.portal.get(rb) && !g.portal.get(ra) ? [rb, ra] : [ra, rb];
    g.p.set(drop, keep);
    if (g.portal.get(drop)) g.portal.set(keep, g.portal.get(drop));
    membrosPorRaiz.set(keep, membros(keep).concat(membros(drop)));
    membrosPorRaiz.delete(drop);
    log.push({ a, b, regra });
    return true;
  };

  // restricoes humanas primeiro
  for (const [a, b] of decisoes.separar || []) g.proibir(a, b);
  for (const [a, b] of decisoes.unir || []) unir(a, b, 'DECISAO_MANUAL');

  // indices
  const porCore = new Map(), porCompact = new Map(), porDoc = new Map(), porPrimeiro = new Map();
  const push = (m, k, v) => { if (!m.has(k)) m.set(k, []); m.get(k).push(v); };
  for (const [k, no] of nos) {
    push(porCore, no.p.core, k);
    push(porCompact, no.p.compact, k);
    if (no.p.doc.length >= 8) push(porDoc, no.p.doc.slice(0, 8), k);
    if (no.p.toks.length) push(porPrimeiro, no.p.toks[0], k);
  }
  // Portal primeiro na lista para virar ancora
  const ordenar = (arr) => arr.sort((x, y) => (nos.get(x).tipo === 'P' ? -1 : 0) - (nos.get(y).tipo === 'P' ? -1 : 0));
  for (const grp of porCore.values()) { ordenar(grp); for (const k of grp.slice(1)) unir(grp[0], k, 'IGUAL_PORTAL'); }
  for (const grp of porCompact.values()) { ordenar(grp); for (const k of grp.slice(1)) unir(grp[0], k, 'SEM_ESPACO'); }
  for (const grp of porDoc.values()) { ordenar(grp); for (const k of grp.slice(1)) unir(grp[0], k, 'MESMO_CNPJ_RAIZ'); }

  // decisoes legadas da planilha
  if (decisoes.planilha?.length) {
    const alvo = new Map();
    for (const [recebido, manual] of decisoes.planilha) {
      const a = analisarNome(recebido), b = analisarNome(manual);
      if (ehLixo(a) || ehLixo(b)) continue;
      for (const k of porCore.get(a.core) || []) push(alvo, b.core, k);
      for (const k of porCore.get(b.core) || []) push(alvo, b.core, k);
    }
    for (const grp of alvo.values()) for (const k of grp.slice(1)) unir(grp[0], k, 'DECISAO_PLANILHA');
  }

  // nomes cortados
  const sugestoesDiretas = [];
  for (const [k, no] of nos) {
    const t = no.p.toks;
    if (t.length < 3 || no.p.core.length < 15) continue;
    const ext = (porPrimeiro.get(t[0]) || []).filter((o) => o !== k && prefixoDe(t, nos.get(o).p.toks));
    if (!ext.length) continue;
    const raizes = new Set(ext.map((o) => g.raiz(o)));
    if (raizes.size !== 1) continue;
    const y = nos.get(ext[0]).p.toks;
    const extra = y.slice(t.length);
    const cortadoNoMeio = t[t.length - 1] !== y[t.length - 1];
    const longo = Math.max(...[...no.grafias.keys()].map((v) => v.length)) >= 28;
    const empresa = t.some((x) => EMPRESA.has(x));
    if (extra.some((x) => GERACAO.has(x))) { sugestoesDiretas.push([k, ext[0], 65, 'NOME_CONTIDO_GERACAO']); continue; }
    if (cortadoNoMeio || longo || empresa) unir(ext[0], k, 'NOME_CORTADO');
    else sugestoesDiretas.push([k, ext[0], 75, 'NOME_CONTIDO']);
  }

  // vocabulario, frequencia e segmentacao de nomes colados
  const vocab = new Map(), freq = new Map();
  for (const no of nos.values()) {
    if (no.p.toks.length >= 2) for (const t of no.p.toks) if (t.length >= 2) vocab.set(t, (vocab.get(t) || 0) + 1);
    for (const t of new Set(tokensSig(no.p.toks))) freq.set(t, (freq.get(t) || 0) + 1);
  }
  for (const no of nos.values()) {
    const t = no.p.toks;
    if (t.length === 1 && t[0].length >= 9) {
      const seg = segmentar(t[0], vocab);
      if (seg && seg.length >= 2) { no.stoks = seg; no.segmentado = true; }
    }
  }

  // comparacao por bloco (4 primeiras letras)
  const blocos = new Map();
  for (const [k, no] of nos) {
    const c = tokensSig(no.stoks).join('').slice(0, 4);
    if (c) push(blocos, c, k);
  }
  const candidatos = [];
  for (const ks of blocos.values()) {
    ks.sort();
    for (let i = 0; i < ks.length; i++) {
      for (let j = i + 1; j < ks.length; j++) {
        const a = ks[i], b = ks[j];
        if (nos.get(a).tipo === 'P' && nos.get(b).tipo === 'P') continue;
        if (g.raiz(a) === g.raiz(b)) continue;
        const s = pontuarPar(nos.get(a).stoks, nos.get(b).stoks, freq);
        if (s) candidatos.push([a, b, s[0], s[1]]);
      }
    }
  }
  for (const c of sugestoesDiretas) candidatos.push(c);
  candidatos.sort((x, y) => y[2] - x[2] || (x[0] < y[0] ? -1 : 1));
  const auto = new Set(['MESMAS_PALAVRAS', 'GRAFIA_QUASE_IGUAL']);
  for (const [a, b, , motivo] of candidatos) if (auto.has(motivo)) unir(a, b, motivo);

  // grupos finais
  const gruposMap = new Map();
  for (const k of nos.keys()) push(gruposMap, g.raiz(k), k);
  const grupos = [];
  for (const [raiz, chaves] of gruposMap) {
    const temRemetente = chaves.some((k) => nos.get(k).tipo === 'S');
    const portal = chaves.find((k) => nos.get(k).tipo === 'P') || null;
    grupos.push({ raiz, chaves, portal, temRemetente, ...escolherNome(nos, chaves) });
  }

  // sugestoes restantes (entre grupos diferentes), sem repetir par de grupos
  const vistos = new Map();
  for (const [a, b, score, motivo] of candidatos) {
    if (auto.has(motivo)) continue;
    const ra = g.raiz(a), rb = g.raiz(b);
    if (ra === rb) continue;
    if (g.podeUnir(ra, rb, membros)) continue;
    const par = ra < rb ? `${ra}|${rb}` : `${rb}|${ra}`;
    if (!vistos.has(par) || vistos.get(par).score < score) vistos.set(par, { raizA: ra < rb ? ra : rb, raizB: ra < rb ? rb : ra, a, b, score, motivo });
  }
  const sugestoes = [...vistos.values()].sort((x, y) => y.score - x.score);
  return { nos, grupos, sugestoes, log, descartados, grafiaNo, raiz: (k) => g.raiz(k) };
}

/** Portal manda. Sem Portal: o nome mais completo (sem caracteres quebrados, com espacos), depois o mais usado. */
export function escolherNome(nos, chaves) {
  const portal = chaves.find((k) => nos.get(k).tipo === 'P');
  if (portal) {
    const [nome] = [...nos.get(portal).grafias.entries()].sort((x, y) => y[1] - x[1])[0];
    return { nome: nomeExibicao(nome), fonteNome: 'PORTAL' };
  }
  const cands = [];
  for (const k of chaves) {
    const no = nos.get(k);
    for (const [v, cnt] of no.grafias) {
      const d = nomeExibicao(v);
      const core = analisarNome(v).core;
      cands.push({ ok: !/[¿_?]/.test(d), espacado: d.includes(' '), palavras: core ? core.split(' ').length : 0, core, cnt, d, no });
    }
  }
  // "mais completo" = mais palavras; nome cortado perde para o inteiro; empate de palavras = o mais usado (erro de digitacao e raro)
  for (const c of cands) c.cortado = cands.some((o) => o !== c && o.core.length > c.core.length && o.core.startsWith(c.core));
  cands.sort((x, y) => (y.ok - x.ok) || (y.espacado - x.espacado) || (y.palavras - x.palavras) || (x.cortado - y.cortado) || (y.cnt - x.cnt) || (y.core.length - x.core.length) || (x.d < y.d ? -1 : 1));
  const top = cands[0];
  let nome = top.d;
  if (!top.espacado && top.no.segmentado) nome = top.no.stoks.join(' ');
  nome = nome.replace(/\s+C\s?\d{1,2}$/, '').replace(/\s+/g, ' ').trim();
  return { nome, fonteNome: 'MAIS_COMPLETO' };
}
