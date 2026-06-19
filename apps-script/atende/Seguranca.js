// ============================================================
//  SEGURANCA
// ============================================================

function validarIngestToken_(tokenRecebido) {
  var tokenConfigurado = PropertiesService
    .getScriptProperties()
    .getProperty(ATENDE_CONFIG.PROP_INGEST_TOKEN);

  if (!tokenConfigurado) {
    throw new Error('INGEST_TOKEN nao configurado nas propriedades do Apps Script.');
  }
  if (!tokenRecebido || safe_(tokenRecebido) !== tokenConfigurado) {
    throw new Error('Token de importacao invalido.');
  }
}

function sanitizeLogText_(value) {
  var text = safe_(value);
  text = text.replace(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g, '***CPF***');
  text = text.replace(/\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/g, '***CNPJ***');
  text = text.replace(/\b(?:\+?55\s*)?\(?\d{2}\)?\s?\d{4,5}-?\d{4}\b/g, '***TELEFONE***');
  text = text.replace(/(token|authorization|cookie|senha|password|secret)\s*[:=]\s*["']?[^"',\s}]+/gi, '$1=***');
  return text.slice(0, 1000);
}

function releaseLockQuietly_(lock) {
  try {
    lock.releaseLock();
  } catch (_) {}
}

