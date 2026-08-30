'use strict';

document.addEventListener('DOMContentLoaded', boot);

window.CaixaAvistaTest = {
  normalizeText,
  searchClients: query => searchClients(query).map(item => item.name),
  buildPixPayload,
  crc16Ccitt,
  parseBatch,
  buildSummary
};
