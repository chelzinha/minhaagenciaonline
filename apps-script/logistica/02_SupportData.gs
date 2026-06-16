/***************************************
 * REVERSA - ETAPA 2
 * Popula listas auxiliares, parâmetros
 * e aplica validações de dados
 ***************************************/

/** =========================
 * CFG ETAPA 2
 * ========================= */
const REVERSA_SETUP2_CFG = {
  SPREADSHEET_ID: '1S_U-nsBJXDd8D5gWEfROv-ii0JJZEfdKUgk6ndeRL_k',
  HEADER_ROW: 1,
  START_DATA_ROW: 2
};


/** =========================
 * FUNÇÃO PRINCIPAL ETAPA 2
 * ========================= */
function setupReversaSupportData() {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);

  try {
    const ss = SpreadsheetApp.openById(REVERSA_SETUP2_CFG.SPREADSHEET_ID);

    seedAuxListas_(ss);
    seedParametros_(ss);
    applyReversaValidations_(ss);
    formatReversaSheets_(ss);
    applyEditableCellsHighlight_(ss);

    SpreadsheetApp.flush();
    SpreadsheetApp.getUi().alert('Listas, parâmetros e validações configurados com sucesso.');
  } catch (err) {
    Logger.log(`[REVERSA][ERRO][SETUP2] ${err && err.stack ? err.stack : err}`);
    SpreadsheetApp.getUi().alert(`Erro na Etapa 2: ${err.message || err}`);
    throw err;
  } finally {
    lock.releaseLock();
  }
}

/** =========================
 * CHAMADA ISOLADA
 * ========================= */
function applyReversaValidations() {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);

  try {
    const ss = SpreadsheetApp.openById(REVERSA_SETUP2_CFG.SPREADSHEET_ID);
    applyReversaValidations_(ss);
    SpreadsheetApp.flush();
    SpreadsheetApp.getUi().alert('Validações aplicadas com sucesso.');
  } catch (err) {
    Logger.log(`[REVERSA][ERRO][VALIDATIONS] ${err && err.stack ? err.stack : err}`);
    SpreadsheetApp.getUi().alert(`Erro ao aplicar validações: ${err.message || err}`);
    throw err;
  } finally {
    lock.releaseLock();
  }
}

/** =========================
 * POPULA AUX_LISTAS
 * ========================= */
function seedAuxListas_(ss) {
  const sheet = ss.getSheetByName('AUX_LISTAS');
  if (!sheet) throw new Error('Aba AUX_LISTAS não encontrada.');

  const headers = getHeaders_(sheet);
  const required = ['lista', 'valor', 'ordem', 'ativo'];
  validateRequiredHeaders_(headers, required, 'AUX_LISTAS');

  const existingKeys = readExistingCompositeKeys_(sheet, ['lista', 'valor']);

  const rows = [];
  const pushList = (lista, values) => {
    values.forEach((value, idx) => {
      const key = `${lista}|||${value}`;
      if (!existingKeys.has(key)) {
        rows.push([lista, value, idx + 1, 'SIM']);
      }
    });
  };

  pushList('status_unidade', ['ativa', 'manutencao', 'bloqueada', 'inativa']);
  pushList('tipo_unidade', ['edificio_comercial', 'condominio_residencial', 'centro_empresarial', 'outro']);
  pushList('status_usuario', ['ativo', 'inativo', 'bloqueado']);
  pushList('status_etiqueta', ['disponivel', 'lida', 'confirmada_dropoff', 'coletada', 'concluida', 'inutilizada']);
  pushList('status_reversa', ['criada', 'aguardando_confirmacao_dropoff', 'dropoff_realizado', 'aguardando_coleta_agf', 'coletada_agf', 'recebida_agencia', 'postada', 'concluida', 'divergencia', 'cancelada']);
  pushList('status_coleta', ['aberta', 'em_andamento', 'concluida', 'concluida_com_divergencia', 'cancelada']);
  pushList('status_divergencia', ['aberta', 'em_tratativa', 'resolvida', 'encerrada']);
  pushList('tipo_divergencia', ['pacote_sem_etiqueta', 'etiqueta_invalida', 'pacote_nao_esperado', 'pacote_danificado', 'pacote_ausente', 'etiqueta_nao_lida', 'outro']);
  pushList('janela_coleta', ['proximo_dia_util', 'ate_2_dias_uteis', 'ate_3_dias_uteis']);
  pushList('origem_evento', ['app_usuario', 'painel_agf', 'app_coletador', 'sistema']);
  pushList('ator_tipo', ['usuario', 'agf', 'coletador', 'sistema']);
  pushList('status_parametro', ['ativo', 'inativo']);
  pushList('sim_nao', ['SIM', 'NAO']);

  appendRowsIfAny_(sheet, rows);
}

