// ============================================================
// ATENDE - ADMINISTRACAO DAS BIBLIOTECAS D1
// O token da plataforma e validado no backend de autenticacao.
// Somente role=admin pode executar operacoes de escrita.
// ============================================================

const ATENDE_AUTH_API_URL = 'https://script.google.com/macros/s/AKfycbxv_3OLKyy13PqtEdqnVSA2zg3xljaU5gAKgn-TIVaaSRaTNPGgWIaRvDV_JuT9PTc5/exec';

function ATENDE_validarAdmin_(platformToken) {
  const token = String(platformToken || '').trim();
  if (!token) throw new Error('Sessao administrativa ausente. Abra o Atende pela plataforma.');

  const tokenHash = ATENDE_sha256_(token).substring(0, 32);
  const cache = CacheService.getScriptCache();
  const cacheKey = 'atende:admin:' + tokenHash;
  const cached = cache.get(cacheKey);
  if (cached) {
    const parsed = JSON.parse(cached);
    if (parsed && parsed.role === 'admin') return parsed;
  }

  const response = UrlFetchApp.fetch(ATENDE_AUTH_API_URL, {
    method: 'post',
    contentType: 'text/plain;charset=utf-8',
    payload: JSON.stringify({ action: 'validate', token: token }),
    muteHttpExceptions: true,
    followRedirects: true
  });
  const code = response.getResponseCode();
  let body = {};
  try { body = JSON.parse(response.getContentText() || '{}'); } catch (_) {}
  if (code < 200 || code >= 300 || !body || body.ok === false || !body.user) {
    throw new Error('Nao foi possivel validar a sessao administrativa.');
  }

  const role = String(body.user.role || '').toLowerCase();
  if (role !== 'admin') throw new Error('Apenas administradores podem alterar as bibliotecas do Atende.');

  const admin = {
    role: role,
    username: String(body.user.username || body.user.email || body.user.name || 'admin')
  };
  cache.put(cacheKey, JSON.stringify(admin), 300);
  return admin;
}

function ATENDE_adminGet_(platformToken, path) {
  const admin = ATENDE_validarAdmin_(platformToken);
  return ATENDE_fetchD1_(path, {
    method: 'get',
    headers: { 'X-AGF-Admin-User': admin.username }
  });
}

function ATENDE_adminPost_(platformToken, path, payload) {
  const admin = ATENDE_validarAdmin_(platformToken);
  return ATENDE_fetchD1_(path, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload || {}),
    headers: { 'X-AGF-Admin-User': admin.username }
  });
}

// CODIGO_SERVICO e uma chave cadastral derivada. Para codigos puramente
// numericos, zeros a esquerda nao diferenciam o servico (04227 = 4227).
// O valor original da postagem permanece intacto em atende_postagens_raw.codigo_servico.
function ATENDE_normalizarCodigoServico_(value) {
  const codigo = String(value == null ? '' : value).trim().toUpperCase();
  if (!codigo) return '';
  if (/^\d+$/.test(codigo)) return codigo.replace(/^0+(?=\d)/, '');
  return codigo;
}

function ATENDE_normalizarPayloadServicos_(payload) {
  const source = payload && Array.isArray(payload.items) ? payload.items : [];
  const seen = {};
  const items = source.map(function(item) {
    const copy = Object.assign({}, item || {});
    const original = String(copy.codigo == null ? '' : copy.codigo).trim();
    copy.codigo = ATENDE_normalizarCodigoServico_(original);
    if (!copy.codigo) throw new Error('Existe um servico sem CODIGO.');
    if (seen[copy.codigo]) {
      throw new Error('Codigo de servico duplicado apos normalizacao: ' + original + ' = ' + copy.codigo + '.');
    }
    seen[copy.codigo] = true;
    return copy;
  });
  return Object.assign({}, payload || {}, { items: items });
}

function ATENDE_adminBootstrap(platformToken) {
  return ATENDE_adminGet_(platformToken, '/admin/bootstrap');
}

function ATENDE_adminSalvarServico(platformToken, payload) {
  const copy = Object.assign({}, payload || {});
  copy.codigo = ATENDE_normalizarCodigoServico_(copy.codigo);
  return ATENDE_adminPost_(platformToken, '/admin/service', copy);
}

function ATENDE_adminSalvarServicosLote(platformToken, payload) {
  return ATENDE_adminPost_(platformToken, '/admin/services-bulk', ATENDE_normalizarPayloadServicos_(payload));
}

function ATENDE_adminSalvarAtendente(platformToken, payload) {
  return ATENDE_adminPost_(platformToken, '/admin/attendant', payload);
}

function ATENDE_adminSalvarContrato(platformToken, payload) {
  return ATENDE_adminPost_(platformToken, '/admin/contract', payload);
}

function ATENDE_adminImportarContratosLote(platformToken, payload) {
  return ATENDE_adminPost_(platformToken, '/admin/contracts-bulk', payload);
}

function ATENDE_adminSalvarAliasCliente(platformToken, payload) {
  return ATENDE_adminPost_(platformToken, '/admin/client-alias', payload);
}

function ATENDE_adminImportarRemetentesLote(platformToken, payload) {
  return ATENDE_adminPost_(platformToken, '/admin/client-aliases-bulk', payload);
}

function ATENDE_adminAlterarLocalLote(platformToken, payload) {
  return ATENDE_adminPost_(platformToken, '/admin/bulk-local', payload);
}

function ATENDE_testarAdmin(platformToken) {
  const admin = ATENDE_validarAdmin_(platformToken);
  return { ok: true, role: admin.role, username: admin.username };
}
