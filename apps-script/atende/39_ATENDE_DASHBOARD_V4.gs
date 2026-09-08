// ============================================================
// ATENDE - DASHBOARD V4
// Controle de acesso para a aba Gestao.
// Operacao e Comercial continuam disponiveis para usuarios autenticados.
// Remuneracao so e devolvida ao navegador para admin/manager.
// ============================================================

function ATENDE_buscarDashboardV4D1(params, platformToken) {
  const base = ATENDE_buscarDashboardGestaoV3D1(params || {});
  const sessao = ATENDE_identificarSessaoDashboard_(platformToken);
  const role = String(sessao.role || '').toLowerCase();
  const gestaoPermitida = role === 'admin' || role === 'manager' || role === 'gestor' || role === 'socio' || role === 'sócio';

  base.gestaoPermitida = gestaoPermitida;
  base.usuarioDashboard = {
    role: role,
    username: String(sessao.username || '')
  };

  // A receita por linha R2 continua sendo indicador operacional/comercial.
  // A remuneracao contratual e sensivel e nao deve chegar ao browser de usuarios comuns.
  if (!gestaoPermitida) {
    base.remuneracao = {};
  }

  return base;
}

function ATENDE_identificarSessaoDashboard_(platformToken) {
  const token = String(platformToken || '').trim();
  if (!token) return { role: '', username: '' };

  try {
    const tokenHash = ATENDE_sha256_(token).substring(0, 32);
    const cache = CacheService.getScriptCache();
    const cacheKey = 'atende:dashboard:user:' + tokenHash;
    const cached = cache.get(cacheKey);
    if (cached) {
      const parsed = JSON.parse(cached);
      if (parsed && parsed.role) return parsed;
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
      return { role: '', username: '' };
    }

    const user = {
      role: String(body.user.role || '').toLowerCase(),
      username: String(body.user.username || body.user.email || body.user.name || '')
    };
    cache.put(cacheKey, JSON.stringify(user), 300);
    return user;
  } catch (_) {
    // Falha de validacao nunca libera informacao sensivel.
    return { role: '', username: '' };
  }
}
