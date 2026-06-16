/***************************************
 * REVERSA - ETAPA 9
 * Massa demonstrativa do App Coletas V1.4.2
 * Uso opcional: cria dados visuais para homologação.
 ***************************************/

const REVERSA_DEMO_TAG = '[DEMO-COLETA-V142]';

function seedReversaColetaDemoData() {
  const ui = SpreadsheetApp.getUi();
  const response = ui.prompt(
    'Popular dados demonstrativos do App Coletas',
    'Informe o coletador_id que deverá visualizar os exemplos no Histórico e na aba Ativa. Use o mesmo login do Portal AGF, por exemplo: rachel',
    ui.ButtonSet.OK_CANCEL
  );
  if (response.getSelectedButton() !== ui.Button.OK) return;
  const coletadorId = String(response.getResponseText() || '').trim();
  if (!coletadorId) {
    ui.alert('Informe um coletador_id válido.');
    return;
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const ss = getReversaSpreadsheet_();
    ensureColetaSchema_(ss);
    const coletasSheet = getSheet_(ss, REVERSA_CORE_CFG.SHEETS.COLETAS);
    const existing = getDataRowsAsObjects_(coletasSheet).some(row => String(row.observacao_coleta || '').includes('[DEMO-COLETA-'));
    if (existing) {
      ui.alert('Os dados demonstrativos V1.4.2 já existem. Nenhuma linha foi duplicada.');
      return;
    }

    const scenarios = [
      { unit: 1, status: 'aberta', origin: 'automatica_unidade', deadlineOffset: -1, scanned: 0, total: 3, title: 'Automática vencida' },
      { unit: 2, status: 'aberta', origin: 'manual_admin', deadlineOffset: 3, scanned: 0, total: 4, title: 'Manual programada' },
      { unit: 3, status: 'em_andamento', origin: 'automatica_unidade', deadlineOffset: 0, scanned: 1, total: 3, title: 'Ativa para hoje' },
      { unit: 4, status: 'em_andamento', origin: 'espontanea_coletador', deadlineOffset: 1, scanned: 2, total: 4, title: 'Ativa com folga curta' },
      { unit: 5, status: 'concluida', origin: 'manual_admin', deadlineOffset: -2, scanned: 3, total: 3, title: 'Concluída regular' },
      { unit: 6, status: 'concluida', origin: 'automatica_unidade', deadlineOffset: -1, scanned: 2, total: 2, title: 'Concluída automática' },
      { unit: 7, status: 'concluida_com_divergencia', origin: 'manual_admin', deadlineOffset: -3, scanned: 2, total: 3, title: 'Concluída com objeto ausente', divergence: 'pacote_ausente' },
      { unit: 8, status: 'concluida_com_divergencia', origin: 'espontanea_coletador', deadlineOffset: -1, scanned: 2, total: 2, title: 'Concluída com objeto danificado', divergence: 'pacote_danificado' }
    ];

    scenarios.forEach((scenario) => seedDemoScenario_(ss, scenario, coletadorId));
    applyEditableCellsHighlight_(ss);
    SpreadsheetApp.flush();
    ui.alert('Dados demonstrativos criados com sucesso. Atualize /reverso-coleta/ com Ctrl + F5.');
  } finally {
    lock.releaseLock();
  }
}

function seedDemoScenario_(ss, scenario, coletadorId) {
  const unidade = ensureDemoUnit_(ss, scenario.unit);
  ensureDemoUnitCollector_(ss, unidade, coletadorId);
  const usuario = ensureDemoUsuario_(ss, unidade, scenario.unit);
  const deadline = demoBusinessDate_(scenario.deadlineOffset);
  const now = now_();
  const coletaSheet = getSheet_(ss, REVERSA_CORE_CFG.SHEETS.COLETAS);
  const coletaHeaders = getHeaders_(coletaSheet);
  const coletaId = nextIdForSheet_(coletaSheet, 'coleta_id', REVERSA_CORE_CFG.ID_PREFIX.COLETA, REVERSA_CORE_CFG.PAD_LENGTH.COLETA);

  const coleta = blankRowObject_(coletaHeaders);
  Object.assign(coleta, {
    coleta_id: coletaId,
    unidade_id: unidade.unidade_id,
    data_coleta_programada: deadline,
    data_inicio_coleta: scenario.status === 'aberta' ? '' : demoDateMinutesAgo_(scenario.status === 'em_andamento' ? 40 : 180),
    data_fim_coleta: REVERSA_COLETA_DONE_STATUS.includes(scenario.status) ? demoDateMinutesAgo_(120) : '',
    coletador_id: coletadorId,
    coletador_id_original: coletadorId,
    coletador_id_atual: coletadorId,
    data_transferencia: '', motivo_transferencia: '', transferido_por: '',
    qtde_prevista: scenario.total,
    qtde_coletada: scenario.scanned,
    status_coleta: scenario.status,
    observacao_coleta: `${REVERSA_DEMO_TAG} ${scenario.title}`,
    data_criacao: demoDateMinutesAgo_(240),
    origem_coleta: scenario.origin,
    data_limite_operacional: deadline,
    data_atualizacao: now
  });
  appendObjectRow_(coletaSheet, coletaHeaders, coleta);

  for (let index = 0; index < scenario.total; index++) {
    const wasScanned = index < scenario.scanned;
    const item = seedDemoObject_(ss, unidade, usuario, coletaId, scenario, index + 1, wasScanned);
    if (wasScanned) seedDemoCollectionItem_(ss, coletaId, unidade, usuario, item, coletadorId, index);
  }

  if (scenario.divergence) seedDemoDivergence_(ss, coletaId, unidade, coletadorId, scenario.divergence, scenario.title);
}

