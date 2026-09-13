/**
 * 20_CRM_ACOES_DIAG.gs
 * ------------------------------------------------------------
 * Diagnosticos manuais de performance para o painel Clientes > Acoes.
 *
 * IMPORTANTE
 * - nada neste arquivo roda automaticamente;
 * - nao altera dados das planilhas;
 * - as funcoes abaixo podem ler/preencher caches normais do dashboard;
 * - crm5x_testarAcoesDashboard() chama a mesma getDash_ usada pela rota
 *   route=dashboard e, por isso, pode acionar a manutencao normal do master
 *   que a propria rota ja executaria.
 */

function crm5x_acoesDiagParams_(params) {
  params = params || {};
  return {
    periodMode: crm3_text_(params.periodMode || 'month'),
    monthYm: crm3_text_(params.monthYm || ''),
    startDate: crm3_text_(params.startDate || ''),
    endDate: crm3_text_(params.endDate || ''),
    day: crm3_text_(params.day || ''),
    unit: crm3_text_(params.unit || params.units || ''),
    type: crm3_text_(params.type || ''),
    inter: crm3_text_(params.inter || ''),
    seg: crm3_text_(params.seg || ''),
    q: crm3_text_(params.q || '')
  };
}

function crm5x_acoesDiagCacheKey_(params) {
  var p = crm5x_acoesDiagParams_(params);
  var unitKey = csvS_(p.unit || '');
  var rawKey = 'd10v11::' + ct_(p.periodMode || '') + '|' +
    ct_(p.monthYm || '') + '|' + ct_(p.startDate || '') + '|' +
    ct_(p.endDate || '') + '|' + unitKey + '|' + ct_(p.type || '') + '|' +
    ct_(p.inter || '') + '|' + ct_(p.seg || '') + '|' + ct_(p.q || '') + '|' +
    ct_(p.day || '');
  return 'd10v11_' + hashKey_(rawKey);
}

/**
 * Mede componentes de leitura sem chamar getDash_.
 * Util para separar custo da assinatura BASE_TOTAL do custo de getBundle_.
 */
function crm5x_diagAcoesComponentes(params) {
  var p = crm5x_acoesDiagParams_(params);
  var key = crm5x_acoesDiagCacheKey_(p);
  var out = {
    ok: true,
    params: p,
    dashboardCacheKey: key,
    timings: {}
  };

  var t0 = new Date().getTime();
  var cached = null;
  try { cached = gcj_(key); } catch (e0) {}
  out.timings.dashboardCacheReadMs = new Date().getTime() - t0;
  out.dashboardCacheHit = !!cached;

  t0 = new Date().getTime();
  var sig = op_getBaseSheetSignature_();
  out.timings.baseSignatureMs = new Date().getTime() - t0;
  out.baseSignatureLength = String(sig || '').length;

  t0 = new Date().getTime();
  var meta = op_getMasterMeta_();
  out.timings.masterMetaMs = new Date().getTime() - t0;
  out.master = {
    hasUsableMaster: op_hasUsableMaster_(),
    builtAt: meta && meta.builtAt || '',
    baseSigMatches: !!(meta && meta.baseSig && meta.baseSig === sig)
  };

  t0 = new Date().getTime();
  var bundle = getBundle_();
  out.timings.bundleMs = new Date().getTime() - t0;
  out.bundle = {
    rows: bundle && bundle.rows ? bundle.rows.length : 0,
    latest: bundle && bundle.latest || ''
  };

  out.totalMs = Object.keys(out.timings).reduce(function (sum, k) {
    return sum + Number(out.timings[k] || 0);
  }, 0);
  try { Logger.log('[CRM ACOES DIAG componentes] ' + JSON.stringify(out)); } catch (e1) {}
  return out;
}

/**
 * Cronometra a mesma getDash_ usada pelo iframe de Clientes > Acoes.
 * Rode duas vezes seguidas para comparar cache frio/morno. O retorno informa
 * se a chave final ja estava no CacheService antes da chamada.
 */
function crm5x_testarAcoesDashboard(params) {
  var p = crm5x_acoesDiagParams_(params);
  var key = crm5x_acoesDiagCacheKey_(p);
  var cacheBefore = null;
  try { cacheBefore = gcj_(key); } catch (e0) {}

  var started = new Date().getTime();
  var payload = getDash_(p);
  var totalMs = new Date().getTime() - started;
  var bytes = 0;
  try { bytes = JSON.stringify(payload || {}).length; } catch (e1) {}

  var cacheAfter = null;
  try { cacheAfter = gcj_(key); } catch (e2) {}

  var out = {
    ok: true,
    params: p,
    dashboardCacheKey: key,
    cacheHitBefore: !!cacheBefore,
    cacheHitAfter: !!cacheAfter,
    totalMs: totalMs,
    payloadBytes: bytes,
    payloadOk: !!(payload && payload.ok !== false)
  };
  try { Logger.log('[CRM ACOES DIAG getDash] ' + JSON.stringify(out)); } catch (e3) {}
  return out;
}
