/***************************************
 * REVERSA - SETUP INICIAL DA PLANILHA
 * Cria abas e cabeçalhos do projeto
 ***************************************/

/** =========================
 * CFG
 * ========================= */
const REVERSA_CFG = {
  SPREADSHEET_ID: '1S_U-nsBJXDd8D5gWEfROv-ii0JJZEfdKUgk6ndeRL_k',
  PROJECT_EXEC_URL: 'https://script.google.com/macros/s/AKfycbzKKJ9mnRRa9E6JLOuDLKadK5D5_I6AgV2Gus5gVISByV5z3TB9KL13hqJrjMowI090Qw/exec',
  HEADER_BG: '#0b57d0',
  HEADER_FONT_COLOR: '#ffffff',
  FROZEN_ROWS: 1,
  DEFAULT_COLUMN_WIDTH: 180,
  NARROW_COLUMN_WIDTH: 130,
  WIDE_COLUMN_WIDTH: 240,
  TIMESTAMP_TZ: Session.getScriptTimeZone() || 'America/Fortaleza'
};


/** =========================
 * FUNÇÃO PRINCIPAL
 * ========================= */
function setupReversaSpreadsheet() {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);

  try {
    const ss = SpreadsheetApp.openById(REVERSA_CFG.SPREADSHEET_ID);
    const schemas = buildReversaSchemas_();

    Object.keys(schemas).forEach(sheetName => {
      upsertSheetWithHeaders_(ss, sheetName, schemas[sheetName]);
    });

    SpreadsheetApp.flush();
    Logger.log('[REVERSA][SETUP] Estrutura criada/garantida com sucesso.');
    SpreadsheetApp.getUi().alert('Estrutura da planilha criada/garantida com sucesso.');
  } catch (err) {
    Logger.log(`[REVERSA][ERRO][SETUP] ${err && err.stack ? err.stack : err}`);
    SpreadsheetApp.getUi().alert(`Erro ao criar a estrutura: ${err.message || err}`);
    throw err;
  } finally {
    lock.releaseLock();
  }
}

/** =========================
 * SINCRONIZA SOMENTE ABAS
 * QUE EXISTEM E TÊM LINHA 1 VAZIA
 * ========================= */
function syncReversaHeadersIfEmpty() {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);

  try {
    const ss = SpreadsheetApp.openById(REVERSA_CFG.SPREADSHEET_ID);
    const schemas = buildReversaSchemas_();

    Object.keys(schemas).forEach(sheetName => {
      const sheet = ss.getSheetByName(sheetName);
      if (!sheet) return;

      const maxCols = Math.max(sheet.getLastColumn(), schemas[sheetName].length);
      const row1 = maxCols > 0
        ? sheet.getRange(1, 1, 1, maxCols).getValues()[0]
        : [];

      const hasAnyHeaderValue = row1.some(v => String(v || '').trim() !== '');
      if (!hasAnyHeaderValue) {
        writeHeaders_(sheet, schemas[sheetName]);
        styleHeader_(sheet, schemas[sheetName].length);
        applyColumnWidths_(sheet, schemas[sheetName]);
      }
    });

    SpreadsheetApp.flush();
    SpreadsheetApp.getUi().alert('Sincronização concluída para abas com cabeçalho vazio.');
  } catch (err) {
    Logger.log(`[REVERSA][ERRO][SYNC] ${err && err.stack ? err.stack : err}`);
    SpreadsheetApp.getUi().alert(`Erro na sincronização: ${err.message || err}`);
    throw err;
  } finally {
    lock.releaseLock();
  }
}

/** =========================
 * VALIDA E MOSTRA RESUMO
 * ========================= */
function validateReversaSpreadsheet() {
  const ss = SpreadsheetApp.openById(REVERSA_CFG.SPREADSHEET_ID);
  const schemas = buildReversaSchemas_();

  const report = [];

  Object.keys(schemas).forEach(sheetName => {
    const expected = schemas[sheetName];
    const sheet = ss.getSheetByName(sheetName);

    if (!sheet) {
      report.push(`❌ ${sheetName}: aba inexistente`);
      return;
    }

    const current = sheet.getRange(1, 1, 1, expected.length).getValues()[0];
    const ok = expected.every((header, idx) => String(current[idx] || '').trim() === header);

    if (ok) {
      report.push(`✅ ${sheetName}: cabeçalhos OK`);
    } else {
      report.push(`⚠️ ${sheetName}: cabeçalhos diferentes do esperado`);
    }
  });

  SpreadsheetApp.getUi().alert(report.join('\n'));
}

