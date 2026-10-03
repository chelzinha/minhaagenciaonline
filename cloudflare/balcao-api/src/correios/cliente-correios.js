/* =====================================================
   CLIENTE DA API DOS CORREIOS (credencial do CONTRATO)
   - Usado SOMENTE pelos caminhos de PRAZO (../prazo) e de busca de CEP (../cep).
   - O caminho de PRECO (../preco) nao pode importar este arquivo.
   - Lista fechada de enderecos: token, prazo e CEP. Qualquer outro endereco
     (inclusive a API de preco) e recusado antes de sair do Worker.
   - Segredos: CORREIOS_USUARIO, CORREIOS_CODIGO_ACESSO, CORREIOS_CARTAO.
   ===================================================== */

const BASE = 'https://api.correios.com.br';
const URL_TOKEN = BASE + '/token/v1/autentica/cartaopostagem';
const PERMITIDOS = [
  /^https:\/\/api\.correios\.com\.br\/token\/v1\/autentica\/cartaopostagem$/,
  /^https:\/\/api\.correios\.com\.br\/prazo\/v1\/nacional\/\d{5}\?[^#]*$/,
  /^https:\/\/api\.correios\.com\.br\/cep\/v2\/enderecos\/\d{8}$/,
];
const TIMEOUT_MS = 8000;
let tokenMem = null;         // { token, ate }

export function credenciaisConfiguradas(env) {
  return !!(env.CORREIOS_USUARIO && env.CORREIOS_CODIGO_ACESSO && env.CORREIOS_CARTAO);
}

function conferirEndereco(url) {
  if (!PERMITIDOS.some((re) => re.test(url))) {
    throw new Error('[BALCAO][correios] Endereço bloqueado (fora da lista de token, prazo e CEP): ' + url.split('?')[0]);
  }
}

async function chamar(url, opcoes) {
  conferirEndereco(url);
  let resp;
  try {
    resp = await fetch(url, { ...opcoes, signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch (e) {
    throw new Error(e && e.name === 'TimeoutError' ? 'Correios não responderam a tempo.' : 'Sem conexão com a API dos Correios.');
  }
  const texto = await resp.text();
  let json = null;
  try { json = JSON.parse(texto); } catch (_) { /* resposta sem JSON */ }
  if (!resp.ok) {
    const msg = json && (Array.isArray(json.msgs) ? json.msgs.join(' ') : json.message || json.msg);
    throw Object.assign(new Error('Correios ' + resp.status + (msg ? ': ' + msg : '')), { status: resp.status });
  }
  return json;
}

async function obterToken(env) {
  const agora = Date.now();
  if (tokenMem && tokenMem.ate > agora) return tokenMem.token;
  const cache = typeof caches !== 'undefined' ? caches.default : null;
  const chave = new Request('https://token.agf-balcao.local/cartao');
  if (cache) {
    const hit = await cache.match(chave);
    if (hit) {
      const t = await hit.json();
      if (t.ate > agora) { tokenMem = t; return t.token; }
    }
  }
  const basic = btoa(env.CORREIOS_USUARIO + ':' + env.CORREIOS_CODIGO_ACESSO);
  const j = await chamar(URL_TOKEN, {
    method: 'POST',
    headers: { Authorization: 'Basic ' + basic, Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ numero: String(env.CORREIOS_CARTAO).replace(/\D/g, '') }),
  });
  if (!j || !j.token) throw new Error('Correios não devolveram o token.');
  const expira = Date.parse(j.expiraEm || '') || agora + 60 * 60 * 1000;
  const ate = Math.min(expira - 10 * 60 * 1000, agora + 12 * 60 * 60 * 1000);
  tokenMem = { token: j.token, ate };
  if (cache) {
    const seg = Math.max(60, Math.floor((ate - agora) / 1000));
    await cache.put(chave, new Response(JSON.stringify(tokenMem), { headers: { 'content-type': 'application/json', 'cache-control': 'max-age=' + seg } }));
  }
  return j.token;
}

/** GET autenticado em um endereco da lista permitida. Repete uma vez com token novo se o token for recusado. */
export async function getCorreios(env, url) {
  if (!credenciaisConfiguradas(env)) throw new Error('Credencial dos Correios não configurada no Worker.');
  const tentar = async () => chamar(url, { method: 'GET', headers: { Authorization: 'Bearer ' + (await obterToken(env)), Accept: 'application/json' } });
  try {
    return await tentar();
  } catch (e) {
    if (e.status === 401 || e.status === 403) { tokenMem = null; if (typeof caches !== 'undefined') await caches.default.delete(new Request('https://token.agf-balcao.local/cartao')); return tentar(); }
    throw e;
  }
}

export const CORREIOS_BASE = BASE;
