/**
 * APP ETIQUETAS AGF — 99_ROUTER.gs
 * Roteador REST. Único ponto de entrada do Web App.
 *
 * Por que tudo passa por doPost? Porque doGet tem limitação de
 * tamanho de resposta menor e não aceita body. Padrão simples:
 *   POST /exec   body: { action: "...", ... }
 *
 * CORS: Apps Script Web App publicado como "Anyone" devolve
 * Access-Control-Allow-Origin: * automaticamente para POST com
 * Content-Type text/plain (sem preflight). O frontend deve usar
 * fetch com `mode: 'cors'`, `headers: { 'Content-Type': 'text/plain;charset=UTF-8' }`
 * e enviar JSON no body. Isso evita o preflight OPTIONS que o GAS
 * não responde. Padrão idêntico ao usado no CRM Metrô.
 */

// Mapa de actions disponíveis
const ROUTES = {
  'ping':                   action_ping_,
  'login':                  action_login_,
  'me':                     action_me_,
  'logout':                 action_logout_,
  'cep':                    action_cep_,
  'cotar':                  action_cotar_,
  'cotarTodos':             action_cotarTodos_,
  'criarEtiqueta':          action_criarEtiqueta_,
  'criarEtiquetaDireta':    action_criarEtiquetaDireta_,
  'cancelarEtiqueta':       action_cancelarEtiqueta_,
  'reimprimirEtiqueta':     action_reimprimirEtiqueta_,
  'listarHistorico':        action_listarHistorico_,
  'detalheEtiqueta':        action_detalheEtiqueta_,
  'rastrearObjeto':         action_rastrearObjeto_,
  'rastrearPublico':        action_rastrearPublico_,
  'buscarDestinatarios':    action_buscarDestinatarios_,
  'listarDestinatarios':    action_listarDestinatarios_,
  'salvarDestinatario':     action_salvarDestinatario_,
  'excluirDestinatario':    action_excluirDestinatario_,
  'importarDestinatariosCsv': action_importarDestinatariosCsv_,
  'testarTokenCws':         action_testarTokenCws_,
  'diagnostico':            action_diagnostico_,

  // ===== AGF SUPERFRETE (Etapa 1) =====
  // Módulo separado: portal cliente/admin com base SF_*.
  'sfHealth':                 action_sfHealth_,
  'sfAdminLogin':             action_sfAdminLogin_,
  'sfClientLogin':            action_sfClientLogin_,
  'sfAdminMe':                action_sfAdminMe_,
  'sfClientMe':               action_sfClientMe_,
  'sfClientDashboard':          action_sfClientDashboard_,
  'sfClientEmissionBootstrap':  action_sfClientEmissionBootstrap_,
  'sfClientQuoteSuperFrete':    action_sfClientQuoteSuperFrete_,
  'sfClientLookupCep':          action_sfClientLookupCep_,
  'sfClientCreateAndCheckoutLabel': action_sfClientCreateAndCheckoutLabel_,
  'sfClientListLabels':         action_sfClientListLabels_,
  'sfClientFinancial':          action_sfClientFinancial_,
  'sfClientRefreshSuperFreteOrder': action_sfClientRefreshSuperFreteOrder_,
  'sfClientGetAgfLabelOverlayData': action_sfClientGetAgfLabelOverlayData_,
  'sfAdminListClients':       action_sfAdminListClients_,
  'sfAdminGetClient':         action_sfAdminGetClient_,
  'sfAdminSaveClient':        action_sfAdminSaveClient_,
  'sfAdminGetFinancialSnapshot': action_sfAdminGetFinancialSnapshot_,
  'sfAdminGetClientFinancial': action_sfAdminGetClientFinancial_,
  'sfAdminAdjustClientBalance': action_sfAdminAdjustClientBalance_,
  'sfAdminEmissionBootstrap': action_sfAdminEmissionBootstrap_,
  'sfAdminCreateSimulatedLabel': action_sfAdminCreateSimulatedLabel_,
  'sfAdminListLabels':        action_sfAdminListLabels_,
  'sfAdminRegisterSuperFreteRecharge': action_sfAdminRegisterSuperFreteRecharge_,
  'sfAdminGetSuperFreteConfig': action_sfAdminGetSuperFreteConfig_,
  'sfAdminSaveSuperFreteConfig': action_sfAdminSaveSuperFreteConfig_,
  'sfAdminQuoteSuperFrete': action_sfAdminQuoteSuperFrete_,
  'sfAdminLookupCep': action_sfAdminLookupCep_,
  'sfAdminCreateRealCartOrder': action_sfAdminCreateRealCartOrder_,
  'sfAdminReleasePendingOrderLocal': action_sfAdminReleasePendingOrderLocal_,
  'sfAdminCheckoutRealOrder': action_sfAdminCheckoutRealOrder_,
  'sfAdminRefreshSuperFreteOrder': action_sfAdminRefreshSuperFreteOrder_,
  'sfAdminGetAgfLabelData': action_sfAdminGetAgfLabelData_,
  'sfAdminGetAgfLabelOverlayData': action_sfAdminGetAgfLabelOverlayData_,
  'sfAdminUploadClientLogo': action_sfAdminUploadClientLogo_,
  'sfValidateDcePayload':     action_sfValidateDcePayload_,
  'sfQuotePreview':           action_sfQuotePreview_,
  'sfModel':                  action_sfModel_,

  // ===== BALCÃO À VISTA =====
  // Módulo separado: usa tabela interna para preço e API Prazo isolada,
  // sem interferir nas actions cotar/cotarTodos do /app.
  'balcaoConfig':           action_balcaoConfig_,
  'balcaoCep':              action_balcaoCep_,
  'balcaoCotar':            action_balcaoCotar_,
  'balcaoSalvarRascunho':   action_balcaoSalvarRascunho_,
  'balcaoListarRascunhos':  action_balcaoListarRascunhos_
};

