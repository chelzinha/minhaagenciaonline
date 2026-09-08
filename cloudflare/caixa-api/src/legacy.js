'use strict';

function legacyUrl(env) {
  const value = String(env.LEGACY_CAIXA_URL || '').trim();
  if (!/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(value)) {
    throw new Error('LEGACY_CAIXA_URL não configurada no Worker.');
  }
  return value;
}

export async function postLegacy(env, payload) {
  const response = await fetch(legacyUrl(env), {
    method: 'POST',
    headers: {
      'Content-Type': 'text/plain;charset=utf-8'
    },
    body: JSON.stringify(payload || {})
  });

  if (!response.ok) {
    throw new Error('O backend legado do Caixa não respondeu corretamente.');
  }

  const data = await response.json();
  return data;
}

export async function pullFullSnapshot(env, token) {
  const result = await postLegacy(env, {
    action: 'exportD1Snapshot',
    st: token
  });

  if (!result?.ok) {
    const error = new Error(
      result?.error || result?.message || 'Não foi possível exportar a base do Caixa.'
    );
    error.code = result?.code || 'LEGACY_EXPORT_FAILED';
    throw error;
  }

  return result;
}

export async function pullUnitSnapshot(env, token, unitId) {
  const result = await postLegacy(env, {
    action: 'exportD1UnitSnapshot',
    st: token,
    unitId: String(unitId || '').trim()
  });

  if (!result?.ok) {
    const error = new Error(
      result?.error || result?.message || 'Não foi possível atualizar o espelho D1 da unidade.'
    );
    error.code = result?.code || 'LEGACY_UNIT_EXPORT_FAILED';
    throw error;
  }

  return result;
}
