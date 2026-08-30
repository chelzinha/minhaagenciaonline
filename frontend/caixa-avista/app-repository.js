'use strict';

async function repositoryInit() {
  if (isRemoteMode()) return api({ action: 'init', date: todayIso() });
  const clients = loadJson(STORAGE.CLIENTS, []);
  const entries = loadJson(STORAGE.ENTRIES, []);
  return { ok: true, clients, entries, summary: buildSummary(sanitizeEntries(entries), todayIso()), closure: getLocalClosure(todayIso()) };
}

async function repositorySaveClient(name) {
  if (isRemoteMode()) return api({ action: 'saveClient', name });
  const normalized = normalizeText(name);
  const existing = state.clients.find(client => client.normalized === normalized);
  if (existing) return { ok: true, client: existing, duplicate: true };
  const client = { id: uuid(), name: cleanDisplayName(name), normalized };
  return { ok: true, client };
}

async function repositorySaveEntry(draft) {
  if (isRemoteMode()) return api({ action: 'saveEntry', payload: draft });
  const entry = sanitizeEntry({ ...draft, id: uuid(), createdAt: new Date().toISOString(), status: 'ATIVO' });
  return { ok: true, entry, summary: buildSummary([...state.entries, entry], todayIso()) };
}

async function repositorySaveBatch(drafts) {
  if (isRemoteMode()) return api({ action: 'saveBatch', payloads: drafts });
  const nextClients = [...state.clients];
  const entries = drafts.map(draft => {
    let client = nextClients.find(item => item.normalized === normalizeText(draft.clientName));
    if (!client) {
      client = sanitizeClient({ id: uuid(), name: draft.clientName });
      nextClients.push(client);
    }
    return sanitizeEntry({ ...draft, clientId: client.id, clientName: client.name, id: uuid(), createdAt: new Date().toISOString() });
  });
  state.clients = nextClients;
  return { ok: true, entries, clients: nextClients, summary: buildSummary([...state.entries, ...entries], todayIso()) };
}

async function repositoryUpdatePixStatus(entryId, pixStatus) {
  if (isRemoteMode()) return api({ action: 'updatePixStatus', entryId, pixStatus, date: todayIso() });
  const entries = state.entries.map(entry => entry.id === entryId ? { ...entry, pixStatus } : entry);
  return { ok: true, summary: buildSummary(entries, todayIso()) };
}

async function repositoryDeleteEntry(entryId) {
  if (isRemoteMode()) return api({ action: 'deleteEntry', entryId, date: todayIso() });
  const entries = state.entries.map(entry => entry.id === entryId ? { ...entry, status: 'EXCLUIDO' } : entry);
  return { ok: true, summary: buildSummary(entries, todayIso()) };
}

async function repositoryOperationalClose(date) {
  if (isRemoteMode()) return api({ action: 'closeOperational', date });
  const summary = buildSummary(state.entries, date);
  return {
    ok: true,
    closure: {
      id: uuid(), date, createdAt: new Date().toISOString(), status: 'OPERACIONAL_FECHADO',
      revenueCents: summary.revenueCents, expenseCents: summary.expenseCents,
      balanceCents: summary.balanceCents, pixPendingCents: summary.pixPendingCents
    }
  };
}

async function repositoryReconcile(payload) {
  if (isRemoteMode()) return api({ action: 'reconcile', payload });
  return {
    ok: true,
    closure: {
      ...(state.operationalClosure || {}),
      reconciliationAt: new Date().toISOString(),
      cashCountedCents: payload.cashCountedCents,
      pixCountedCents: payload.pixCountedCents,
      notes: payload.notes,
      status: 'CONFERIDO'
    }
  };
}

async function api(data) {
  const token = window.AgfAuth?.getToken ? window.AgfAuth.getToken() : '';
  const payload = token ? { ...data, st: token } : data;
  const response = await fetch(state.settings.apiUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(payload)
  });
  if (!response.ok) throw new Error(`Falha de comunicação (${response.status}).`);
  const result = await response.json();
  if (!result || !result.ok) throw new Error(result?.error || 'A API retornou uma resposta inválida.');
  return result;
}
