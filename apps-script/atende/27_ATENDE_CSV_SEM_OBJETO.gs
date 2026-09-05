// ============================================================
// ATENDE - CHAVE TECNICA PARA ATENDIMENTOS SEM CODIGO DE OBJETO
// O ID real do atendimento fica como nota da celula Objeto, mantendo o valor
// visual vazio e fazendo a chave acompanhar a linha em ordenacoes/movimentos.
// ============================================================

var ATENDE_CSV_NOTE_PREFIX = 'ATENDE_CSV_ID:';

function ATENDE_readCsvRowKeys_(sheet, objectColumn) {
  const byObject = new Map();
  const byAttendance = new Map();
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return { byObject: byObject, byAttendance: byAttendance };

  const range = sheet.getRange(2, objectColumn, lastRow - 1, 1);
  const values = range.getDisplayValues();
  const notes = range.getNotes();

  values.forEach(function(row, index) {
    const sheetRow = index + 2;
    const objectCode = normalizeObjectCode_(ATENDE_cleanCsvValue_(row[0]));
    if (objectCode && !byObject.has(objectCode)) byObject.set(objectCode, sheetRow);

    const attendanceId = ATENDE_getAttendanceIdFromNote_(notes[index][0]);
    if (attendanceId && !byAttendance.has(attendanceId)) byAttendance.set(attendanceId, sheetRow);
  });

  return { byObject: byObject, byAttendance: byAttendance };
}

function ATENDE_getAttendanceIdFromNote_(note) {
  const text = String(note || '').trim();
  if (text.indexOf(ATENDE_CSV_NOTE_PREFIX) !== 0) return '';
  return text.slice(ATENDE_CSV_NOTE_PREFIX.length).trim();
}

function ATENDE_setCsvNotesForNewRows_(sheet, startRow, records, objectColumn) {
  if (!records || !records.length) return;
  const notes = records.map(function(record) {
    if (record.codObjeto || !record.csvAtendimentoId) return [''];
    return [ATENDE_CSV_NOTE_PREFIX + record.csvAtendimentoId];
  });
  sheet.getRange(startRow, objectColumn, records.length, 1).setNotes(notes);
}
