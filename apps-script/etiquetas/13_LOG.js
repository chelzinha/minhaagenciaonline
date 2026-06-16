/**
 * APP ETIQUETAS AGF — 13_LOG.gs
 * Log estruturado em LOG_APP.
 *
 * Cada chamada de logEvent_ acrescenta uma linha. Em alta volumetria,
 * isso poderia ser custoso, então usamos appendRow direto (uma única
 * escrita). LockService só onde estritamente necessário.
 *
 * Headers esperados em LOG_APP:
 *   DATA_HORA | NIVEL | MODULO | ACAO | LOGIN_APP | ID_CRM | REFERENCIA | DETALHES
 */

const LOG_HEADERS = ['DATA_HORA', 'NIVEL', 'MODULO', 'ACAO', 'LOGIN_APP', 'ID_CRM', 'REFERENCIA', 'DETALHES'];

function ensureLogHeaders_() {
  try {
    const sh = getOrCreateSheet_(CFG.SHEETS.LOG);
    const lastCol = sh.getLastColumn();
    if (lastCol === 0) {
      sh.getRange(1, 1, 1, LOG_HEADERS.length).setValues([LOG_HEADERS]);
      sh.getRange(1, 1, 1, LOG_HEADERS.length).setFontWeight('bold');
      sh.setFrozenRows(1);
    }
  } catch (e) {
    // Não pode falhar — log é best-effort
    console.error('Falha ao garantir headers do log: ' + e.message);
  }
}

/**
 * logEvent_(nivel, modulo, acao, payload)
 *
 * payload é um objeto livre que vira JSON em DETALHES.
 * Campos especiais extraídos: loginApp, idCrm, referencia.
 */
function logEvent_(nivel, modulo, acao, payload) {
  try {
    ensureLogHeaders_();
    const p = payload || {};
    const loginApp = sanitize_(p.loginApp || p.login || '');
    const idCrm = sanitize_(p.idCrm || p.idCRM || '');
    const referencia = sanitize_(p.referencia || p.ref || p.idRegistro || p.idPrePostagem || '');

    // Limpa campos especiais antes de stringificar (evita duplicação)
    const detalhes = {};
    Object.keys(p).forEach(k => {
      if (['loginApp', 'login', 'idCrm', 'idCRM', 'referencia', 'ref', 'idRegistro', 'idPrePostagem'].indexOf(k) >= 0) return;
      detalhes[k] = p[k];
    });

    const detalhesText = truncate_(safeJsonStringify_(redactSensitive_(detalhes)), SYS.LOG_TRUNCATE_LEN);

    getOrCreateSheet_(CFG.SHEETS.LOG).appendRow([
      nowIso_(),
      sanitize_(nivel),
      sanitize_(modulo),
      sanitize_(acao),
      loginApp,
      idCrm,
      referencia,
      detalhesText
    ]);
  } catch (e) {
    // Log nunca pode quebrar a aplicação — só registramos no console.
    console.error('Falha ao gravar log: ' + e.message + ' | original: ' + acao);
  }
}