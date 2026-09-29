/**
 * Revisor automatico das sugestoes do Cadastro v2.
 * Decide sozinho so os casos seguros e grava UNIR em cid_decisoes com autor REVISOR_AUTO (reversivel: ativo=0).
 * Nunca grava SEPARAR (SEPARAR e permanente e fica para decisao humana). Caso duvidoso continua como sugestao.
 *
 * Regras (todas exigem o mesmo primeiro nome):
 *  - GRAFIA: mesmo numero de palavras, uma unica palavra diferente, com 1 letra de diferenca e 4+ letras.
 *  - CONTIDO: o nome curto aparece dentro do longo, na mesma ordem (inicial solta casa com palavra da mesma letra).
 *      3+ palavras no curto: une.
 *      2 palavras no curto: une so se o curto tiver um unico candidato e o motor marcou palavra rara (motivo NOME_CONTIDO).
 *  - Nome curto com candidatos incompativeis entre si (ex.: CARLOS ALBERTO -> 5 pessoas) fica para decisao humana.
 *  - Nome curto cujas palavras tambem aparecem em outro cliente da base (fora das sugestoes) fica para decisao humana.
 *  - FILHO/JUNIOR/NETO e nomes em ordem diferente ficam para decisao humana.
 */
import { analisarNome } from './motor.js';

export const REVISOR_VERSAO = '2026-09-29.1';
export const REVISOR_AUTOR = 'REVISOR_AUTO';
const CONECTIVOS = new Set(['DE', 'DA', 'DO', 'DAS', 'DOS', 'E']);

export function palavras(nome) {
  return analisarNome(nome).toks.filter((t) => !CONECTIVOS.has(t));
}

function distancia1(a, b) {
  if (a === b) return false;
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0, j = 0, dif = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++dif > 1) return false;
    if (a.length > b.length) i++; else if (b.length > a.length) j++; else { i++; j++; }
  }
  return dif + (a.length - i) + (b.length - j) === 1;
}

/** Curto dentro do longo, na mesma ordem. Inicial solta (1 letra) casa com palavra de mesma inicial. */
export function contidoEmOrdem(curto, longo) {
  if (curto.length > longo.length || !curto.length || curto[0] !== longo[0] || curto.join(' ') === longo.join(' ')) return false;
  let j = 0;
  for (const t of curto) {
    while (j < longo.length && !(longo[j] === t || (t.length === 1 && longo[j][0] === t))) j++;
    if (j >= longo.length) return false;
    j++;
  }
  return true;
}

const compativeis = (a, b) => a.join(' ') === b.join(' ') || contidoEmOrdem(a, b) || contidoEmOrdem(b, a);

/**
 * pares: [{cliente_a, cliente_b, motivo}]; info: Map(id -> {nome, eh_portal, postagens}); todos: [{id, nome}] da base inteira
 * (opcional; quando vem, nome curto que tambem cabe em outro cliente fora das sugestoes fica para decisao humana).
 * Retorna [{destino, outro, regra}] (destino = Portal > nome com mais palavras > mais postagens).
 */
export function revisar(pares, info, todos = null) {
  const todosPorId = new Map((todos || []).map((c) => [c.id, c.nome]));
  const pal = new Map();
  const p = (id) => { if (!pal.has(id)) pal.set(id, palavras(info.get(id)?.nome || todosPorId.get(id) || '')); return pal.get(id); };
  // indice da base inteira: quem mais tem todas as palavras do nome curto (candidato escondido = nome ambiguo)
  const porPalavra = new Map();
  for (const id of todosPorId.keys()) for (const t of new Set(p(id))) { if (!porPalavra.has(t)) porPalavra.set(t, new Set()); porPalavra.get(t).add(id); }
  const escondidos = (c) => {
    if (!todos) return 0;
    const ts = [...new Set(p(c))].map((t) => porPalavra.get(t) || new Set()).sort((a, b) => a.size - b.size);
    if (!ts.length) return 0;
    let n = 0;
    for (const id of ts[0]) if (id !== c && ts.every((set) => set.has(id)) && !(maiores.get(c)?.has(id))) n++;
    return n;
  };
  const tam = (id) => p(id).length * 1000 + p(id).join(' ').length;
  const menorPrimeiro = (a, b) => (tam(a) <= tam(b) ? [a, b] : [b, a]);
  // candidatos "maiores" de cada nome curto (para detectar nome curto ambiguo)
  const maiores = new Map();
  for (const x of pares) {
    if (!info.has(x.cliente_a) || !info.has(x.cliente_b)) continue;
    const [c, l] = menorPrimeiro(x.cliente_a, x.cliente_b);
    if (!maiores.has(c)) maiores.set(c, new Set());
    maiores.get(c).add(l);
  }
  const ambiguo = (c) => {
    const ls = [...(maiores.get(c) || [])];
    for (let i = 0; i < ls.length; i++) for (let k = i + 1; k < ls.length; k++) if (!compativeis(p(ls[i]), p(ls[k]))) return true;
    return false;
  };
  const out = [];
  const vistos = new Set();
  for (const x of pares) {
    const A = info.get(x.cliente_a), B = info.get(x.cliente_b);
    if (!A || !B || (A.eh_portal && B.eh_portal)) continue;
    const pa = p(x.cliente_a), pb = p(x.cliente_b);
    if (!pa.length || !pb.length || pa[0] !== pb[0]) continue;
    let regra = null;
    const motivo = String(x.motivo || '');
    if (motivo === 'NOME_CONTIDO_GERACAO') continue;
    if (motivo === 'GRAFIA_PARECIDA') {
      if (pa.length === pb.length && pa.length >= 2) {
        const dif = pa.map((t, i) => [t, pb[i]]).filter(([u, v]) => u !== v);
        if (dif.length === 1 && Math.min(dif[0][0].length, dif[0][1].length) >= 4 && distancia1(dif[0][0], dif[0][1])) regra = 'REVISOR_GRAFIA';
      }
    } else if (motivo.startsWith('NOME_CONTIDO')) {
      const [c, l] = menorPrimeiro(x.cliente_a, x.cliente_b);
      const pc = p(c), pl = p(l);
      if (!ambiguo(c) && !escondidos(c) && contidoEmOrdem(pc, pl)) {
        if (pc.length >= 3) regra = 'REVISOR_CONTIDO';
        else if (pc.length === 2 && motivo === 'NOME_CONTIDO' && (maiores.get(c)?.size || 0) === 1) regra = 'REVISOR_CONTIDO';
      }
    }
    if (!regra) continue;
    const ordem = [x.cliente_a, x.cliente_b].sort((u, v) => {
      const U = info.get(u), V = info.get(v);
      return (V.eh_portal ? 1 : 0) - (U.eh_portal ? 1 : 0) || tam(v) - tam(u) || (V.postagens || 0) - (U.postagens || 0) || (u < v ? -1 : 1);
    });
    const k = ordem.join('|');
    if (vistos.has(k)) continue;
    vistos.add(k);
    out.push({ destino: ordem[0], outro: ordem[1], regra });
  }
  return out;
}
