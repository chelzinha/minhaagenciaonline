/**
 * "Acoes da carteira" (pagina /crm/acoes, route=dashboard) sobre as postagens do Visao 360.
 * Mesmo formato de resposta do DASHBOARD_GERENCIAL antigo (Raio-X e Carteira inteligente).
 * Diferencas: juncao por cliente_id (antes por nome); TIPO = subgrupo do servico; SEGMENTO sem fonte (lista vazia).
 */
import { text, upper, upperNoAccents, diffDays, todos } from './util.js';
import { locaisPermitidos, CRM_LOCAIS } from './config.js';
import { carregarClientes } from './entidades.js';

const SEM_CONTRATO = 'SEM CONTRATO', SEM_TIPO = 'SEM TIPO';
const csv = (v) => [...new Set(String(v || '').split(',').map((s) => s.trim()).filter(Boolean))].sort();
const normAc = (v) => { const a = upper(v); return a === 'VISITAR' ? 'FIDELIZAR' : (a || 'MANTER'); };
const normPr = (v) => upperNoAccents(v).replace(/\s+/g, '') || 'BAIXA';
const PR = { CRITICA: 4, ALTA: 3, MEDIA: 2, BAIXA: 1 };
const ym = (d) => text(d).slice(0, 7);
const fimDoMes = (m) => { const [y, mm] = m.split('-').map(Number); return new Date(Date.UTC(y, mm, 0)).toISOString().slice(0, 10); };
const semAc = (s) => upperNoAccents(s).replace(/[^\w]+/g, ' ').replace(/\s+/g, ' ').trim();

const BASE_FROM = `FROM cid_postagens p JOIN cid_grafias g ON g.origem = p.origem AND g.grafia = p.grafia JOIN cid_nos n ON n.chave = g.no_chave
  WHERE n.cliente_id IS NOT NULL AND p.data_postagem <> ''`;

function filtrosSql(f) {
  const w = [], b = [];
  const lista = (col, vals, mapa) => { if (!vals) return; if (!vals.length) { w.push('0'); return; } w.push(`${mapa(col)} IN (${vals.map(() => '?').join(',')})`); b.push(...vals); };
  lista('p.local_codigo', f.units, (c) => c);
  lista('p.subgrupo', f.types, (c) => `COALESCE(NULLIF(${c}, ''), '${SEM_TIPO}')`);
  lista('p.intermediador', f.inters, (c) => `COALESCE(NULLIF(${c}, ''), '${SEM_CONTRATO}')`);
  return { sql: w.length ? ' AND ' + w.join(' AND ') : '', binds: b };
}

