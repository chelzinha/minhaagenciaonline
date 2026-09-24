/** Utilitarios do CRM no Worker (mesma semantica das funcoes do Apps Script antigo). */
export const TZ_OFFSET_MS = -3 * 3600 * 1000;                 // America/Fortaleza, sem horario de verao

export class ErroCrm extends Error {}
export const falhar = (msg) => { throw new ErroCrm(msg); };

export const text = (v) => (v == null ? '' : String(v).trim());
export const semAcento = (s) => text(s).normalize('NFD').replace(/[̀-ͯ]/g, '');
/** crm3_upper_: sem acento, maiusculo, espacos viram _ */
export const upper = (v) => semAcento(v).toUpperCase().replace(/\s+/g, '_');
/** op_upperNoAccents_: sem acento, maiusculo (mantem espacos) */
export const upperNoAccents = (v) => semAcento(v).toUpperCase();
export const isYes = (v) => v === true || ['SIM', 'TRUE', '1', 'YES', 'ATIVO'].includes(upper(v));
export const temColeta = (s) => upperNoAccents(s).includes('COLETA');
export const normResp = (v) => semAcento(v).toLowerCase();

export function nowIso() { return new Date(Date.now() + TZ_OFFSET_MS).toISOString().slice(0, 19); }
export function hoje() { return nowIso().slice(0, 10); }
export function addDays(ymd, n) { return new Date(Date.parse(ymd + 'T00:00:00Z') + n * 864e5).toISOString().slice(0, 10); }
export function diffDays(a, b) { return Math.round((Date.parse(a + 'T00:00:00Z') - Date.parse(b + 'T00:00:00Z')) / 864e5); }
export function weekStart(ymd) { const d = new Date(ymd + 'T00:00:00Z'); const w = d.getUTCDay(); return addDays(ymd, w === 0 ? -6 : 1 - w); }
export const DIAS_SEMANA = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SAB'];
export function diaSemana(ymd) { return DIAS_SEMANA[new Date(ymd + 'T00:00:00Z').getUTCDay()]; }

/** yyyy-MM-dd a partir de texto (aceita dd/MM/yyyy e ISO). */
export function ymd(v) {
  const s = text(v);
  if (!s) return '';
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  const d = new Date(s);
  return isNaN(d) ? '' : new Date(d.getTime() + TZ_OFFSET_MS).toISOString().slice(0, 10);
}
export function hhmm(v) {
  const s = text(v);
  const m = s.match(/^(\d{1,2}):(\d{2})/);
  return m ? `${m[1].padStart(2, '0')}:${m[2]}` : s;
}
export function somaMinutos(h, min) {
  const m = text(h).match(/^(\d{1,2}):(\d{2})/);
  if (!m) return '';
  const t = ((Number(m[1]) * 60 + Number(m[2]) + Number(min || 0)) % 1440 + 1440) % 1440;
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
}
/** Prefixo + parte de UUID em maiusculas (TRT_ 8 hex, EVT_ 10 caracteres como no sistema antigo). */
export const novoId = (prefixo, n = 8) => prefixo + crypto.randomUUID().slice(0, n).toUpperCase();

export const primeiro = (...vs) => { for (const v of vs) { const t = text(v); if (t) return t; } return ''; };
export const uniqSort = (arr) => [...new Set(arr.map(text).filter(Boolean))].sort();
export const ptSort = (a, b) => String(a || '').localeCompare(String(b || ''), 'pt-BR');
export const ordemNum = (x, campo = 'ORDEM') => Number(x?.[campo]) || 999;

/** Normaliza tipo de entidade: PROSPECT(S) -> PROSPECT, resto -> CLIENTE. */
export function tipoEntidade(v) { const u = upper(v || 'CLIENTE'); return u === 'PROSPECT' || u === 'PROSPECTS' ? 'PROSPECT' : 'CLIENTE'; }
export const funilDoTipo = (t) => (t === 'PROSPECT' ? 'FUNIL_PROSPECTS' : 'FUNIL_CLIENTES');
export const etapaPadraoDoFunil = (f) => (f === 'FUNIL_PROSPECTS' ? 'P_NOVO' : 'C_SINALIZADO');
export function statusDaEtapa(tipoEtapa) {
  const t = upper(tipoEtapa);
  return t === 'GANHA' ? 'CONCLUIDA' : t === 'PERDIDA' ? 'ENCERRADA' : t === 'PAUSADA' ? 'PAUSADA' : 'ABERTA';
}
export const tratativaAberta = (t) => ['ABERTA', 'PAUSADA'].includes(upper(t?.STATUS_TRATATIVA));

/** Executa statements em lotes (D1 batch = transacao). */
export async function lote(db, stmts) {
  const out = [];
  for (let i = 0; i < stmts.length; i += 90) out.push(...(await db.batch(stmts.slice(i, i + 90))));
  return out;
}
/** INSERT a partir de objeto (colunas = chaves). */
export function insert(db, tabela, obj, { ou = '' } = {}) {
  const cols = Object.keys(obj);
  return db.prepare(`INSERT ${ou} INTO ${tabela}(${cols.join(',')}) VALUES(${cols.map(() => '?').join(',')})`).bind(...cols.map((c) => obj[c] ?? ''));
}
/** UPDATE parcial (so as chaves informadas). */
export function update(db, tabela, chave, id, patch) {
  const cols = Object.keys(patch);
  if (!cols.length) return null;
  return db.prepare(`UPDATE ${tabela} SET ${cols.map((c) => `${c}=?`).join(',')} WHERE ${chave}=?`).bind(...cols.map((c) => patch[c] ?? ''), id);
}
export async function todos(db, sql, ...binds) { return (await db.prepare(sql).bind(...binds).all()).results || []; }
export async function um(db, sql, ...binds) { return db.prepare(sql).bind(...binds).first(); }

/** Revisao de dados (o front compara para saber se precisa recarregar). */
export const bumpRev = (db) => db.prepare(`UPDATE cid_estado SET valor = CAST(CAST(valor AS INTEGER) + 1 AS TEXT), atualizado_em = CURRENT_TIMESTAMP WHERE chave = 'crm_data_rev'`);

/** Evento (CRM_EVENTOS). */
export function evento(db, x) {
  return insert(db, 'crm_eventos', {
    EVENTO_ID: novoId('EVT_', 10), DATA_HORA: nowIso(), ENTIDADE_TIPO: text(x.entidadeTipo), ENTIDADE_ID: text(x.entidadeId),
    TRATATIVA_ID: text(x.tratativaId), TIPO_EVENTO: text(x.tipoEvento), VALOR_ANTERIOR: text(x.valorAnterior), VALOR_NOVO: text(x.valorNovo),
    RESPONSAVEL_ID: text(x.responsavelId), ORIGEM: text(x.origem) || 'CRM_PORTAL', METADADOS_JSON: JSON.stringify(x.metadata || {}),
  });
}
