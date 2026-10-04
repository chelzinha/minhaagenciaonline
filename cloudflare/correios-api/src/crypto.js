// AES-GCM com chave do Worker Secret ENCRYPTION_KEY (32 bytes em base64 ou hex).

function httpError(message, status) {
  return Object.assign(new Error(message), { status });
}

function base64Url(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function fromBase64Url(value) {
  const padded = String(value).replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
  return Uint8Array.from(atob(padded), (char) => char.charCodeAt(0));
}

function keyBytes(raw) {
  const text = String(raw || '').trim();
  if (/^[0-9a-f]{64}$/i.test(text)) return Uint8Array.from(text.match(/../g), (hex) => parseInt(hex, 16));
  try {
    const bytes = fromBase64Url(text);
    if (bytes.length === 32) return bytes;
  } catch { /* formato inválido */ }
  throw httpError('ENCRYPTION_KEY inválida: use 32 bytes em base64 ou 64 caracteres hex.', 503);
}

let cachedKey = null;
let cachedRaw = null;

async function encryptionKey(env) {
  if (!env.ENCRYPTION_KEY) throw httpError('Configuração ausente: ENCRYPTION_KEY', 503);
  if (cachedKey && cachedRaw === env.ENCRYPTION_KEY) return cachedKey;
  cachedKey = await crypto.subtle.importKey('raw', keyBytes(env.ENCRYPTION_KEY), { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
  cachedRaw = env.ENCRYPTION_KEY;
  return cachedKey;
}

export async function encryptSecret(value, env) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await encryptionKey(env);
  const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(String(value)));
  return `v1.${base64Url(iv)}.${base64Url(new Uint8Array(data))}`;
}

export async function decryptSecret(value, env) {
  const [version, iv, payload] = String(value || '').split('.');
  if (version !== 'v1' || !iv || !payload) throw httpError('Segredo armazenado em formato inválido.', 500);
  const key = await encryptionKey(env);
  const data = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromBase64Url(iv) }, key, fromBase64Url(payload));
  return new TextDecoder().decode(data);
}

export function constantTimeEqual(a, b) {
  const left = String(a || '');
  const right = String(b || '');
  if (!left || left.length !== right.length) return false;
  let diff = 0;
  for (let i = 0; i < left.length; i += 1) diff |= left.charCodeAt(i) ^ right.charCodeAt(i);
  return diff === 0;
}
