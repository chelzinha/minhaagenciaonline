/* =====================================================
   CAMINHO 2 - PRAZO (API Prazo dos Correios)
   - Usa a credencial do CONTRATO apenas para consultar PRAZO.
   - PROIBIDO consultar a API de preco: o preco do balcao e sempre
     o da tabela a vista (caminho 1, pasta ../preco).
   - Desta resposta so sao lidos dias, data maxima e entrega aos sabados.
     Nenhum valor em R$ e lido.
   - Consulta pelos codigos a vista (04014 SEDEX, 04510 PAC), testados em 03/10/2026.
   - Cache no D1 (balcao_prazo_cache) por 7 dias por servico + CEP origem + CEP destino.
   - NAO importa nada de ../preco.
   ===================================================== */
import { getCorreios, credenciaisConfiguradas, CORREIOS_BASE } from '../correios/cliente-correios.js';

const CACHE_DIAS = 7;
const hojeSP = () => new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10);

export function prazoConfigurado(env) { return credenciaisConfiguradas(env); }

async function lerCache(db, servico, cepO, cepD) {
  try {
    return await db.prepare(`SELECT prazo_dias, entrega_sabado, resposta_json, consultado_em FROM balcao_prazo_cache
      WHERE servico=?1 AND cep_origem=?2 AND cep_destino=?3 AND consultado_em >= datetime('now', ?4)`)
      .bind(servico, cepO, cepD, '-' + CACHE_DIAS + ' days').first();
  } catch (e) { console.warn('[BALCAO][prazo] cache indisponivel:', e.message); return null; }
}

async function gravarCache(db, servico, cepO, cepD, r) {
  try {
    await db.prepare(`INSERT INTO balcao_prazo_cache (servico, cep_origem, cep_destino, prazo_dias, entrega_sabado, resposta_json, consultado_em)
      VALUES (?1, ?2, ?3, ?4, ?5, ?6, datetime('now'))
      ON CONFLICT(servico, cep_origem, cep_destino) DO UPDATE SET prazo_dias=excluded.prazo_dias, entrega_sabado=excluded.entrega_sabado,
        resposta_json=excluded.resposta_json, consultado_em=excluded.consultado_em`)
      .bind(servico, cepO, cepD, r.prazoDias, r.entregaSabado, JSON.stringify({ dataMaxima: r.dataMaxima, dia: hojeSP() })).run();
  } catch (e) { console.warn('[BALCAO][prazo] falha ao gravar cache:', e.message); }
}

/**
 * Prazo de um servico. Nunca lanca erro: devolve { ok:false, erro } para a cotacao seguir so com o preco.
 * @returns {Promise<{ok:boolean, prazoDias?:number, dataMaxima?:string, entregaSabado?:string, fonte:string, erro?:string}>}
 */
export async function consultarPrazo(env, servico, cepOrigem, cepDestino) {
  const fonte = 'API Prazo dos Correios';
  if (!prazoConfigurado(env)) return { ok: false, fonte, erro: 'Prazo não configurado.' };
  const hit = await lerCache(env.DB, servico, cepOrigem, cepDestino);
  if (hit && hit.prazo_dias != null) {
    let extra = {};
    try { extra = JSON.parse(hit.resposta_json || '{}'); } catch (_) { /* sem extra */ }
    // A data maxima depende do dia da postagem: so reaproveita se a consulta foi hoje.
    return { ok: true, prazoDias: Number(hit.prazo_dias), dataMaxima: extra.dia === hojeSP() ? extra.dataMaxima || '' : '',
      entregaSabado: hit.entrega_sabado || '', fonte, cache: true };
  }
  try {
    const url = `${CORREIOS_BASE}/prazo/v1/nacional/${servico}?cepOrigem=${cepOrigem}&cepDestino=${cepDestino}`;
    const j = await getCorreios(env, url);
    const item = Array.isArray(j) ? j[0] : j;
    const dias = Number(item && item.prazoEntrega);
    if (!item || !Number.isFinite(dias) || dias <= 0) {
      const msg = item && (item.txErro || item.msgErro);
      return { ok: false, fonte, erro: msg ? String(msg) : 'Correios não informaram o prazo para este trecho.' };
    }
    const r = { prazoDias: dias, dataMaxima: String(item.dataMaxima || ''), entregaSabado: String(item.entregaSabado || '') };
    await gravarCache(env.DB, servico, cepOrigem, cepDestino, r);
    return { ok: true, ...r, fonte, cache: false };
  } catch (e) {
    console.warn('[BALCAO][prazo]', servico, cepDestino, e.message);
    return { ok: false, fonte, erro: e.message };
  }
}