// Actions que não exigem sessão
const PUBLIC_ACTIONS = ['ping', 'login', 'rastrearPublico', 'sfHealth', 'sfAdminLogin', 'sfClientLogin', 'balcaoConfig', 'balcaoCep', 'balcaoCotar', 'balcaoSalvarRascunho'];

function doGet(e) {
  // Health check via GET para facilitar debug no navegador
  const action = (e && e.parameter && e.parameter.action) || 'ping';
  if (action === 'ping') {
    return jsonResponse_({
      ok: true,
      service: CFG.APP_TITLE,
      version: CFG.APP_VERSION,
      timestamp: nowIso_()
    });
  }
  return jsonResponse_({
    ok: false,
    error: 'Use POST para chamar actions. GET aceita apenas action=ping.'
  });
}

function doPost(e) {
  let body = {};
  let action = '';

  try {
    // O frontend envia JSON dentro do body. Como usamos text/plain
    // para evitar preflight CORS, o conteúdo está em e.postData.contents.
    if (e && e.postData && e.postData.contents) {
      body = safeJsonParse_(e.postData.contents) || {};
    }
    // Permitir também via query string (debug/teste manual)
    if (e && e.parameter) {
      Object.keys(e.parameter).forEach(k => {
        if (body[k] == null) body[k] = e.parameter[k];
      });
    }

    action = sanitize_(body.action);
    if (!action) throw new Error('Parâmetro "action" obrigatório.');

    const handler = ROUTES[action];
    if (!handler) throw new Error('Action desconhecida: ' + action);

    // Verifica sessão para actions privadas
    if (PUBLIC_ACTIONS.indexOf(action) < 0) {
      if (!sanitize_(body.sessionToken)) {
        throw new Error('Sessão não informada. Faça login.');
      }
    }

    const result = handler(body);
    return jsonResponse_({ ok: true, action: action, data: result });

  } catch (err) {
    const errMsg = err.message || String(err);
    logEvent_('ERRO', 'ROUTER', action || 'UNKNOWN', {
      erro: errMsg,
      cwsCode: err.cwsCode || '',
      stack: truncate_(err.stack || '', 1000)
    });
    return jsonResponse_({
      ok: false,
      action: action,
      error: errMsg,
      cwsCode: err.cwsCode || null,
      validationErrors: err.validationErrors || null
    });
  }
}