/** =========================
 * POPULA PARAMETROS
 * ========================= */
function seedParametros_(ss) {
  const sheet = ss.getSheetByName('PARAMETROS');
  if (!sheet) throw new Error('Aba PARAMETROS não encontrada.');

  const headers = getHeaders_(sheet);
  const required = ['parametro', 'valor', 'descricao', 'escopo', 'status_parametro'];
  validateRequiredHeaders_(headers, required, 'PARAMETROS');

  const existing = readExistingSingleKey_(sheet, 'parametro');

  const params = [
    ['dias_uteis_padrao_coleta', '2', 'Prazo padrão de coleta em dias úteis quando a unidade não tiver regra específica.', 'GLOBAL', 'ativo'],
    ['dias_uteis_max_coleta', '3', 'Prazo máximo padrão permitido de coleta em dias úteis.', 'GLOBAL', 'ativo'],
    ['email_suporte_padrao', 'suporte@minhaagenciaonline.com.br', 'E-mail padrão de suporte do projeto.', 'GLOBAL', 'ativo'],
    ['telefone_suporte_padrao', '', 'Telefone/WhatsApp padrão de suporte do projeto.', 'GLOBAL', 'ativo'],
    ['mensagem_alerta_codigo_nao_reconhecido', 'Não reconhecemos este tipo de código de autorização. Por favor confira com a loja se essa autorização é realmente dos Correios. Qualquer dúvida entre em contato com a nossa equipe.', 'Mensagem exibida ao usuário quando o código não bater com os padrões conhecidos.', 'GLOBAL', 'ativo'],
    ['capacidade_default_pacotes', '30', 'Capacidade padrão em quantidade de pacotes para novas unidades.', 'GLOBAL', 'ativo'],
    ['nivel_alerta_ocupacao_pct_default', '80', 'Percentual padrão para alerta de ocupação da unidade.', 'GLOBAL', 'ativo'],
    ['prazo_alerta_dropoff_pendente_horas', '24', 'Horas para alerta de etiqueta lida sem confirmação de drop-off.', 'GLOBAL', 'ativo'],
    ['regex_codigo_correios_1', '^[A-Za-z0-9\\-]{6,40}$', 'Padrão genérico inicial para códigos aceitos. Ajustar depois com padrões reais.', 'GLOBAL', 'ativo'],
    ['origem_exec_projeto', 'https://script.google.com/macros/s/AKfycbzKKJ9mnRRa9E6JLOuDLKadK5D5_I6AgV2Gus5gVISByV5z3TB9KL13hqJrjMowI090Qw/exec', 'URL exec atual do projeto.', 'GLOBAL', 'ativo'],
    ['divergencias_fotos_drive_folder_id', '', 'ID da pasta Drive usada para armazenar fotos registradas pelo coletador. Se vazio, o sistema cria a pasta automaticamente.', 'GLOBAL', 'ativo']
  ];

  const rows = params.filter(row => !existing.has(row[0]));
  appendRowsIfAny_(sheet, rows);
}

/** =========================
 * APLICA VALIDAÇÕES
 * ========================= */
