'use strict';

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot, { once: true });
} else {
  boot();
}

window.CaixaAvistaTest = {
  normalizeText,
  searchClients: query => searchClients(query).map(item => item.name),
  buildPixPayload,
  crc16Ccitt,
  parseBatch,
  buildSummary
};