/** =========================
 * ESQUEMAS DAS ABAS
 * ========================= */
function buildReversaSchemas_() {
  return {
    PARAMETROS: [
      'parametro',
      'valor',
      'descricao',
      'escopo',
      'status_parametro'
    ],

    AUX_LISTAS: [
      'lista',
      'valor',
      'ordem',
      'ativo'
    ],

    UNIDADES: [
      'unidade_id',
      'codigo_unidade',
      'slug_unidade',
      'nome_unidade',
      'tipo_unidade',
      'status_unidade',
      'endereco',
      'numero',
      'complemento',
      'bairro',
      'cidade',
      'uf',
      'cep',
      'latitude',
      'longitude',
      'prazo_coleta_dias_uteis',
      'capacidade_max_pacotes',
      'capacidade_max_volume_litros',
      'nivel_alerta_ocupacao_pct',
      'email_suporte',
      'telefone_suporte',
      'mensagem_usuario',
      'logo_unidade_url',
      'qr_url_unidade',
      'data_criacao',
      'data_atualizacao',
      'coletador_padrao_id'
    ],

    USUARIOS: [
      'usuario_id',
      'unidade_id',
      'nome',
      'cpf',
      'sala_apto_empresa',
      'telefone',
      'email',
      'status_usuario',
      'aceite_termos',
      'data_aceite_termos',
      'origem_cadastro',
      'data_cadastro',
      'data_ultimo_acesso',
      'observacao_interna'
    ],

    LOTES_ETIQUETAS: [
      'lote_id',
      'unidade_id',
      'codigo_lote',
      'prefixo_etiqueta',
      'faixa_inicial',
      'faixa_final',
      'qtde_gerada',
      'qtde_disponivel',
      'qtde_lida',
      'qtde_confirmada_dropoff',
      'qtde_coletada',
      'qtde_inutilizada',
      'status_lote',
      'data_geracao',
      'data_abastecimento',
      'responsavel_geracao',
      'observacao'
    ],

    ETIQUETAS: [
      'etiqueta_id',
      'lote_id',
      'unidade_id',
      'codigo_etiqueta',
      'codigo_manual_curto',
      'qr_url_etiqueta',
      'status_etiqueta',
      'usuario_id',
      'reversa_id',
      'data_geracao',
      'data_leitura',
      'data_confirmacao_dropoff',
      'data_coleta',
      'data_conclusao',
      'origem_leitura',
      'observacao'
    ],

    REVERSAS: [
      'reversa_id',
      'unidade_id',
      'usuario_id',
      'etiqueta_id',
      'codigo_autorizacao',
      'codigo_autorizacao_normalizado',
      'tipo_validacao_codigo',
      'alerta_codigo',
      'janela_coleta',
      'data_limite_operacional',
      'comprimento_cm',
      'largura_cm',
      'altura_cm',
      'volume_litros_estimado',
      'status_reversa',
      'observacao_usuario',
      'data_criacao',
      'data_confirmacao_dropoff',
      'data_coleta_agf',
      'data_recebimento_agencia',
      'data_postagem',
      'data_conclusao',
      'recebido_por',
      'codigo_sro',
      'postado_por',
      'comunicacao_email_enviada',
      'data_email_enviado',
      'comunicacao_whatsapp_status',
      'data_whatsapp'
    ],

    COLETAS: [
      'coleta_id',
      'unidade_id',
      'data_coleta_programada',
      'data_inicio_coleta',
      'data_fim_coleta',
      'coletador_id',
      'qtde_prevista',
      'qtde_coletada',
      'status_coleta',
      'observacao_coleta',
      'data_criacao',
      'origem_coleta',
      'data_limite_operacional',
      'data_atualizacao',
      'coletador_id_original',
      'coletador_id_atual',
      'data_transferencia',
      'motivo_transferencia',
      'transferido_por'
    ],

    COLETA_ITENS: [
      'coleta_item_id',
      'coleta_id',
      'reversa_id',
      'etiqueta_id',
      'unidade_id',
      'usuario_id',
      'data_hora_leitura_coletador',
      'status_item_coleta',
      'divergencia_id',
      'observacao_item'
    ],

    DIVERGENCIAS: [
      'divergencia_id',
      'unidade_id',
      'coleta_id',
      'reversa_id',
      'etiqueta_id',
      'usuario_id',
      'tipo_divergencia',
      'descricao_divergencia',
      'status_divergencia',
      'responsavel_tratativa',
      'data_abertura',
      'data_fechamento',
      'coletador_id',
      'decisao_operacional',
      'foto_url',
      'data_hora_registro_campo'
    ],

    EVENTOS: [
      'evento_id',
      'tipo_entidade',
      'entidade_id',
      'unidade_id',
      'usuario_id',
      'reversa_id',
      'etiqueta_id',
      'coleta_id',
      'tipo_evento',
      'origem_evento',
      'descricao_evento',
      'ator_tipo',
      'ator_id',
      'data_hora_evento'
    ],

    VW_UNIDADES_STATUS: [
      'unidade_id',
      'nome_unidade',
      'status_unidade',
      'prazo_coleta_dias_uteis',
      'capacidade_max_pacotes',
      'pacotes_pendentes',
      'ocupacao_pct',
      'status_ocupacao',
      'etiquetas_disponiveis',
      'etiquetas_lidas_nao_confirmadas',
      'reversas_aguardando_coleta',
      'ultima_coleta',
      'proxima_janela_disponivel'
    ],

    VW_DASHBOARD: [
      'data_ref',
      'reversas_criadas',
      'dropoffs_confirmados',
      'reversas_aguardando_coleta',
      'reversas_coletadas',
      'reversas_postadas',
      'unidades_em_alerta',
      'etiquetas_disponiveis',
      'etiquetas_lidas_nao_confirmadas',
      'divergencias_abertas'
    ]
  };
}

