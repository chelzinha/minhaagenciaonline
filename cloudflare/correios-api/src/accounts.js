// Contas Correios por cliente: cópia do contrato do AGF Core + credenciais CWS criptografadas.

import { encryptSecret } from './crypto.js';
import { requestToken, credentialsOf, clearToken, httpError } from './correios.js';
import { SERVICES, DEFAULT_SERVICE_CODES, serviceCodes } from './quote.js';

const ENVIRONMENTS = ['PRODUCAO', 'HOMOLOGACAO'];

function digits(value) {
  return String(value || '').replace(/\D/g, '');
}

function maskLogin(login) {
  const text = String(login || '');
  if (!text) return null;
  return text.length <= 3 ? text[0] + '***' : text.slice(0, 3) + '***';
}

export async function readAccount(env, customerId) {
  return env.DB.prepare('SELECT * FROM correios_accounts WHERE customer_id = ?').bind(customerId).first();
}

export function publicAccount(row) {
  if (!row) return null;
  let apis = [];
  try { apis = JSON.parse(row.token_apis_json || '[]'); } catch { apis = []; }
  return {
    customerId: row.customer_id,
    environment: row.environment,
    contractNumber: row.contract_number,
    postingCard: row.posting_card,
    documentNumber: row.document_number,
    coreStatus: row.core_status,
    drNumber: row.dr_number,
    originCep: row.origin_cep,
    services: serviceCodes(row),
    credentialsConfigured: Boolean(row.login_enc && row.access_code_enc),
    loginHint: row.login_hint,
    checkStatus: row.check_status,
    checkMessage: row.check_message,
    checkAt: row.check_at,
    apis,
    ready: row.check_status === 'OK' && Boolean(row.origin_cep),
    updatedAt: row.updated_at
  };
}

async function audit(env, customerId, actor, action, details) {
  await env.DB.prepare(
    'INSERT INTO correios_audit (customer_id, actor, action, details_json) VALUES (?, ?, ?, ?)'
  ).bind(customerId, actor || null, action, JSON.stringify(details || {})).run();
}

function contractFromCore(core) {
  const correios = core?.correios || null;
  if (!correios || !correios.contractNumber || !correios.postingCard) {
    throw httpError('Cadastre contrato e cartão de postagem em "Conta Correios" e salve o cliente antes das credenciais.', 409, 'CORE_INCOMPLETE');
  }
  return {
    contract_number: digits(correios.contractNumber),
    posting_card: digits(correios.postingCard),
    document_number: digits(correios.documentNumber) || null,
    core_status: correios.status || null
  };
}

// Atualiza só a cópia do contrato (chamado depois de salvar o cliente no AGF Core).
export async function syncFromCore(env, customerId, core, actor) {
  const existing = await readAccount(env, customerId);
  if (!existing) return null;
  const correios = core?.correios || null;
  const contract = correios && correios.contractNumber && correios.postingCard ? contractFromCore(core) : null;
  if (!contract) {
    await env.DB.prepare(
      `UPDATE correios_accounts SET core_status = 'DISABLED', check_status = 'PENDING',
              check_message = 'Conta Correios removida ou incompleta no cadastro.', updated_at = CURRENT_TIMESTAMP
        WHERE customer_id = ?`
    ).bind(customerId).run();
  } else {
    const cardChanged = contract.posting_card !== existing.posting_card;
    await env.DB.prepare(
      `UPDATE correios_accounts
          SET contract_number = ?, posting_card = ?, document_number = ?, core_status = ?,
              check_status = CASE WHEN ? THEN 'PENDING' ELSE check_status END,
              check_message = CASE WHEN ? THEN 'Cartão alterado no cadastro. Teste as credenciais novamente.' ELSE check_message END,
              updated_at = CURRENT_TIMESTAMP, updated_by = ?
        WHERE customer_id = ?`
    ).bind(contract.contract_number, contract.posting_card, contract.document_number, contract.core_status,
      cardChanged ? 1 : 0, cardChanged ? 1 : 0, actor || null, customerId).run();
    if (cardChanged) await clearToken(env, customerId);
  }
  await audit(env, customerId, actor, 'SYNC_FROM_CORE', { hasContract: Boolean(contract) });
  return readAccount(env, customerId);
}

