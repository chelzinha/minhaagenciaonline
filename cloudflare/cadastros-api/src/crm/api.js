/**
 * API do CRM no Worker: mesmo contrato do Web App Apps Script antigo.
 *   GET  /api/crm?action=<acao>&st=<token>&...
 *   POST /api/crm?action=<acao>&st=<token>   corpo = JSON (text/plain)
 *   GET  /api/crm?route=dashboard&st=<token>&...   (pagina Acoes da carteira)
 * Resposta sempre HTTP 200 com { ok:true, ... } ou { ok:false, error }.
 */
import { text, upper, hoje, addDays, weekStart, um, ErroCrm, falhar } from './util.js';
import { montarConfig, sincronizarResponsaveis, locaisPermitidos, localPermitido, midiasAtivas, lerTabelasConfig } from './config.js';
import * as ent from './entidades.js';
import * as jor from './jornada.js';
import * as ag from './agenda.js';
import { dashboardAcoes } from './acoes.js';

const agendaDoBoot = (env, p, user, a, b, status) => ag.getAgenda(env, { start: a, end: b, responsavelId: p.responsavelId, status }, user);

async function bloco(env, nome, p, user) {
  const h = hoje();
  const start = text(p.start) || weekStart(h), end = text(p.end) || addDays(start, 6);
  switch (nome) {
    case 'config': return montarConfig(env, user);
    case 'dashboard': return ag.getDashboard(env, { start, end, responsavelId: p.responsavelId }, user);
    case 'journeyClients': return jor.getJornada(env, { funilId: 'FUNIL_CLIENTES', tipoEntidade: 'CLIENTE', responsavelId: p.responsavelId }, user);
    case 'journeyProspects': return jor.getJornada(env, { funilId: 'FUNIL_PROSPECTS', tipoEntidade: 'PROSPECT', responsavelId: p.responsavelId }, user);
    case 'agenda': return agendaDoBoot(env, p, user, text(p.agendaStart) || start, text(p.agendaEnd) || end, '');
    case 'overdue': return agendaDoBoot(env, p, user, addDays(h, -180), addDays(h, -1), 'PLANEJADO');
  }
  return null;
}
async function boot(env, p, user, blocos, meta) {
  const out = { ok: true };
  if (meta) out.meta = { ...meta, timings: [], counts: {} };
  for (const b of blocos) {
    const t0 = Date.now();
    out[b] = await bloco(env, b, p, user);
    if (meta) { out.meta.timings.push({ step: b, ms: Date.now() - t0 }); if (out[b]?.items) out.meta.counts[b] = out[b].items.length; }
  }
  if (meta && out.config) { out.meta.counts.configFunis = out.config.funis.length; out.meta.counts.configEtapas = out.config.etapas.length; }
  return out;
}
function blocosV4(view, sub) {
  if (view === 'prospects') return sub === 'prospects-dashboard' ? ['config', 'journeyProspects', 'agenda', 'overdue'] : ['config', 'journeyProspects'];
  if (view === 'clientes') return ['config', 'journeyClients'];
  if (view === 'agenda') return ['config', 'agenda', 'overdue'];
  return ['config', 'dashboard', 'journeyClients', 'journeyProspects', 'agenda', 'overdue'];
}

async function dataRev(env) {
  const r = await env.DB.batch([env.DB.prepare(`SELECT chave, valor, atualizado_em FROM cid_estado WHERE chave IN ('crm_data_rev','crm_config_rev','crm_ultimo')`)]);
  const e = Object.fromEntries((r[0].results || []).map((x) => [x.chave, x]));
  // a revisao muda quando alguem grava no CRM ou quando o Visao 360 recalcula os clientes
  return { ok: true, dataRev: `${e.crm_data_rev?.valor || '0'}.${e.crm_ultimo?.atualizado_em || ''}`, configRev: e.crm_config_rev?.valor || '0', serverTime: Date.now() };
}

async function exigirNoEscopo(env, user, tipo, id) {
  const perm = locaisPermitidos(user);
  if (!perm || !id) return;
  const e = await ent.obterEntidade(env.DB, tipo, id);
  if (e && !localPermitido(perm, e.local)) falhar('Este cadastro pertence a um LOCAL que não está vinculado ao seu usuário.');
}