function applyReversaValidations_(ss) {
  const auxSheet = ss.getSheetByName('AUX_LISTAS');
  if (!auxSheet) throw new Error('Aba AUX_LISTAS não encontrada.');

  const auxData = auxSheet.getDataRange().getValues();
  const auxHeaders = auxData[0];
  const auxIdx = headerMap_(auxHeaders);

  const groupedLists = {};
  for (let i = 1; i < auxData.length; i++) {
    const row = auxData[i];
    const lista = String(row[auxIdx.lista] || '').trim();
    const valor = String(row[auxIdx.valor] || '').trim();
    const ativo = String(row[auxIdx.ativo] || '').trim().toUpperCase();

    if (!lista || !valor || ativo !== 'SIM') continue;
    if (!groupedLists[lista]) groupedLists[lista] = [];
    groupedLists[lista].push(valor);
  }

  applyValidationToColumnByHeader_(ss, 'UNIDADES', 'tipo_unidade', groupedLists.tipo_unidade || []);
  applyValidationToColumnByHeader_(ss, 'UNIDADES', 'status_unidade', groupedLists.status_unidade || []);
  applyValidationToColumnByHeader_(ss, 'USUARIOS', 'status_usuario', groupedLists.status_usuario || []);
  applyValidationToColumnByHeader_(ss, 'USUARIOS', 'aceite_termos', groupedLists.sim_nao || []);
  applyValidationToColumnByHeader_(ss, 'LOTES_ETIQUETAS', 'status_lote', ['aberto', 'parcial', 'consumido', 'encerrado']);
  applyValidationToColumnByHeader_(ss, 'ETIQUETAS', 'status_etiqueta', groupedLists.status_etiqueta || []);
  applyValidationToColumnByHeader_(ss, 'REVERSAS', 'status_reversa', groupedLists.status_reversa || []);
  applyValidationToColumnByHeader_(ss, 'REVERSAS', 'janela_coleta', groupedLists.janela_coleta || []);
  applyValidationToColumnByHeader_(ss, 'COLETAS', 'status_coleta', groupedLists.status_coleta || []);
  applyValidationToColumnByHeader_(ss, 'COLETA_ITENS', 'status_item_coleta', ['confirmado', 'ausente', 'divergente', 'invalido']);
  applyValidationToColumnByHeader_(ss, 'DIVERGENCIAS', 'tipo_divergencia', groupedLists.tipo_divergencia || []);
  applyValidationToColumnByHeader_(ss, 'DIVERGENCIAS', 'status_divergencia', groupedLists.status_divergencia || []);
  applyValidationToColumnByHeader_(ss, 'PARAMETROS', 'status_parametro', groupedLists.status_parametro || []);

  applyNumberValidationToColumnByHeader_(ss, 'UNIDADES', 'prazo_coleta_dias_uteis');
  applyNumberValidationToColumnByHeader_(ss, 'UNIDADES', 'capacidade_max_pacotes');
  applyNumberValidationToColumnByHeader_(ss, 'UNIDADES', 'capacidade_max_volume_litros');
  applyNumberValidationToColumnByHeader_(ss, 'UNIDADES', 'nivel_alerta_ocupacao_pct');

  applyNumberValidationToColumnByHeader_(ss, 'REVERSAS', 'comprimento_cm');
  applyNumberValidationToColumnByHeader_(ss, 'REVERSAS', 'largura_cm');
  applyNumberValidationToColumnByHeader_(ss, 'REVERSAS', 'altura_cm');
}

/** =========================
 * FORMATAÇÃO BÁSICA
 * ========================= */
