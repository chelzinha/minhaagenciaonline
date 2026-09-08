'use strict';

const textEncoder = new TextEncoder();

function base64UrlToBytes(value) {
  const normalized = String(value || '')
    .replace(/-/g, '+')
    .replace(/_/g, '/');
  const pad = normalized.length % 4;
  const padded = normalized + (pad ? '='.repeat(4 - pad) : '');
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function bytesToBase64Url(bytes) {
  let binary = '';
  const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  for (let index = 0; index < data.length; index += 1) {
    binary += String.fromCharCode(data[index]);
  }
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

async function hmacSha256(secret, value) {
  const key = await crypto.subtle.importKey(
    'raw',
    textEncoder.encode(String(secret || '')),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  return new Uint8Array(
    await crypto.subtle.sign(
      'HMAC',
      key,
      textEncoder.encode(String(value || ''))
    )
  );
}

function timingSafeEqual(left, right) {
  const a = String(left || '');
  const b = String(right || '');
  let diff = a.length ^ b.length;
  const max = Math.max(a.length, b.length);

  for (let index = 0; index < max; index += 1) {
    diff |=
      (a.charCodeAt(index % Math.max(1, a.length)) || 0) ^
      (b.charCodeAt(index % Math.max(1, b.length)) || 0);
  }

  return diff === 0;
}

export async function verifyAgfToken(token, secret) {
  try {
    const parts = String(token || '').split('.');
    if (parts.length !== 3 || !secret) return null;

    const header = JSON.parse(
      new TextDecoder().decode(base64UrlToBytes(parts[0]))
    );

    if (
      String(header?.alg || '').toUpperCase() !== 'HS256' ||
      String(header?.typ || 'JWT').toUpperCase() !== 'JWT'
    ) {
      return null;
    }

    const expected = bytesToBase64Url(
      await hmacSha256(secret, parts[0] + '.' + parts[1])
    );

    if (!timingSafeEqual(expected, parts[2])) return null;

    const payload = JSON.parse(
      new TextDecoder().decode(base64UrlToBytes(parts[1]))
    );

    const now = Math.floor(Date.now() / 1000);

    if (
      !payload ||
      !payload.sub ||
      !payload.role ||
      !payload.exp ||
      Number(payload.exp) < now
    ) {
      return null;
    }

    const apps = Array.isArray(payload.apps)
      ? payload.apps.map(item => String(item || '').toLowerCase())
      : [];

    if (!apps.includes('caixa')) return null;

    return payload;
  } catch (_) {
    return null;
  }
}

export function normalizedUsername(user) {
  return String(user?.sub || user?.username || user?.email || '')
    .trim()
    .toLowerCase();
}
