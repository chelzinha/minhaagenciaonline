// ============================================================
// ATENDE - APOIO OPERACIONAL DO CADASTRO PORTAL / CONSOLIDADOR
//
// O gatilho continua sendo o mesmo:
//   ATENDE_importarCsvDriveD1Agora
//
// Este arquivo adiciona somente funcoes de diagnostico/recalculo manual.
// ============================================================

function ATENDE_statusCadastroPortal() {
  const result = ATENDE_fetchD1_('/portal/status', { method: 'get' });
  console.log('ATENDE - STATUS CADASTRO PORTAL');
  console.log(JSON.stringify(result, null, 2));
  return result;
}

function ATENDE_recalcularCadastroPortal() {
  const result = ATENDE_fetchD1_('/rebuild-cliente-portal', {
    method: 'post',
    contentType: 'application/json',
    payload: '{}'
  });
  console.log('ATENDE - RECALCULO CADASTRO PORTAL');
  console.log(JSON.stringify(result, null, 2));
  return result;
}

function ATENDE_identificarCsvEntradaSemGravar() {
  const folders = ATENDE_getD1DriveFolders_();
  const files = ATENDE_listarCsvEntradaD1_(folders.entrada);
  if (!files.length) return { ok:true, files:[] };

  const result = files.map(function(file) {
    try {
      const parsed = ATENDE_lerCsv_(file);
      return {
        fileName: file.getName(),
        sourceType: parsed.sourceType || '',
        encoding: parsed.encoding || '',
        rows: (parsed.rawRows || []).length,
        headers: parsed.headers || []
      };
    } catch (err) {
      return {
        fileName: file.getName(),
        sourceType: '',
        error: err && err.message ? err.message : String(err)
      };
    }
  });
  console.log(JSON.stringify(result, null, 2));
  return { ok:true, files:result };
}