const GET = {
  ping: async () => ({ ok: true, now: new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 19) }),
  get_crm_boot_lite_v5: async (env, p, u) => { const r = await boot(env, p, u, ['config', 'dashboard']); r.meta = { version: '5.0.0-d1', timings: [] }; return r; },
  get_crm_boot_v4: (env, p, u) => { const view = ['home', 'prospects', 'clientes', 'agenda'].includes(text(p.view).toLowerCase()) ? text(p.view).toLowerCase() : 'home';
    const sub = text(p.sub) || (view === 'prospects' ? 'prospects-dashboard' : view === 'clientes' ? 'clientes-dashboard' : '');
    return boot(env, p, u, blocosV4(view, sub), { version: '4-d1', view, sub }); },
  get_crm_boot_v3: (env, p, u) => boot(env, p, u, ['config', 'dashboard', 'journeyClients', 'journeyProspects', 'agenda', 'overdue']),
  get_crm_config_v3: (env, p, u) => montarConfig(env, u),
  get_crm_config_v2: (env, p, u) => montarConfig(env, u),
  get_crm_dashboard_v3: (env, p, u) => ag.getDashboard(env, p, u),
  get_crm_jornada_data: (env, p, u) => jor.getJornada(env, p, u),
  get_crm_agenda_v3: (env, p, u) => ag.getAgenda(env, p, u),
  get_cadastro_v5: (env, p, u) => ent.getCadastro(env, p, u),
  get_crm_data: async (env, p, u) => ({ ok: true, clients: (await ent.getCadastro(env, { tipo: 'CLIENTE' }, u)).items, prospects: (await ent.getCadastro(env, { tipo: 'PROSPECT' }, u)).items }),
  get_cliente: async (env, p, u) => { const r = (await ent.getCadastro(env, { tipo: 'CLIENTE' }, u)).items; return { ok: true, cliente: r.find((x) => x.clienteId === text(p.clienteId)) || r.find((x) => upper(x.cliente) === upper(p.cliente)) || null }; },
  get_prospect: async (env, p, u) => ({ ok: true, prospect: (await ent.getCadastro(env, { tipo: 'PROSPECT' }, u)).items.find((x) => x.prospectId === text(p.prospectId)) || null }),
  get_prospects: async (env, p, u) => { const items = (await ent.getCadastro(env, { tipo: 'PROSPECT' }, u)).items; return { ok: true, prospects: { items, byId: Object.fromEntries(items.map((x) => [x.prospectId, x])) } }; },
  get_midias_catalog: async (env) => ({ ok: true, items: midiasAtivas(await lerTabelasConfig(env.DB)) }),
  get_data_rev_v5: (env) => dataRev(env),
  clear_crm_cache_v5: async (env) => { await env.DB.prepare(`UPDATE cid_estado SET valor = CAST(CAST(valor AS INTEGER) + 1 AS TEXT) WHERE chave IN ('crm_data_rev','crm_config_rev')`).run(); return { ...(await dataRev(env)), cleared: true }; },
  warm_crm_cache_v5: async () => ({ ok: true, warmed: true, meta: { timings: [] } }),
  get_entity_checklists_v7: (env, p) => ag.getChecklists(env, p),
  get_entity_notes_v8: (env, p) => ag.getNotas(env, p),
};
const POST = {
  update_cliente: async (env, p, u) => { await exigirNoEscopo(env, u, 'CLIENTE', text(p.clienteId)); return ent.updateCliente(env, p, u); },
  create_cliente: (env, p, u) => ent.createCliente(env, p, u, jor),
  create_prospect: (env, p, u) => ent.createProspect(env, p, u, jor),
  update_prospect: async (env, p, u) => { await exigirNoEscopo(env, u, 'PROSPECT', text(p.prospectId)); return ent.updateProspect(env, p, u); },
  sync_prospect_conversions: (env) => ent.syncProspectConversions(env),
  create_tratativa: (env, p, u) => jor.criarTratativa(env, p, u),
  move_tratativa: (env, p, u) => jor.moverTratativa(env, p, u),
  move_tratativas_lote: (env, p, u) => jor.moverTratativasLote(env, p, u),
  save_atividade: (env, p, u) => ag.salvarAtividade(env, p, u),
  complete_atividade: (env, p, u) => ag.concluirAtividade(env, p, u),
  cancel_atividade: (env, p, u) => ag.cancelarAtividade(env, p, u),
  delete_agenda_item: (env, p, u) => ag.excluirAtividade(env, p, u),
  save_checklist: (env, p, u) => ag.salvarChecklist(env, p, u),
  save_entity_note_v8: (env, p, u) => ag.salvarNota(env, p, u),
};
POST.delete_agenda = POST.remove_agenda_item = POST.excluir_agenda_item = POST.delete_agenda_item;

/** Atende /api/crm. user = sessao validada; token = para sincronizar responsaveis. */
export async function atenderCrm(request, env, user, token, url, corpo, ctx) {
  try {
    if (ctx?.waitUntil) ctx.waitUntil(sincronizarResponsaveis(env, user, token));
    else await sincronizarResponsaveis(env, user, token);
    const p = Object.fromEntries(url.searchParams.entries());
    if (text(p.route).toLowerCase() === 'dashboard') return await dashboardAcoes(env, p, user);
    const acao = text(p.action);
    if (request.method === 'POST') {
      const h = POST[acao];
      if (!h) return { ok: false, error: 'Ação POST inválida: ' + acao };
      return await h(env, corpo || {}, user);
    }
    const h = GET[acao];
    if (!h) return { ok: false, error: 'Ação GET inválida: ' + acao };
    return await h(env, p, user);
  } catch (e) {
    if (!(e instanceof ErroCrm)) console.error('[CRM]', e?.stack || e);
    return { ok: false, error: e instanceof ErroCrm ? e.message : 'Falha ao processar no servidor do CRM. Tente de novo em instantes.' };
  }
}