/** =========================
 * CRIA OU GARANTE ABA
 * ========================= */
function upsertSheetWithHeaders_(ss, sheetName, headers) {
  let sheet = ss.getSheetByName(sheetName);

  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
  }

  ensureMinimumColumns_(sheet, headers.length);

  const existingHeader = sheet.getRange(1, 1, 1, headers.length).getValues()[0];
  const hasAnyHeaderValue = existingHeader.some(v => String(v || '').trim() !== '');

  if (!hasAnyHeaderValue) {
    writeHeaders_(sheet, headers);
  }

  styleHeader_(sheet, headers.length);
  applyColumnWidths_(sheet, headers);
  sheet.setFrozenRows(REVERSA_CFG.FROZEN_ROWS);
}

/** =========================
 * ESCREVE CABEÇALHOS
 * ========================= */
function writeHeaders_(sheet, headers) {
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
}

/** =========================
 * GARANTE NÚMERO MÍNIMO DE COLUNAS
 * ========================= */
function ensureMinimumColumns_(sheet, neededColumns) {
  const currentColumns = sheet.getMaxColumns();
  if (currentColumns < neededColumns) {
    sheet.insertColumnsAfter(currentColumns, neededColumns - currentColumns);
  }
}

/** =========================
 * FORMATA CABEÇALHO
 * ========================= */
function styleHeader_(sheet, numberOfColumns) {
  const range = sheet.getRange(1, 1, 1, numberOfColumns);
  range
    .setBackground(REVERSA_CFG.HEADER_BG)
    .setFontColor(REVERSA_CFG.HEADER_FONT_COLOR)
    .setFontWeight('bold')
    .setHorizontalAlignment('center')
    .setVerticalAlignment('middle')
    .setWrap(true);
}

/** =========================
 * AJUSTA LARGURA DAS COLUNAS
 * ========================= */
function applyColumnWidths_(sheet, headers) {
  headers.forEach((header, index) => {
    const col = index + 1;
    const width = getColumnWidthByHeader_(header);
    sheet.setColumnWidth(col, width);
  });
}

/** =========================
 * HEURÍSTICA DE LARGURA
 * ========================= */
function getColumnWidthByHeader_(header) {
  const h = String(header || '').toLowerCase();

  if (
    h.includes('id') ||
    h.includes('cpf') ||
    h.includes('cep') ||
    h.includes('uf') ||
    h.includes('qtde') ||
    h.includes('pct')
  ) {
    return REVERSA_CFG.NARROW_COLUMN_WIDTH;
  }

  if (
    h.includes('mensagem') ||
    h.includes('descricao') ||
    h.includes('observacao') ||
    h.includes('endereco') ||
    h.includes('alerta')
  ) {
    return REVERSA_CFG.WIDE_COLUMN_WIDTH;
  }

  return REVERSA_CFG.DEFAULT_COLUMN_WIDTH;
}