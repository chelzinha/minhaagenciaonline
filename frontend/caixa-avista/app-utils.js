'use strict';

function normalizeText(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanDisplayName(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function sanitizePixText(value, maxLength) {
  return cleanDisplayName(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9 $%*+\-./:]/g, '')
    .slice(0, maxLength);
}

function buildPixPayload({ key, name, city, amountCents, txid }) {
  if (!key) throw new Error('Chave Pix não configurada.');
  if (!(amountCents > 0)) throw new Error('Valor Pix inválido.');
  const merchantAccount = emv('00', 'BR.GOV.BCB.PIX') + emv('01', key);
  const additional = emv('05', txid || '***');
  const amount = (amountCents / 100).toFixed(2);
  const withoutCrc = [
    emv('00', '01'),
    emv('26', merchantAccount),
    emv('52', '0000'),
    emv('53', '986'),
    emv('54', amount),
    emv('58', 'BR'),
    emv('59', sanitizePixText(name, 25)),
    emv('60', sanitizePixText(city, 15)),
    emv('62', additional),
    '6304'
  ].join('');
  return withoutCrc + crc16Ccitt(withoutCrc);
}

function emv(id, value) {
  const text = String(value ?? '');
  return id + String(text.length).padStart(2, '0') + text;
}

function crc16Ccitt(value) {
  let crc = 0xFFFF;
  for (let i = 0; i < value.length; i += 1) {
    crc ^= value.charCodeAt(i) << 8;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) : (crc << 1);
      crc &= 0xFFFF;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

async function copyText(text) {
  if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text);
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();
  const ok = document.execCommand('copy');
  textarea.remove();
  if (!ok) throw new Error('Falha ao copiar.');
}

function todayIso() {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
}

function capitalize(value) { return value ? value.charAt(0).toUpperCase() + value.slice(1) : ''; }
function uuid() { return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`; }
function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
}

function sanitizeClient(raw) {
  const name = cleanDisplayName(raw.name || raw.clientName || '');
  return { id: String(raw.id || raw.clientId || uuid()), name, normalized: normalizeText(name) };
}
function sanitizeClients(items) { return items.map(sanitizeClient).filter(item => item.name); }
function sanitizeEntry(raw) {
  return {
    id: String(raw.id || raw.entryId || uuid()),
    date: raw.date || raw.dateIso || todayIso(),
    createdAt: raw.createdAt || new Date().toISOString(),
    type: raw.type || 'RECEITA',
    clientId: String(raw.clientId || ''),
    clientName: cleanDisplayName(raw.clientName || ''),
    objectCount: Number(raw.objectCount || 0),
    amountCents: Number(raw.amountCents || 0),
    paymentMethod: raw.paymentMethod || '',
    pixStatus: String(raw.pixStatus || '').toUpperCase(),
    pixTxid: String(raw.pixTxid || raw.txid || ''),
    pixE2eid: String(raw.pixE2eid || raw.e2eid || ''),
    pixReceivedAt: raw.pixReceivedAt || raw.receivedAt || '',
    pixProvider: raw.pixProvider || raw.provider || '',
    expenseCategory: raw.expenseCategory || '',
    description: raw.description || '',
    status: raw.status || 'ATIVO',
    closed: Boolean(raw.closed || raw.closureId)
  };
}
function sanitizeEntries(items) { return items.map(sanitizeEntry); }

function emptySummary() {
  return { date: todayIso(), revenueCents: 0, expenseCents: 0, balanceCents: 0, revenueCount: 0, expenseCount: 0, pixPendingCents: 0, pixConfirmedCents: 0, byPayment: {} };
}

function buildSummary(entries, date) {
  const summary = emptySummary();
  summary.date = date;
  entries.filter(entry => entry.date === date && entry.status !== 'EXCLUIDO').forEach(entry => {
    if (entry.type === 'DESPESA') {
      summary.expenseCents += entry.amountCents;
      summary.expenseCount += 1;
      return;
    }
    if (entry.paymentMethod === 'PIX' && entry.pixStatus !== 'CONFIRMADO') {
      summary.pixPendingCents += entry.amountCents;
      return;
    }
    summary.revenueCents += entry.amountCents;
    summary.revenueCount += 1;
    summary.byPayment[entry.paymentMethod] = (summary.byPayment[entry.paymentMethod] || 0) + entry.amountCents;
    if (entry.paymentMethod === 'PIX') summary.pixConfirmedCents += entry.amountCents;
  });
  summary.balanceCents = summary.revenueCents - summary.expenseCents;
  return summary;
}

function loadJson(key, fallback) {
  try {
    const value = JSON.parse(localStorage.getItem(key));
    return value ?? fallback;
  } catch (error) {
    return fallback;
  }
}

function isRemoteMode() { return Boolean(String(state.settings.apiUrl || '').trim()); }

function ensureWalkInClient() {
  const normalized = normalizeText('Cliente de Balcão');
  if (!state.clients.some(client => client.normalized === normalized)) {
    state.clients.unshift({ id: 'cliente-balcao', name: 'Cliente de Balcão', normalized });
    persistClientsIfLocal();
  }
}

function persistClientsIfLocal() { if (!isRemoteMode()) localStorage.setItem(STORAGE.CLIENTS, JSON.stringify(state.clients)); }
function persistEntriesIfLocal() { if (!isRemoteMode()) localStorage.setItem(STORAGE.ENTRIES, JSON.stringify(state.entries)); }
function persistClosureIfLocal(closure) {
  if (isRemoteMode()) return;
  const closures = loadJson(STORAGE.CLOSURES, {});
  closures[todayIso()] = closure;
  localStorage.setItem(STORAGE.CLOSURES, JSON.stringify(closures));
}
function getLocalClosure(date) { return loadJson(STORAGE.CLOSURES, {})[date] || null; }
