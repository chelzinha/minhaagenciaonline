/**
 * 08_AVATARS — Foto de perfil do usuário.
 *
 * Decisão de arquitetura: os avatares ficam em uma aba SEPARADA (AVATARS),
 * e não em coluna nova na aba de usuários. Motivo: os gravadores existentes
 * escrevem a linha inteira de users pelo tamanho de AGF_USERS_HEADERS; uma
 * coluna nova exigiria alterar todos eles e criaria risco de regressão no
 * fluxo crítico de login/senha. A aba própria isola totalmente esse risco.
 *
 * Formato armazenado: data URL de imagem (ex.: data:image/jpeg;base64,...),
 * já redimensionada no navegador (128x128). Limite de 45.000 caracteres para
 * respeitar com folga o teto de 50.000 por célula do Google Sheets.
 *
 * Segurança: ambas as ações exigem token de sessão válido (agfValidate_) e
 * cada usuário só lê/grava o próprio avatar. Nenhum dado sensível é logado.
 */

var AGF_AVATARS_SHEET = 'AVATARS';
var AGF_AVATARS_HEADERS = ['username', 'avatar_data', 'updated_at'];
var AGF_AVATAR_MAX_CHARS = 45000;

function agfEnsureAvatarsSheet_() {
  return agfEnsureSheet_(agfGetDb_(), AGF_AVATARS_SHEET, AGF_AVATARS_HEADERS);
}

function agfFindAvatarRow_(username) {
  agfEnsureAvatarsSheet_();
  var rows = agfReadRows_(AGF_AVATARS_SHEET, AGF_AVATARS_HEADERS);
  for (var i = 0; i < rows.length; i += 1) {
    if (agfNormalizeUsername_(rows[i].username) === username) return rows[i];
  }
  return null;
}

/** Retorna o avatar do próprio usuário autenticado. */
function agfGetMyAvatar_(token) {
  var validation = agfValidate_(token);
  var username = agfNormalizeUsername_(validation.user.username);
  var row = agfFindAvatarRow_(username);
  return { ok: true, avatar: row ? String(row.avatar_data || '') : '' };
}

/** Grava (ou remove, se vazio) o avatar do próprio usuário autenticado. */
function agfUploadMyAvatar_(token, request) {
  var validation = agfValidate_(token);
  var username = agfNormalizeUsername_(validation.user.username);
  var data = String((request && request.avatarData) || '');

  if (data) {
    if (data.indexOf('data:image/') !== 0) throw new Error('Formato de imagem inválido.');
    if (data.length > AGF_AVATAR_MAX_CHARS) throw new Error('Imagem muito grande. Tente uma foto menor.');
  }

  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var sh = agfEnsureAvatarsSheet_();
    var row = agfFindAvatarRow_(username);
    var now = agfNowIso_();
    if (row) {
      sh.getRange(row._row, 1, 1, AGF_AVATARS_HEADERS.length).setValues([[username, data, now]]);
    } else {
      sh.appendRow([username, data, now]);
    }
    agfLog_(data ? 'AVATAR_UPDATED' : 'AVATAR_REMOVED', username, 'len=' + data.length);
    return { ok: true };
  } finally {
    lock.releaseLock();
  }
}
