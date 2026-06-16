/***************************************
 * REVERSA - ETAPA 7
 * Usabilidade da planilha
 * Destaca em amarelo claro células que podem
 * ser alteradas manualmente com segurança.
 ***************************************/

const REVERSA_EDITABLE_BG = '#FFF9DB';
const REVERSA_SYSTEM_BG = '#FFFFFF';

function applyEditableCellsHighlight() {
  const ss = getReversaSpreadsheet_();
  applyEditableCellsHighlight_(ss);
  SpreadsheetApp.flush();
  SpreadsheetApp.getUi().alert('Campos editáveis destacados em amarelo claro.');
}

function applyEditableCellsHighlight_(ss) {
  const editable = {
    PARAMETROS: ['valor', 'descricao', 'escopo', 'status_parametro'],
    AUX_LISTAS: ['lista', 'valor', 'ordem', 'ativo'],
    UNIDADES: [
      'codigo_unidade','slug_unidade','nome_unidade','tipo_unidade','status_unidade',
      'endereco','numero','complemento','bairro','cidade','uf','cep','latitude','longitude',
      'prazo_coleta_dias_uteis','capacidade_max_pacotes','capacidade_max_volume_litros',
      'nivel_alerta_ocupacao_pct','email_suporte','telefone_suporte','mensagem_usuario','logo_unidade_url','coletador_padrao_id'
    ],
    USUARIOS: ['nome','cpf','sala_apto_empresa','telefone','email','status_usuario','observacao_interna'],
    LOTES_ETIQUETAS: ['data_abastecimento','observacao'],
    ETIQUETAS: ['observacao'],
    REVERSAS: ['observacao_usuario','codigo_sro'],
    COLETAS: ['data_coleta_programada','coletador_id','coletador_id_atual','observacao_coleta','origem_coleta','data_limite_operacional','motivo_transferencia'],
    COLETA_ITENS: ['observacao_item'],
    DIVERGENCIAS: ['descricao_divergencia','status_divergencia','responsavel_tratativa','data_fechamento','coletador_id','decisao_operacional','foto_url','data_hora_registro_campo']
  };

  Object.keys(editable).forEach(sheetName => {
    const sheet = ss.getSheetByName(sheetName);
    if (!sheet) return;
    const headers = getHeaders_(sheet);
    const map = headerMap_(headers);
    const dataRows = Math.max(sheet.getMaxRows() - 1, 1);

    // Primeiro limpa apenas a área de dados. Cabeçalhos permanecem intactos.
    if (headers.length) sheet.getRange(2, 1, dataRows, headers.length).setBackground(REVERSA_SYSTEM_BG);

    editable[sheetName].forEach(header => {
      if (map[header] === undefined) return;
      sheet.getRange(2, map[header] + 1, dataRows, 1).setBackground(REVERSA_EDITABLE_BG);
    });
  });
}


/** =========================
 * MIGRAÇÃO VISUAL V1.3.3
 * Executar uma vez após o clasp push.
 * Reaplica o destaque amarelo sem alterar dados.
 * ========================= */
function migrateReversaV133() {
  const ss = getReversaSpreadsheet_();
  applyEditableCellsHighlight_(ss);
  SpreadsheetApp.flush();
  SpreadsheetApp.getUi().alert('Atualização visual v1.3.3 aplicada: campos editáveis destacados em amarelo claro.');
}