function ensureDemoUnit_(ss, number) {
  const sheet = getSheet_(ss, REVERSA_CORE_CFG.SHEETS.UNIDADES);
  const headers = getHeaders_(sheet);
  const slug = `demo-coleta-${String(number).padStart(2, '0')}`;
  const existing = getDataRowsAsObjects_(sheet).find(row => String(row.slug_unidade || '') === slug);
  if (existing) return existing;
  const id = nextIdForSheet_(sheet, 'unidade_id', REVERSA_CORE_CFG.ID_PREFIX.UNIDADE, REVERSA_CORE_CFG.PAD_LENGTH.UNIDADE);
  const row = blankRowObject_(headers);
  Object.assign(row, {
    unidade_id: id,
    codigo_unidade: `DEMO${String(number).padStart(2, '0')}`,
    slug_unidade: slug,
    nome_unidade: `Unidade Demo ${String(number).padStart(2, '0')}`,
    tipo_unidade: number % 2 ? 'edificio_comercial' : 'condominio_residencial',
    status_unidade: 'ativa',
    endereco: number % 2 ? 'Avenida Santos Dumont' : 'Avenida Beira Mar',
    numero: String(1000 + number * 50),
    complemento: '',
    bairro: number % 2 ? 'Aldeota' : 'Meireles',
    cidade: 'Fortaleza',
    uf: 'CE',
    cep: number % 2 ? '60150162' : '60165121',
    latitude: '', longitude: '',
    prazo_coleta_dias_uteis: 2,
    capacidade_max_pacotes: 30,
    capacidade_max_volume_litros: '',
    nivel_alerta_ocupacao_pct: 80,
    email_suporte: '', telefone_suporte: '',
    mensagem_usuario: 'Unidade demonstrativa para homologação visual.',
    qr_url_unidade: `https://www.minhaagenciaonline.com.br/reverso/?slug=${slug}`,
    data_criacao: now_(), data_atualizacao: now_(), coletador_padrao_id: ''
  });
  row.coletador_padrao_id = row.coletador_padrao_id || '';
  appendObjectRow_(sheet, headers, row);
  return row;
}

function ensureDemoUsuario_(ss, unidade, number) {
  const sheet = getSheet_(ss, REVERSA_CORE_CFG.SHEETS.USUARIOS);
  const headers = getHeaders_(sheet);
  const cpf = `90000000${String(number).padStart(3, '0')}`;
  const existing = getDataRowsAsObjects_(sheet).find(row => String(row.cpf || '') === cpf && String(row.unidade_id || '') === String(unidade.unidade_id));
  if (existing) return existing;
  const id = nextIdForSheet_(sheet, 'usuario_id', REVERSA_CORE_CFG.ID_PREFIX.USUARIO, REVERSA_CORE_CFG.PAD_LENGTH.USUARIO);
  const row = blankRowObject_(headers);
  Object.assign(row, { usuario_id:id, unidade_id:unidade.unidade_id, nome:`Usuário Demo ${String(number).padStart(2, '0')}`, cpf, sala_apto_empresa:`Sala ${100 + number}`, telefone:`8590000${String(number).padStart(4, '0')}`, email:`demo.coleta${number}@example.com`, status_usuario:'ativo', aceite_termos:'SIM', data_aceite_termos:now_(), origem_cadastro:'demo_v142', data_cadastro:now_(), data_ultimo_acesso:'', observacao_interna:REVERSA_DEMO_TAG });
  appendObjectRow_(sheet, headers, row);
  return row;
}