export async function dashboardAcoes(env, p, user) {
  const db = env.DB;
  const perm = locaisPermitidos(user);
  const lim = await db.prepare(`SELECT MIN(substr(data_postagem,1,10)) mi, MAX(substr(data_postagem,1,10)) ma FROM cid_postagens WHERE data_postagem <> '' AND estorno = 0`).first();
  const lat = text(lim?.ma), minStart = text(lim?.mi);
  // ---- periodo (mesmas regras de normF_)
  const periodMode = text(p.periodMode) || 'month';
  const monthYm = text(p.monthYm) || ym(lat);
  const inicioMes = monthYm + '-01', fimMes = [fimDoMes(monthYm), lat].sort()[0];
  const clamp = (d, a, b) => (d < a ? a : d > b ? b : d);
  const sd = clamp(text(p.startDate) || inicioMes, minStart, lat);
  const ed = clamp(text(p.endDate) || fimMes, sd, lat);
  // ---- filtros de dimensao ('' = todos; __NONE__ = nada)
  const pedido = (k1, k2) => { const v = text(p[k1] ?? p[k2]); return v ? csv(v) : null; };
  let units = pedido('unit', 'units');
  if (perm) units = (units || CRM_LOCAIS).filter((u) => perm.has(u));      // responsavel: so os LOCAIS dele
  const f = { units, types: pedido('type', 'types'), inters: pedido('inter', 'inters') };
  const segs = pedido('seg', 'segs');
  const q = semAc(p.q);
  const fs = filtrosSql(f);
  const [opc, base, win] = await db.batch([
    db.prepare(`SELECT DISTINCT p.local_codigo local, COALESCE(NULLIF(p.subgrupo,''), '${SEM_TIPO}') tipo, COALESCE(NULLIF(p.intermediador,''), '${SEM_CONTRATO}') inter ${BASE_FROM}`),
    db.prepare(`SELECT n.cliente_id id, substr(p.data_postagem,1,7) ym, SUM(p.estorno = 0) q, ROUND(SUM(p.valor),2) v, MIN(substr(p.data_postagem,1,10)) primeira,
      MAX(CASE WHEN p.estorno = 0 THEN substr(p.data_postagem,1,10) END) ultima, MAX(p.intermediador <> '' OR p.contrato <> '') etq
      ${BASE_FROM}${fs.sql} GROUP BY 1, 2`).bind(...fs.binds),
    db.prepare(`SELECT n.cliente_id id, SUM(p.estorno = 0) q, ROUND(SUM(p.valor),2) v ${BASE_FROM}${fs.sql} AND substr(p.data_postagem,1,10) BETWEEN ? AND ? GROUP BY 1`).bind(...fs.binds, sd, ed),
  ]);
  const o = opc.results || [];
  const fl = { minStart, latest: lat, defYm: ym(lat), months: [], units: [...new Set(o.map((x) => x.local).filter(Boolean))].filter((u) => !perm || perm.has(u)).sort(),
    types: [...new Set(o.map((x) => x.tipo))].sort(), inters: [...new Set(o.map((x) => x.inter))].sort(), segs: [] };
  for (let m = ym(minStart); m && m <= ym(lat); m = ym(new Date(Date.UTC(+m.slice(0, 4), +m.slice(5, 7), 1)).toISOString())) fl.months.push(m);

  const master = await carregarClientes(db, { user });
  const nomeDe = new Map(master.map((m) => [m.CLIENTE_ID, text(m.CLIENTE) || text(m.NOME_REMETENTE_BASE)]));
  const passaQ = (id) => !q || semAc(nomeDe.get(id) || '').includes(q);
  const vazioSeg = segs && segs.length === 0;                                  // __NONE__ ou "Limpar" no SEGMENTO
  const winPor = new Map((win.results || []).filter((x) => passaQ(x.id)).map((x) => [x.id, { fW: Number(x.v) || 0, qW: Number(x.q) || 0 }]));

  // ---- Carteira inteligente
  const profundo = !!(f.types || f.inters || segs);
  let carteira = master.filter((m) => (!f.units || f.units.includes(text(m.LOCAL_PREDOMINANTE))) && passaQ(m.CLIENTE_ID) && (!profundo || winPor.has(m.CLIENTE_ID)));
  if (vazioSeg) carteira = [];
  const ct = carteira.map((m) => {
    const w = winPor.get(m.CLIENTE_ID) || { fW: 0, qW: 0 };
    return { nome: nomeDe.get(m.CLIENTE_ID), ck: m.CLIENTE_ID, local: text(m.LOCAL_PREDOMINANTE), ac: normAc(m.ACAO), pr: normPr(m.PRIORIDADE_FILA), sc: Number(m.SCORE_PRIORIDADE) || 0,
      share: Number(m.SHARE_LOCAL_30D) || 0, curva: text(m.CURVA), etq: text(m.TEM_CONTRATO) === 'SIM', isNovo: text(m.NOVO_CLIENTE) === 'SIM', st: text(m.STATUS_ATIVIDADE),
      dsm: Number(m.DIAS_SEM_POSTAR) || 0, last: text(m.DATA_ULTIMA_POSTAGEM), f30: Number(m.FAT_30D) || 0, fdPct: Number(m.FD_PCT) || 0, qdPct: Number(m.QD_PCT) || 0,
      ddPct: Number(m.DD_PCT) || 0, intermediador: text(m.INTERMEDIADOR_PREDOMINANTE), subAc: text(m.SUB_ACAO), perfil: text(m.PERFIL_COMERCIAL), canal: text(m.CANAL_SUGERIDO),
      conteudo: text(m.CONTEUDO_SUGERIDO), motivo: text(m.MOTIVO_REGRA), tkG: Number(m.TICKET_30D) || 0, tQ: Number(m.QTD_TOTAL) || 0, tV: Number(m.VALOR_TOTAL) || 0,
      porte: text(m.PORTE_OPERACIONAL), alerta: text(m.NIVEL_ALERTA), recNivel: text(m.RECORRENCIA_NIVEL), primYm: ym(m.DATA_PRIMEIRA_VALIDA_NAO_REVERSO),
      fW: w.fW, qW: w.qW, tkP: w.qW ? w.fW / w.qW : 0 };
  }).sort((a, b) => ((PR[b.pr] || 0) - (PR[a.pr] || 0)) || (b.sc - a.sc) || (b.share - a.share) || (b.fW - a.fW) || (b.f30 - a.f30) || (a.dsm - b.dsm));
  const nPor = (ac) => ct.filter((x) => x.ac === ac).length;
  const nConv = nPor('CONVERTER'), nResg = nPor('RESGATAR'), nCanc = nPor('CANCELAR'), nFid = nPor('FIDELIZAR');
  const nFidCrit = ct.filter((x) => x.ac === 'FIDELIZAR' && x.pr === 'CRITICA').length;
  const foco = [];
  if (nResg > 20) foco.push(`🔴 ${nResg} clientes para resgatar. Crie um mutirão de ligações: 10 por dia. Em 2 semanas a lista está limpa.`);
  if (nConv > 10) foco.push(`🟡 ${nConv} clientes prontos para converter em contrato. Foque nos que têm maior ticket médio.`);
  if (nFidCrit > 0) foco.push(`🟠 ${nFidCrit} clientes estratégicos em fidelização crítica. Priorize visita ou contato consultivo esta semana.`);
  if (nCanc > 50) foco.push(`⚪ ${nCanc} clientes VR para cancelar. Não gaste energia com eles - foque nos que dão retorno.`);
  if (!foco.length) foco.push('✅ Carteira equilibrada. Mantenha o acompanhamento semanal e foque em prospectar novos clientes.');

  // ---- Raio-X (historico inteiro, so filtros de dimensao e busca)
  const porMaster = new Map(master.map((m) => [m.CLIENTE_ID, m]));
  const cli = new Map();
  if (!vazioSeg) for (const r of base.results || []) {
    if (!passaQ(r.id)) continue;
    const c = cli.get(r.id) || { ms: {}, tQ: 0, tV: 0, first: '', last: '', etq: false };
    c.ms[r.ym] = { q: Number(r.q) || 0, v: Number(r.v) || 0 };
    c.tQ += Number(r.q) || 0; c.tV += Number(r.v) || 0;
    if (!c.first || r.primeira < c.first) c.first = r.primeira;
    if (r.ultima && r.ultima > c.last) c.last = r.ultima;
    if (Number(r.etq)) c.etq = true;
    cli.set(r.id, c);
  }
  const curYm = ym(lat);
  const rows = [];
  for (const [id, c] of cli) {
    let pQ = 0, mA = 0, mS = 0;
    const md = fl.months.map((m) => {
      const d = c.ms[m];
      if (d) {
        mA++;
        let st = 'ATIVO';
        if (m === curYm) st = 'ATUAL';
        else if (pQ > 0) { const dl = (d.q - pQ) / pQ * 100; st = dl >= 15 ? 'ALTA' : dl <= -15 ? 'QUEDA' : 'ESTAVEL'; }
        pQ = d.q;
        return { ym: m, q: d.q, v: d.v, st };
      }
      if (ym(c.first) <= m && m <= curYm) { mS++; return { ym: m, q: 0, v: 0, st: 'INATIVO' }; }
      return { ym: m, q: 0, v: 0, st: 'SEM_DADOS' };
    });
    const mm = porMaster.get(id);
    const etq = c.etq ? 'COM' : 'SEM';
    rows.push({ nome: nomeDe.get(id) || id, isNovo: mm ? text(mm.NOVO_CLIENTE) === 'SIM' : false, dsm: c.last ? diffDays(lat, c.last) : 9999, md, tQ: c.tQ, tV: Math.round(c.tV * 100) / 100,
      tk: c.tQ ? c.tV / c.tQ : 0, etq, ac: mm ? normAc(mm.ACAO) : (etq === 'COM' ? 'MANTER' : 'CONVERTER'), pr: mm ? normPr(mm.PRIORIDADE_FILA) : 'BAIXA',
      local: mm ? text(mm.LOCAL_PREDOMINANTE) : '', curva: mm ? text(mm.CURVA) : '', mA, mS, last: c.last });
  }
  rows.sort((a, b) => b.tQ - a.tQ);
  const st = { conv: rows.filter((r) => r.ac === 'CONVERTER').length, visit: 0, resg: rows.filter((r) => r.ac === 'RESGATAR').length, canc: rows.filter((r) => r.ac === 'CANCELAR').length,
    fid: rows.filter((r) => r.ac === 'FIDELIZAR').length, manter: rows.filter((r) => r.ac === 'MANTER').length };
  const sumAc = [['Converter', nConv], ['Fidelizar', nFid], ['Manter', ct.length - nConv - nFid - nResg - nCanc], ['Resgatar', nResg], ['Cancelar', nCanc]].map(([label, value]) => ({ label, value }));
  return {
    ok: true, fl,
    ctx: { periodMode, monthYm, ms: inicioMes, me: fimMes, sd, ed, day: ed, unit: (f.units || []).join(','), units: f.units || [], type: (f.types || []).join(','),
      inter: (f.inters || []).join(','), seg: (segs || []).join(','), q: text(p.q) },
    ov: { cards: {}, mc: {} }, dy: { cards: {}, nav: {} }, op: null,         // abas escondidas no CRM: so o minimo para a pagina nao quebrar
    cli: { tot: ct.length, ct: ct.slice(0, 5000), sum: { tot: ct.length, ac: sumAc, nConv, nVisit: 0, nResg, nCanc, nFid, nNovos: ct.filter((x) => x.isNovo).length } },
    acoes: { total: ct.length, rows: [], sum: sumAc, foco: foco.slice(0, 4), counts: { nConv, nResg, nVisit: 0, nCanc, nFid } },
    mx: { ms: fl.months, rows: rows.slice(0, 5000), totCli: rows.length, st },
  };
}
