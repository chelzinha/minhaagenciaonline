/**
 * APP ETIQUETAS AGF — 03_AUTH_APP.gs
 * Login do app (NÃO é o token Correios — esse fica em 04_CWS_TOKEN.gs).
 *
 * Modelo: cada cliente da AGF tem LOGIN_APP e SENHA_APP na planilha
 * CLIENTES_APP. Após login, o backend gera um sessionToken (UUID) que
 * o frontend envia em todas as chamadas subsequentes via body.
 *
 * IMPORTANTE: o sessionToken vem do CLIENTE (frontend), não de
 * Session.getTemporaryActiveUserKey(). Isso permite múltiplos usuários
 * simultâneos sem colisão (corrigindo bug P1-1 do diagnóstico).
 */

function findClientByLogin_(login) {
  const rows = readSheetAsObjects_(CFG.SHEETS.CLIENTES);
  const needle = lower_(login);
  if (!needle) return null;
  return rows.find(r => lower_(r.LOGIN_APP) === needle) || null;
}

function findClientByIdCrm_(idCrm) {
  const rows = readSheetAsObjects_(CFG.SHEETS.CLIENTES);
  const needle = sanitize_(idCrm);
  if (!needle) return null;
  return rows.find(r => sanitize_(r.ID_CRM) === needle) || null;
}

/**
 * Monta o payload de sessão (subset seguro do cliente para o frontend).
 * Nunca inclui SENHA_APP, TOKEN_API ou outros segredos.
 */
function buildSessionPayload_(client) {
  return {
    ID_CRM: sanitize_(client.ID_CRM),
    LOGIN_APP: sanitize_(client.LOGIN_APP),
    NOME_REMETENTE: sanitize_(client.NOME_REMETENTE),
    NOME_FANTASIA: sanitize_(client.NOME_FANTASIA),
    CNPJ_CPF: sanitize_(client.CNPJ_CPF),
    CONTATO: sanitize_(client.CONTATO),
    EMAIL: sanitize_(client.EMAIL),
    WHATSAPP: sanitize_(client.WHATSAPP),
    ENDERECO: sanitize_(client.ENDERECO),
    NUMERO: sanitize_(client.NUMERO),
    BAIRRO: sanitize_(client.BAIRRO),
    CEP: sanitize_(client.CEP),
    CIDADE_REMETENTE: sanitize_(client.CIDADE_REMETENTE) || 'FORTALEZA',
    UF_REMETENTE: upper_(client.UF_REMETENTE) || 'CE',
    NUM_CONTRATO: sanitize_(client.NUM_CONTRATO),
    CARTAO_POSTAGEM: sanitize_(client.CARTAO_POSTAGEM),
    SEGMENTO: sanitize_(client.SEGMENTO),
    AMBIENTE_CWS: upper_(client.AMBIENTE_CWS) || 'PRODUCAO',
    STATUS_TESTE_CWS: sanitize_(client.STATUS_TESTE_CWS),
    COD_SERVICO_PAC: sanitize_(client.COD_SERVICO_PAC),
    COD_SERVICO_SEDEX: sanitize_(client.COD_SERVICO_SEDEX),
    TIPO_ROTULO_PADRAO: sanitize_(client.TIPO_ROTULO_PADRAO) || CFG.CWS.DEFAULT_TIPO_ROTULO,
    FORMATO_ROTULO_PADRAO: sanitize_(client.FORMATO_ROTULO_PADRAO) || CFG.CWS.DEFAULT_FORMATO_ROTULO,
    TIPO_DOCUMENTO_PADRAO: sanitize_(client.TIPO_DOCUMENTO_PADRAO) || CFG.CWS.DEFAULT_TIPO_DOCUMENTO
  };
}

/**
 * Cria sessão. Salva no CacheService a payload completa indexada por
 * sessionToken (UUID). Retorna o token para o frontend.
 */
function createSession_(client) {
  const sessionToken = Utilities.getUuid();
  const payload = buildSessionPayload_(client);
  const cache = CacheService.getScriptCache();
  cache.put(
    CFG.SESSION_PREFIX + sessionToken,
    JSON.stringify(payload),
    CFG.SESSION_TTL_SEC
  );
  return { sessionToken: sessionToken, client: payload };
}

/**
 * Recupera o cliente pela sessionToken. Throws se inválido/expirado.
 */
function getSessionClient_(sessionToken) {
  const tk = sanitize_(sessionToken);
  if (!tk) throw new Error('Sessão não informada. Faça login novamente.');
  const cache = CacheService.getScriptCache();
  const raw = cache.get(CFG.SESSION_PREFIX + tk);
  if (!raw) throw new Error('Sessão expirada. Faça login novamente.');
  try {
    return JSON.parse(raw);
  } catch (e) {
    throw new Error('Sessão corrompida. Faça login novamente.');
  }
}

/**
 * Wrapper conveniente que recarrega o cliente DA PLANILHA (não do cache).
 * Use quando precisar de campos sensíveis (TOKEN_API, SENHA_APP) que
 * NÃO estão no payload de sessão por segurança.
 */
function getFullClientFromSession_(sessionToken) {
  const sessionClient = getSessionClient_(sessionToken);
  const fullClient = findClientByLogin_(sessionClient.LOGIN_APP);
  if (!fullClient) {
    throw new Error('Cliente da sessão não encontrado na planilha.');
  }
  return fullClient;
}

function destroySession_(sessionToken) {
  const tk = sanitize_(sessionToken);
  if (!tk) return;
  CacheService.getScriptCache().remove(CFG.SESSION_PREFIX + tk);
}

/**
 * AÇÃO: login
 */
function action_login_(params) {
  const login = sanitize_(params.login);
  const senha = sanitize_(params.senha);

  if (!login || !senha) {
    throw new Error('Informe login e senha.');
  }

  const client = findClientByLogin_(login);
  if (!client) {
    logEvent_('WARN', 'AUTH', 'LOGIN_FAIL', { login: login, motivo: 'login_inexistente' });
    throw new Error('Login ou senha inválidos.');
  }

  if (sanitize_(client.SENHA_APP) !== senha) {
    logEvent_('WARN', 'AUTH', 'LOGIN_FAIL', {
      login: login,
      idCrm: client.ID_CRM,
      motivo: 'senha_incorreta'
    });
    throw new Error('Login ou senha inválidos.');
  }

  const session = createSession_(client);

  logEvent_('INFO', 'AUTH', 'LOGIN_OK', {
    login: login,
    idCrm: client.ID_CRM,
    nome: client.NOME_REMETENTE
  });

  return {
    sessionToken: session.sessionToken,
    client: session.client
  };
}

/**
 * AÇÃO: me — devolve o cliente da sessão atual
 */
function action_me_(params) {
  const client = getSessionClient_(params.sessionToken);
  return { client: client };
}

/**
 * AÇÃO: logout
 */
function action_logout_(params) {
  destroySession_(params.sessionToken);
  return { ok: true };
}