export async function saveAccount(env, customerId, core, body, actor) {
  const contract = contractFromCore(core);
  const existing = await readAccount(env, customerId);

  const environment = String(body.environment || existing?.environment || 'PRODUCAO').toUpperCase();
  if (!ENVIRONMENTS.includes(environment)) throw httpError('Ambiente inválido.', 400, 'INPUT');

  const originCep = digits(body.originCep);
  if (originCep.length !== 8) throw httpError('CEP de origem inválido.', 400, 'INPUT');

  const drDigits = digits(body.drNumber);
  if (!drDigits || drDigits.length > 3) throw httpError('Informe o número da DR do contrato (até 3 dígitos).', 400, 'INPUT');
  const drNumber = String(Number(drDigits));

  const services = {};
  for (const service of SERVICES) {
    const code = digits(body.services?.[service]) || DEFAULT_SERVICE_CODES[service];
    if (!/^\d{5}$/.test(code)) throw httpError('Código de serviço ' + service + ' deve ter 5 dígitos.', 400, 'INPUT');
    services[service] = code;
  }

  const login = String(body.login || '').trim();
  const accessCode = String(body.accessCode || '').trim();
  if (!existing?.login_enc && (!login || !accessCode)) {
    throw httpError('Informe login idCorreios e código de acesso.', 400, 'INPUT');
  }
  if ((login && !accessCode && !existing?.access_code_enc) || (!login && accessCode && !existing?.login_enc)) {
    throw httpError('Informe login e código de acesso juntos.', 400, 'INPUT');
  }

  const loginEnc = login ? await encryptSecret(login, env) : existing?.login_enc;
  const codeEnc = accessCode ? await encryptSecret(accessCode, env) : existing?.access_code_enc;
  const loginHint = login ? maskLogin(login) : existing?.login_hint || null;

  await env.DB.prepare(
    `INSERT INTO correios_accounts (
       customer_id, environment, contract_number, posting_card, document_number, core_status,
       dr_number, origin_cep, services_json, login_enc, access_code_enc, login_hint,
       check_status, check_message, created_at, updated_at, updated_by)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, 'PENDING', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ?13)
     ON CONFLICT(customer_id) DO UPDATE SET
       environment = excluded.environment, contract_number = excluded.contract_number,
       posting_card = excluded.posting_card, document_number = excluded.document_number,
       core_status = excluded.core_status, dr_number = excluded.dr_number, origin_cep = excluded.origin_cep,
       services_json = excluded.services_json, login_enc = excluded.login_enc,
       access_code_enc = excluded.access_code_enc, login_hint = excluded.login_hint,
       check_status = 'PENDING', check_message = NULL,
       updated_at = CURRENT_TIMESTAMP, updated_by = excluded.updated_by`
  ).bind(customerId, environment, contract.contract_number, contract.posting_card, contract.document_number,
    contract.core_status, drNumber, originCep, JSON.stringify(services), loginEnc, codeEnc, loginHint, actor || null).run();

  await clearToken(env, customerId);
  await audit(env, customerId, actor, 'SAVE_ACCOUNT', {
    environment, credentialsChanged: Boolean(login || accessCode), originCep, drNumber
  });
  return checkAccount(env, customerId, actor);
}

// Gera um token novo para provar que login, código e cartão estão corretos.
export async function checkAccount(env, customerId, actor) {
  const account = await readAccount(env, customerId);
  if (!account) throw httpError('Conta Correios não configurada no gateway.', 404, 'NOT_CONFIGURED');

  let status = 'OK';
  let message = null;
  let apis = [];
  try {
    const { login, accessCode } = await credentialsOf(env, account);
    const result = await requestToken(account.environment, login, accessCode, account.posting_card);
    apis = result.apis;
    if (result.contract && digits(result.contract) !== account.contract_number) {
      status = 'ERROR';
      message = 'O cartão pertence ao contrato ' + result.contract + ', diferente do cadastrado (' + account.contract_number + ').';
    } else if (result.dr && account.dr_number && Number(result.dr) !== Number(account.dr_number)) {
      status = 'ERROR';
      message = 'A DR do cartão é ' + result.dr + ', diferente da informada (' + account.dr_number + ').';
    } else {
      message = 'Token gerado com sucesso.';
    }
  } catch (error) {
    status = 'ERROR';
    message = error.message || 'Falha ao validar credenciais.';
  }

  await env.DB.prepare(
    `UPDATE correios_accounts SET check_status = ?, check_message = ?, check_at = CURRENT_TIMESTAMP,
            token_apis_json = ?, updated_at = CURRENT_TIMESTAMP WHERE customer_id = ?`
  ).bind(status, message, JSON.stringify(apis), customerId).run();
  await audit(env, customerId, actor, 'CHECK_ACCOUNT', { status });
  return readAccount(env, customerId);
}