/**
 * Resposta JSON com cabeçalhos CORS implícitos.
 *
 * NOTA SOBRE CORS NO APPS SCRIPT:
 * O Apps Script Web App publicado como "Anyone, even anonymous"
 * SEMPRE devolve Access-Control-Allow-Origin: * automaticamente.
 * Não há como adicionar headers customizados via setHeaders pq o
 * ContentService não expõe essa API. A única forma de evitar
 * preflight é usar Content-Type "text/plain" no fetch do frontend.
 *
 * Isso é exatamente o que o frontend faz. Não é gambiarra, é o
 * padrão recomendado pela própria documentação do Apps Script
 * (developers.google.com/apps-script/guides/web).
 */
function jsonResponse_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// =====================================================================
// AÇÕES BÁSICAS
// =====================================================================

function action_ping_(params) {
  return {
    pong: true,
    service: CFG.APP_TITLE,
    version: CFG.APP_VERSION,
    timestamp: nowIso_(),
    timezone: Session.getScriptTimeZone()
  };
}

/**
 * AÇÃO: diagnostico
 *
 * Executa uma sequência de checagens e devolve um relatório completo.
 * Útil para investigar problemas sem precisar olhar log.
 *
 * Para usar:
 *   POST /exec
 *   { "action": "diagnostico", "sessionToken": "..." }
 */
function action_diagnostico_(params) {
  const fullClient = getFullClientFromSession_(params.sessionToken);
  const out = {
    timestamp: nowIso_(),
    cliente: {
      idCrm: fullClient.ID_CRM,
      loginApp: fullClient.LOGIN_APP,
      nomeRemetente: fullClient.NOME_REMETENTE,
      ambiente: fullClient.AMBIENTE_CWS,
      cartaoPostagem: fullClient.CARTAO_POSTAGEM,
      cartaoPostagemNormalizado: (function () {
        try { return normalizeCartaoPostagem_(fullClient.CARTAO_POSTAGEM); }
        catch (e) { return 'ERRO: ' + e.message; }
      })(),
      contrato: fullClient.NUM_CONTRATO,
      loginIdCorreios: fullClient.LOGIN_IDCORREIOS,
      temTokenApi: nonEmpty_(fullClient.TOKEN_API),
      codServPac: fullClient.COD_SERVICO_PAC,
      codServPacNormalizado: (function () {
        try { return fullClient.COD_SERVICO_PAC ? normalizeCodigoServico_(fullClient.COD_SERVICO_PAC) : ''; }
        catch (e) { return 'ERRO: ' + e.message; }
      })(),
      codServSedex: fullClient.COD_SERVICO_SEDEX,
      codServSedexNormalizado: (function () {
        try { return fullClient.COD_SERVICO_SEDEX ? normalizeCodigoServico_(fullClient.COD_SERVICO_SEDEX) : ''; }
        catch (e) { return 'ERRO: ' + e.message; }
      })()
    },
    cadastroCompleto: { ok: true, erros: [] }
  };

  // Verifica cadastro mínimo
  const camposObrigatorios = [
    'NOME_REMETENTE', 'CNPJ_CPF', 'ENDERECO', 'NUMERO',
    'BAIRRO', 'CEP', 'CARTAO_POSTAGEM', 'LOGIN_IDCORREIOS', 'TOKEN_API'
  ];
  camposObrigatorios.forEach(c => {
    if (!nonEmpty_(fullClient[c])) {
      out.cadastroCompleto.ok = false;
      out.cadastroCompleto.erros.push('Campo vazio: ' + c);
    }
  });

  // Tenta gerar token
  try {
    const tk = cwsGetToken_(fullClient, { forceNew: true });
    out.token = {
      ok: true,
      ambiente: tk.ambiente,
      expiraEm: tk.expiraEm,
      apisAutorizadas: tk.apisAutorizadas,
      temApi36: tk.apisAutorizadas.indexOf(36) >= 0,
      cartaoConfirmado: tk.cartaoPostagem
    };
  } catch (e) {
    out.token = { ok: false, erro: e.message };
  }

  return out;
}