function seedDemoObject_(ss, unidade, usuario, coletaId, scenario, sequence, wasScanned) {
  const etiquetasSheet = getSheet_(ss, REVERSA_CORE_CFG.SHEETS.ETIQUETAS);
  const reversasSheet = getSheet_(ss, REVERSA_CORE_CFG.SHEETS.REVERSAS);
  const etiquetaHeaders = getHeaders_(etiquetasSheet);
  const reversaHeaders = getHeaders_(reversasSheet);
  const etiquetaId = nextIdForSheet_(etiquetasSheet, 'etiqueta_id', REVERSA_CORE_CFG.ID_PREFIX.ETIQUETA, REVERSA_CORE_CFG.PAD_LENGTH.ETIQUETA);
  const reversaId = nextIdForSheet_(reversasSheet, 'reversa_id', REVERSA_CORE_CFG.ID_PREFIX.REVERSA, REVERSA_CORE_CFG.PAD_LENGTH.REVERSA);
  const code = `DEMO-${unidade.codigo_unidade}-${String(sequence).padStart(3, '0')}-${String(Date.now()).slice(-4)}`;
  const etiqueta = blankRowObject_(etiquetaHeaders);
  Object.assign(etiqueta, { etiqueta_id:etiquetaId, lote_id:'DEMO-V141', unidade_id:unidade.unidade_id, codigo_etiqueta:code, codigo_manual_curto:code, qr_url_etiqueta:`https://www.minhaagenciaonline.com.br/reverso/?slug=${unidade.slug_unidade}&etiqueta=${encodeURIComponent(code)}`, status_etiqueta:wasScanned?'coletada':'confirmada_dropoff', usuario_id:usuario.usuario_id, reversa_id:reversaId, data_geracao:now_(), data_leitura:now_(), data_confirmacao_dropoff:now_(), data_coleta:wasScanned?demoDateMinutesAgo_(30):'', data_conclusao:'', origem_leitura:'demo_v142', observacao:REVERSA_DEMO_TAG });
  appendObjectRow_(etiquetasSheet, etiquetaHeaders, etiqueta);
  const reversa = blankRowObject_(reversaHeaders);
  Object.assign(reversa, { reversa_id:reversaId, unidade_id:unidade.unidade_id, usuario_id:usuario.usuario_id, etiqueta_id:etiquetaId, codigo_autorizacao:`DEMO-AUT-${reversaId}`, codigo_autorizacao_normalizado:`DEMOAUT${reversaId}`, tipo_validacao_codigo:'padrao_reconhecido', alerta_codigo:'', janela_coleta:'ate_2_dias_uteis', data_limite_operacional:scenario.deadlineOffset === undefined?'':demoBusinessDate_(scenario.deadlineOffset), comprimento_cm:20, largura_cm:15, altura_cm:10, volume_litros_estimado:3, status_reversa:wasScanned?'coletada_agf':'dropoff_realizado', observacao_usuario:REVERSA_DEMO_TAG, data_criacao:demoDateMinutesAgo_(360), data_confirmacao_dropoff:demoDateMinutesAgo_(350), data_coleta_agf:wasScanned?demoDateMinutesAgo_(30):'', data_recebimento_agencia:'', data_postagem:'', data_conclusao:'' });
  appendObjectRow_(reversasSheet, reversaHeaders, reversa);
  return { etiqueta_id:etiquetaId, reversa_id:reversaId };
}

function seedDemoCollectionItem_(ss, coletaId, unidade, usuario, objectRef, coletadorId, index) {
  const sheet = getSheet_(ss, REVERSA_CORE_CFG.SHEETS.COLETA_ITENS);
  const headers = getHeaders_(sheet);
  const id = nextIdForSheet_(sheet, 'coleta_item_id', REVERSA_CORE_CFG.ID_PREFIX.COLETA_ITEM, REVERSA_CORE_CFG.PAD_LENGTH.COLETA_ITEM);
  const row = blankRowObject_(headers);
  Object.assign(row, { coleta_item_id:id, coleta_id:coletaId, reversa_id:objectRef.reversa_id, etiqueta_id:objectRef.etiqueta_id, unidade_id:unidade.unidade_id, usuario_id:usuario.usuario_id, data_hora_leitura_coletador:demoDateMinutesAgo_(25 - index), status_item_coleta:'confirmado', divergencia_id:'', observacao_item:REVERSA_DEMO_TAG });
  appendObjectRow_(sheet, headers, row);
}

function seedDemoDivergence_(ss, coletaId, unidade, coletadorId, type, title) {
  appendDivergenceRecord_({ unidade_id:unidade.unidade_id, coleta_id:coletaId, tipo_divergencia:type, descricao_divergencia:`${REVERSA_DEMO_TAG} ${title}`, status_divergencia:'aberta', responsavel_tratativa:coletadorId, coletador_id:coletadorId, decisao_operacional:'deixar_no_local', origem_evento:'demo_v142' });
}

function demoBusinessDate_(offset) {
  const date = new Date(); date.setHours(12, 0, 0, 0);
  const direction = offset >= 0 ? 1 : -1; let remaining = Math.abs(Number(offset || 0));
  while (remaining > 0) { date.setDate(date.getDate() + direction); if (date.getDay() !== 0 && date.getDay() !== 6) remaining--; }
  return date;
}
function demoDateMinutesAgo_(minutes) { const date = new Date(); date.setMinutes(date.getMinutes() - Number(minutes || 0)); return date; }

function ensureDemoUnitCollector_(ss, unidade, coletadorId) {
  if (String(unidade.coletador_padrao_id || '') === String(coletadorId || '')) return;
  const sheet=getSheet_(ss,REVERSA_CORE_CFG.SHEETS.UNIDADES); const headers=getHeaders_(sheet);
  updateRowFieldsByIndex_(sheet,headers,findRowIndexByValue_(sheet,'unidade_id',unidade.unidade_id),{coletador_padrao_id:coletadorId,data_atualizacao:now_()});
  unidade.coletador_padrao_id=coletadorId;
}