function formatReversaSheets_(ss) {
  const dateLikeHeaders = [
    'data_criacao',
    'data_atualizacao',
    'data_ultimo_acesso',
    'data_aceite_termos',
    'data_geracao',
    'data_abastecimento',
    'data_leitura',
    'data_confirmacao_dropoff',
    'data_coleta',
    'data_conclusao',
    'data_limite_operacional',
    'data_coleta_programada',
    'data_inicio_coleta',
    'data_fim_coleta',
    'data_coleta_agf',
    'data_recebimento_agencia',
    'data_postagem',
    'data_email_enviado',
    'data_whatsapp',
    'data_hora_leitura_coletador',
    'data_hora_evento',
    'data_abertura',
    'data_fechamento'
  ];

  const sheets = [
    'UNIDADES',
    'USUARIOS',
    'LOTES_ETIQUETAS',
    'ETIQUETAS',
    'REVERSAS',
    'COLETAS',
    'COLETA_ITENS',
    'DIVERGENCIAS',
    'EVENTOS'
  ];

  sheets.forEach(sheetName => {
    const sheet = ss.getSheetByName(sheetName);
    if (!sheet) return;

    const headers = getHeaders_(sheet);
    const map = headerMap_(headers);

    dateLikeHeaders.forEach(h => {
      if (map[h] !== undefined) {
        const col = map[h] + 1;
        sheet.getRange(2, col, Math.max(sheet.getMaxRows() - 1, 1), 1)
          .setNumberFormat('dd/mm/yyyy hh:mm');
      }
    });

    const firstRow = sheet.getRange(1, 1, 1, headers.length);
    const existingFilter = sheet.getFilter();
    if (existingFilter) {
      existingFilter.remove();
    }
    firstRow.createFilter();
  });
}

/** =========================
 * HELPERS - VALIDAÇÕES
 * ========================= */
function applyValidationToColumnByHeader_(ss, sheetName, headerName, values) {
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet || !values || !values.length) return;

  const headers = getHeaders_(sheet);
  const map = headerMap_(headers);
  if (map[headerName] === undefined) return;

  const col = map[headerName] + 1;
  const range = sheet.getRange(2, col, Math.max(sheet.getMaxRows() - 1, 1), 1);

  const rule = SpreadsheetApp.newDataValidation()
    .requireValueInList(values, true)
    .setAllowInvalid(false)
    .build();

  range.setDataValidation(rule);
}

function applyNumberValidationToColumnByHeader_(ss, sheetName, headerName) {
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) return;

  const headers = getHeaders_(sheet);
  const map = headerMap_(headers);
  if (map[headerName] === undefined) return;

  const col = map[headerName] + 1;
  const range = sheet.getRange(2, col, Math.max(sheet.getMaxRows() - 1, 1), 1);

  const rule = SpreadsheetApp.newDataValidation()
    .requireNumberGreaterThanOrEqualTo(0)
    .setAllowInvalid(false)
    .build();

  range.setDataValidation(rule);
}

/** =========================
 * HELPERS - LEITURA/GRAVAÇÃO
 * ========================= */
function validateRequiredHeaders_(headers, required, sheetName) {
  const missing = required.filter(h => !headers.includes(h));
  if (missing.length) {
    throw new Error(`Aba ${sheetName} sem cabeçalhos obrigatórios: ${missing.join(', ')}`);
  }
}

function readExistingCompositeKeys_(sheet, headerNames) {
  const headers = getHeaders_(sheet);
  const map = headerMap_(headers);
  const lastRow = sheet.getLastRow();
  const keys = new Set();

  if (lastRow < 2) return keys;

  const data = sheet.getRange(2, 1, lastRow - 1, headers.length).getValues();
  data.forEach(row => {
    const parts = headerNames.map(h => String(row[map[h]] || '').trim());
    if (parts.every(Boolean)) {
      keys.add(parts.join('|||'));
    }
  });

  return keys;
}

function readExistingSingleKey_(sheet, headerName) {
  const headers = getHeaders_(sheet);
  const map = headerMap_(headers);
  const lastRow = sheet.getLastRow();
  const keys = new Set();

  if (lastRow < 2) return keys;

  const data = sheet.getRange(2, 1, lastRow - 1, headers.length).getValues();
  data.forEach(row => {
    const value = String(row[map[headerName]] || '').trim();
    if (value) keys.add(value);
  });

  return keys;
}

function appendRowsIfAny_(sheet, rows) {
  if (!rows.length) return;
  const startRow = sheet.getLastRow() + 1;
  sheet.getRange(startRow, 1, rows.length, rows[0].length).setValues(rows);
} 