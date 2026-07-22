/**
 * 17_CRM_LISTAS_E_LIMPEZA.gs
 * ------------------------------------------------------------
 * Dicionario oficial de valores + sincronia planilha->front + limpeza.
 *
 * POR QUE ESTE ARQUIVO EXISTE
 * Os campos POTENCIAL, PRIORIDADE, STATUS_PROSPECT e ORIGEM_LEAD nunca
 * tiveram uma lista oficial. Sem ela, o front montava cada dropdown
 * somando (a) os valores achados nos dados e (b) uma lista fixa escrita
 * dentro do JavaScript. Resultado: "Media" e "Medio" apareciam juntos, e
 * cada escolha na lista fixa criava uma variante nova nos dados. Era uma
 * maquina de acumular lixo.
 *
 * O QUE ESTE ARQUIVO ENTREGA
 * 1. Aba CRM_LISTAS: a lista oficial de cada campo (mesmo padrao que ja
 *    funciona em CRM_FUNIL_ETAPAS: codigo + nome de exibicao).
 * 2. Dropdowns nativos na aba PROSPECTS, alimentados por essa aba.
 * 3. Gatilho onChange: editar a planilha passa a refletir no front
 *    sozinho (antes so aparecia quando o cache de 30 min vencia).
 * 4. Limpeza dos prospects: normaliza vocabulario, devolve todo mundo
 *    para a etapa inicial e padroniza o responsavel.
 *
 * COMO USAR (uma vez, no editor do Apps Script)
 *   1. Executar > crm6_setupCompleto        (cria aba, dropdowns, gatilho)
 *   2. Executar > crm6_limparProspectsTeste (relatorio, NAO grava nada)
 *   3. conferir o log
 *   4. Executar > crm6_limparProspectsAplicar (grava)
 *
 * SEGURANCA: toda funcao que grava tem modo teste. Nada e apagado sem
 * relatorio previo.
 */

var CRM6_CFG = {
  VERSION: '6.0.0',
  SHEETS: {
    LISTAS: 'CRM_LISTAS',
    PROSPECTS: 'PROSPECTS',
    TRATATIVAS: 'CRM_TRATATIVAS',
    RESPONSAVEIS: 'CRM_RESPONSAVEIS'
  },
  ETAPA_INICIAL: 'P_NOVO',
  FUNIL_PROSPECTS: 'FUNIL_PROSPECTS',
  STATUS_TRATATIVA_ABERTA: 'ABERTA',
  // Responsavel padrao da base (Manu). O ID e resolvido em CRM_RESPONSAVEIS
  // pelo username; o valor abaixo e so o fallback se a busca falhar.
  RESPONSAVEL_PADRAO_USERNAME: 'manu',
  RESPONSAVEL_PADRAO_FALLBACK: { id: 'RSP_EBCBD7ACB25D', nome: 'Manu' },
  // Abas cujas edicoes manuais devem refletir no front (gatilho onChange)
  ABAS_SINCRONIZADAS: {
    'PROSPECTS': 1, 'CLIENTES_CADASTRO': 1, 'CRM_TRATATIVAS': 1,
    'AGENDA_EXECUCAO': 1, 'CRM_INTERACOES': 1, 'BASE_TOTAL': 1
  },
  ABAS_CONFIG: {
    'CRM_LISTAS': 1, 'CRM_FUNIS': 1, 'CRM_FUNIL_ETAPAS': 1, 'CRM_RESPONSAVEIS': 1,
    'CRM_TIPOS_ATIVIDADE': 1, 'CRM_RESULTADOS_ATIVIDADE': 1, 'CRM_SEGMENTOS': 1,
    'CRM_LOCAIS': 1, 'MIDIAS_CRM': 1, 'AGENDA_BLOCOS': 1
  }
};

/* ==================== 1. O DICIONARIO OFICIAL ==================== */
/**
 * Estrutura de cada item: [LISTA, CODIGO, NOME_EXIBICAO, ORDEM]
 * CODIGO      = o que fica gravado na celula da aba PROSPECTS
 * NOME_EXIBICAO = o que o front mostra ao usuario
 *
 * Onde codigo e nome sao iguais, e de proposito: sao vocabularios curtos
 * e estaveis, e assim a planilha fica legivel para quem edita a mao.
 * PRIORIDADE e a excecao: guarda P1/P2/P3 e exibe o rotulo com o
 * significado, para o dado nunca depender do texto do rotulo.
 */
var CRM6_LISTAS_PADRAO = [
  // POTENCIAL - tamanho da oportunidade (quanto o prospect pode gerar)
  ['POTENCIAL', 'Alto', 'Alto', 1],
  ['POTENCIAL', 'Médio', 'Médio', 2],
  ['POTENCIAL', 'Baixo', 'Baixo', 3],
  ['POTENCIAL', 'A avaliar', 'A avaliar', 4],

  // PRIORIDADE - ordem de ataque (quem trabalhar primeiro)
  ['PRIORIDADE', 'P1', 'P1 - alta', 1],
  ['PRIORIDADE', 'P2', 'P2 - média', 2],
  ['PRIORIDADE', 'P3', 'P3 - baixa', 3],

  // ORIGEM_LEAD - de onde o lead veio (canal comercial, nao metodo de cadastro)
  ['ORIGEM_LEAD', 'Prospecção ativa', 'Prospecção ativa', 1],
  ['ORIGEM_LEAD', 'Indicação', 'Indicação', 2],
  ['ORIGEM_LEAD', 'WhatsApp', 'WhatsApp', 3],
  ['ORIGEM_LEAD', 'Instagram', 'Instagram', 4],
  ['ORIGEM_LEAD', 'Google/Busca', 'Google/Busca', 5],
  ['ORIGEM_LEAD', 'Cliente ativo', 'Cliente ativo', 6],
  ['ORIGEM_LEAD', 'Parceria', 'Parceria', 7],
  ['ORIGEM_LEAD', 'Outro', 'Outro', 8],

  // STATUS_PROSPECT - situacao OPERACIONAL do atendimento.
  // ATENCAO: nao confundir com ETAPA_FUNIL (posicao no kanban). Os tres
  // valores em maiusculo abaixo sao gravados automaticamente pelo motor
  // de ciclo de vida (15_LIFECYCLE_ENGINE) e por isso ficam na lista.
  ['STATUS_PROSPECT', 'NOVO', 'Novo', 1],
  ['STATUS_PROSPECT', 'EM ANDAMENTO', 'Em andamento', 2],
  ['STATUS_PROSPECT', 'TENTATIVA S/ CONTATO', 'Tentativa sem contato', 3],
  ['STATUS_PROSPECT', 'REAGENDADO', 'Reagendado', 4],
  ['STATUS_PROSPECT', 'VISITA CANCELADA', 'Visita cancelada', 5],
  ['STATUS_PROSPECT', 'SEM INTERESSE', 'Sem interesse', 6]
];

var CRM6_LISTAS_HEADERS = ['LISTA', 'CODIGO', 'NOME_EXIBICAO', 'ORDEM', 'ATIVO'];

/**
 * Cria (ou completa) a aba CRM_LISTAS com o dicionario padrao.
 * Nao sobrescreve linhas que ja existem: se voce editar um nome de
 * exibicao na planilha, a edicao e preservada.
 */
function crm6_setupListas() {
  var ss = crm6_ss_();
  var sh = ss.getSheetByName(CRM6_CFG.SHEETS.LISTAS);
  if (!sh) {
    sh = ss.insertSheet(CRM6_CFG.SHEETS.LISTAS);
    sh.getRange(1, 1, 1, CRM6_LISTAS_HEADERS.length).setValues([CRM6_LISTAS_HEADERS]);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, CRM6_LISTAS_HEADERS.length).setFontWeight('bold');
  }
  var vals = sh.getDataRange().getValues();
  var hm = crm6_headerMap_(vals[0]);
  // chaves ja presentes (LISTA|CODIGO), para nao duplicar
  var existentes = {};
  for (var i = 1; i < vals.length; i++) {
    var k = crm6_txt_(vals[i][hm['LISTA']]) + '|' + crm6_txt_(vals[i][hm['CODIGO']]);
    if (k !== '|') existentes[k] = true;
  }
  var novas = [];
  CRM6_LISTAS_PADRAO.forEach(function (item) {
    var k = item[0] + '|' + item[1];
    if (existentes[k]) return;
    novas.push([item[0], item[1], item[2], item[3], 'SIM']);
  });
  if (novas.length) sh.getRange(sh.getLastRow() + 1, 1, novas.length, CRM6_LISTAS_HEADERS.length).setValues(novas);
  sh.autoResizeColumns(1, CRM6_LISTAS_HEADERS.length);
  crm6_invalidarConfig_();
  var res = { ok: true, aba: CRM6_CFG.SHEETS.LISTAS, adicionadas: novas.length, jaExistiam: Object.keys(existentes).length };
  Logger.log(JSON.stringify(res));
  return res;
}

/**
 * Le uma lista da aba CRM_LISTAS, ja ordenada e so com itens ativos.
 * Devolve [{codigo, nome, ordem}]. Se a aba nao existir, devolve o
 * padrao embutido (para o sistema nunca ficar sem dropdown).
 */
function crm6_lerLista_(nomeLista) {
  var ss = crm6_ss_();
  var sh = ss.getSheetByName(CRM6_CFG.SHEETS.LISTAS);
  var out = [];
  if (sh && sh.getLastRow() > 1) {
    var vals = sh.getDataRange().getValues();
    var hm = crm6_headerMap_(vals[0]);
    for (var i = 1; i < vals.length; i++) {
      var r = vals[i];
      if (crm6_txt_(r[hm['LISTA']]).toUpperCase() !== String(nomeLista).toUpperCase()) continue;
      var ativo = hm['ATIVO'] === undefined ? 'SIM' : crm6_txt_(r[hm['ATIVO']]).toUpperCase();
      if (ativo === 'NAO' || ativo === 'NÃO' || ativo === 'FALSE') continue;
      var cod = crm6_txt_(r[hm['CODIGO']]);
      if (!cod) continue;
      out.push({ codigo: cod, nome: crm6_txt_(r[hm['NOME_EXIBICAO']]) || cod, ordem: Number(r[hm['ORDEM']]) || 0 });
    }
  }
  if (!out.length) {
    CRM6_LISTAS_PADRAO.forEach(function (it) {
      if (String(it[0]).toUpperCase() === String(nomeLista).toUpperCase()) out.push({ codigo: it[1], nome: it[2], ordem: it[3] });
    });
  }
  out.sort(function (a, b) { return a.ordem - b.ordem; });
  return out;
}

/** Usado pelo backend para servir as listas ao front (crm3_apiGetConfig_). */
function crm6_listasParaConfig_() {
  return {
    prospectPotenciais: crm6_lerLista_('POTENCIAL'),
    prospectPrioridades: crm6_lerLista_('PRIORIDADE'),
    prospectOrigens: crm6_lerLista_('ORIGEM_LEAD'),
    prospectStatus: crm6_lerLista_('STATUS_PROSPECT')
  };
}

/* ==================== 2. DROPDOWNS NA PLANILHA ==================== */
/**
 * Aplica validacao de dados (dropdown nativo) nas colunas da aba
 * PROSPECTS. O usuario passa a escolher de uma lista em vez de digitar,
 * o que impede novas variantes de entrarem na base.
 */
function crm6_aplicarValidacoes() {
  var ss = crm6_ss_();
  var sh = ss.getSheetByName(CRM6_CFG.SHEETS.PROSPECTS);
  if (!sh) throw new Error('Aba PROSPECTS nao encontrada.');
  var hm = crm6_headerMap_(sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0]);
  var maxRows = Math.max(sh.getMaxRows() - 1, 1);
  var aplicadas = [];

  ['POTENCIAL', 'PRIORIDADE', 'ORIGEM_LEAD', 'STATUS_PROSPECT'].forEach(function (campo) {
    var col = hm[campo];
    if (col === undefined) return;
    var itens = crm6_lerLista_(campo).map(function (x) { return x.codigo; });
    if (!itens.length) return;
    var rule = SpreadsheetApp.newDataValidation()
      .requireValueInList(itens, true)
      .setAllowInvalid(false)
      .setHelpText('Escolha um valor da lista oficial (aba CRM_LISTAS).')
      .build();
    sh.getRange(2, col + 1, maxRows, 1).setDataValidation(rule);
    aplicadas.push({ campo: campo, coluna: col + 1, opcoes: itens.length });
  });

  var res = { ok: true, validacoes: aplicadas };
  Logger.log(JSON.stringify(res, null, 2));
  return res;
}

/* ==================== 3. SINCRONIA PLANILHA -> FRONT ==================== */
/**
 * Handler do gatilho onChange. Sempre que a planilha muda (edicao manual,
 * colagem, insercao/remocao de linhas), avisa o cache para que o front
 * leia dados frescos no proximo carregamento.
 *
 * Isto e o que faltava para a sincronia nos dois sentidos: o front sempre
 * leu a planilha de verdade, mas atraves de um cache de 30 minutos que
 * ninguem avisava quando a edicao vinha da propria planilha.
 */
function crm6_onChangeCrm(e) {
  try {
    var tipo = e && e.changeType ? String(e.changeType) : '';
    // mudancas que nao alteram dados
    if (tipo === 'FORMAT' || tipo === 'OTHER') return;
    var nome = '';
    try { nome = SpreadsheetApp.getActiveSheet().getName(); } catch (e1) { nome = ''; }
    if (nome && CRM6_CFG.ABAS_CONFIG[nome]) { crm6_invalidarConfig_(); return; }
    if (nome && !CRM6_CFG.ABAS_SINCRONIZADAS[nome]) return; // aba irrelevante
    crm6_invalidarDados_();
  } catch (err) {
    Logger.log('[CRM6] onChange falhou: ' + err);
  }
}

/**
 * Instala os gatilhos necessarios (idempotente: nao duplica).
 */
function crm6_instalarGatilhos() {
  var ss = crm6_ss_();
  var existentes = {};
  ScriptApp.getProjectTriggers().forEach(function (t) { existentes[t.getHandlerFunction()] = true; });
  var criados = [];
  if (!existentes.crm6_onChangeCrm) {
    ScriptApp.newTrigger('crm6_onChangeCrm').forSpreadsheet(ss).onChange().create();
    criados.push('crm6_onChangeCrm (onChange)');
  }
  var res = { ok: true, criados: criados, jaExistiam: Object.keys(existentes) };
  Logger.log(JSON.stringify(res, null, 2));
  return res;
}

/* ==================== 4. LIMPEZA DOS PROSPECTS ==================== */
/**
 * Deixa a aba PROSPECTS "pronta para comecar":
 *  - ETAPA_FUNIL   -> P_NOVO (codigo canonico, nao mais o nome de exibicao)
 *  - tratativas    -> todas de volta para P_NOVO e status ABERTA
 *  - RESPONSAVEL   -> Manu (nome) + RESPONSAVEL_ID (codigo)
 *  - POTENCIAL     -> Alta/Media/Baixa viram Alto/Medio/Baixo; vazio vira "A avaliar"
 *  - PRIORIDADE    -> normaliza para P1/P2/P3 (vazio vira P2)
 *  - ORIGEM_LEAD   -> PLANILHA_LOTE / VISITA_EM_CAMPO viram "Prospecção ativa"
 *  - STATUS_PROSPECT -> NOVO (vocabulario operacional oficial)
 *
 * Modo teste por padrao. Para gravar: crm6_limparProspectsAplicar().
 */
function crm6_limparProspects_(opts) {
  opts = opts || {};
  var aplicar = opts.aplicar === true;
  var ss = crm6_ss_();
  var sh = ss.getSheetByName(CRM6_CFG.SHEETS.PROSPECTS);
  if (!sh) throw new Error('Aba PROSPECTS nao encontrada.');

  var resp = crm6_responsavelPadrao_();
  var vals = sh.getDataRange().getValues();
  var hm = crm6_headerMap_(vals[0]);
  var need = ['PROSPECT_ID', 'ETAPA_FUNIL', 'POTENCIAL', 'PRIORIDADE', 'ORIGEM_LEAD', 'STATUS_PROSPECT', 'RESPONSAVEL', 'RESPONSAVEL_ID'];
  need.forEach(function (h) { if (hm[h] === undefined) throw new Error('Coluna ausente na aba PROSPECTS: ' + h); });

  var rel = { total: 0, alterados: 0, porCampo: {}, exemplos: [] };
  function conta_(campo) { rel.porCampo[campo] = (rel.porCampo[campo] || 0) + 1; }

  for (var i = 1; i < vals.length; i++) {
    var r = vals[i];
    var pid = crm6_txt_(r[hm['PROSPECT_ID']]);
    if (!pid) continue;
    rel.total++;
    var mudou = [];

    // ETAPA_FUNIL -> codigo canonico da etapa inicial
    if (crm6_txt_(r[hm['ETAPA_FUNIL']]) !== CRM6_CFG.ETAPA_INICIAL) {
      mudou.push('ETAPA_FUNIL'); conta_('ETAPA_FUNIL');
      r[hm['ETAPA_FUNIL']] = CRM6_CFG.ETAPA_INICIAL;
    }
    // POTENCIAL
    var pot = crm6_normPotencial_(crm6_txt_(r[hm['POTENCIAL']]));
    if (pot !== crm6_txt_(r[hm['POTENCIAL']])) { mudou.push('POTENCIAL'); conta_('POTENCIAL'); r[hm['POTENCIAL']] = pot; }
    // PRIORIDADE
    var pri = crm6_normPrioridade_(crm6_txt_(r[hm['PRIORIDADE']]));
    if (pri !== crm6_txt_(r[hm['PRIORIDADE']])) { mudou.push('PRIORIDADE'); conta_('PRIORIDADE'); r[hm['PRIORIDADE']] = pri; }
    // ORIGEM_LEAD
    var ori = crm6_normOrigem_(crm6_txt_(r[hm['ORIGEM_LEAD']]));
    if (ori !== crm6_txt_(r[hm['ORIGEM_LEAD']])) { mudou.push('ORIGEM_LEAD'); conta_('ORIGEM_LEAD'); r[hm['ORIGEM_LEAD']] = ori; }
    // STATUS_PROSPECT
    if (crm6_txt_(r[hm['STATUS_PROSPECT']]) !== 'NOVO') { mudou.push('STATUS_PROSPECT'); conta_('STATUS_PROSPECT'); r[hm['STATUS_PROSPECT']] = 'NOVO'; }
    // RESPONSAVEL (nome) e RESPONSAVEL_ID (codigo)
    if (crm6_txt_(r[hm['RESPONSAVEL']]) !== resp.nome) { mudou.push('RESPONSAVEL'); conta_('RESPONSAVEL'); r[hm['RESPONSAVEL']] = resp.nome; }
    if (crm6_txt_(r[hm['RESPONSAVEL_ID']]) !== resp.id) { mudou.push('RESPONSAVEL_ID'); conta_('RESPONSAVEL_ID'); r[hm['RESPONSAVEL_ID']] = resp.id; }

    if (mudou.length) {
      rel.alterados++;
      if (rel.exemplos.length < 10) rel.exemplos.push({ prospect: pid, campos: mudou.join(', ') });
    }
  }

  // Tratativas de prospect voltam para a etapa inicial
  var relTrat = crm6_resetTratativasProspect_(aplicar);

  if (aplicar) {
    sh.getRange(1, 1, vals.length, vals[0].length).setValues(vals);
    rel.aplicado = true;
    crm6_invalidarDados_();
  } else {
    rel.aplicado = false;
    rel.aviso = 'MODO TESTE - nada foi gravado. Rode crm6_limparProspectsAplicar para aplicar.';
  }
  rel.tratativas = relTrat;
  Logger.log(JSON.stringify(rel, null, 2));
  return rel;
}

function crm6_limparProspectsTeste() { return crm6_limparProspects_({ aplicar: false }); }
function crm6_limparProspectsAplicar() { return crm6_limparProspects_({ aplicar: true }); }

/** Devolve todas as tratativas de PROSPECT para a etapa inicial e status ABERTA. */
function crm6_resetTratativasProspect_(aplicar) {
  var ss = crm6_ss_();
  var sh = ss.getSheetByName(CRM6_CFG.SHEETS.TRATATIVAS);
  if (!sh || sh.getLastRow() < 2) return { total: 0, alteradas: 0 };
  var vals = sh.getDataRange().getValues();
  var hm = crm6_headerMap_(vals[0]);
  if (hm['TIPO_ENTIDADE'] === undefined || hm['ETAPA_ID'] === undefined) return { total: 0, alteradas: 0, erro: 'colunas ausentes' };
  var total = 0, alteradas = 0;
  var agora = crm6_agora_();
  for (var i = 1; i < vals.length; i++) {
    var r = vals[i];
    if (crm6_txt_(r[hm['TIPO_ENTIDADE']]).toUpperCase() !== 'PROSPECT') continue;
    total++;
    var mudou = false;
    if (crm6_txt_(r[hm['ETAPA_ID']]) !== CRM6_CFG.ETAPA_INICIAL) { r[hm['ETAPA_ID']] = CRM6_CFG.ETAPA_INICIAL; mudou = true; }
    if (hm['STATUS_TRATATIVA'] !== undefined && crm6_txt_(r[hm['STATUS_TRATATIVA']]) !== CRM6_CFG.STATUS_TRATATIVA_ABERTA) {
      r[hm['STATUS_TRATATIVA']] = CRM6_CFG.STATUS_TRATATIVA_ABERTA; mudou = true;
    }
    if (mudou) {
      alteradas++;
      if (hm['ETAPA_ATUALIZADA_EM'] !== undefined) r[hm['ETAPA_ATUALIZADA_EM']] = agora;
      if (hm['ATUALIZADO_EM'] !== undefined) r[hm['ATUALIZADO_EM']] = agora;
    }
  }
  if (aplicar && alteradas) sh.getRange(1, 1, vals.length, vals[0].length).setValues(vals);
  return { total: total, alteradas: alteradas };
}

/* ==================== 5. DEFEITOS DO ANEXO ==================== */
/**
 * Remove a coluna CANAL_VENDA duplicada da aba PROSPECTS.
 * Seguranca: so remove se houver mais de uma coluna com esse nome E se a
 * duplicata estiver vazia. Remove sempre a ultima ocorrencia.
 * Modo teste por padrao.
 */
function crm6_removerColunasDuplicadas_(opts) {
  opts = opts || {};
  var aplicar = opts.aplicar === true;
  var ss = crm6_ss_();
  var sh = ss.getSheetByName(CRM6_CFG.SHEETS.PROSPECTS);
  var lastCol = sh.getLastColumn(), lastRow = sh.getLastRow();
  var headers = sh.getRange(1, 1, 1, lastCol).getValues()[0].map(crm6_txt_);
  var vistos = {}, duplicadas = [];
  headers.forEach(function (h, i) {
    if (!h) return;
    if (vistos[h] !== undefined) duplicadas.push({ nome: h, primeira: vistos[h] + 1, duplicada: i + 1 });
    else vistos[h] = i;
  });
  var rel = { duplicadasEncontradas: duplicadas, removidas: [], ignoradas: [] };
  // remove da direita para a esquerda, para os indices nao mudarem
  duplicadas.sort(function (a, b) { return b.duplicada - a.duplicada; }).forEach(function (d) {
    var vazia = true;
    if (lastRow > 1) {
      var col = sh.getRange(2, d.duplicada, lastRow - 1, 1).getValues();
      vazia = col.every(function (x) { return crm6_txt_(x[0]) === ''; });
    }
    if (!vazia) { rel.ignoradas.push({ coluna: d.nome, motivo: 'a duplicata tem dados - remocao manual necessaria' }); return; }
    if (aplicar) sh.deleteColumn(d.duplicada);
    rel.removidas.push({ coluna: d.nome, posicao: d.duplicada });
  });
  rel.aplicado = !!aplicar;
  if (!aplicar) rel.aviso = 'MODO TESTE - nada foi removido. Rode crm6_removerColunasDuplicadasAplicar para aplicar.';
  else crm6_invalidarDados_();
  Logger.log(JSON.stringify(rel, null, 2));
  return rel;
}
function crm6_removerColunasDuplicadasTeste() { return crm6_removerColunasDuplicadas_({ aplicar: false }); }
function crm6_removerColunasDuplicadasAplicar() { return crm6_removerColunasDuplicadas_({ aplicar: true }); }

/**
 * Diagnostico da coluna PERFIL (estava 100% vazia na analise).
 * NAO remove: PERFIL e lido em 12 pontos do backend (cadastro, dashboard,
 * importacao). Remover a coluna quebraria essas leituras. Esta funcao so
 * informa o estado atual para voce decidir com dado na mao.
 */
function crm6_diagnosticoPerfil() {
  var ss = crm6_ss_();
  var sh = ss.getSheetByName(CRM6_CFG.SHEETS.PROSPECTS);
  var vals = sh.getDataRange().getValues();
  var hm = crm6_headerMap_(vals[0]);
  if (hm['PERFIL'] === undefined) return { ok: true, existe: false };
  var preenchidos = 0, total = 0, amostra = {};
  for (var i = 1; i < vals.length; i++) {
    if (!crm6_txt_(vals[i][hm['PROSPECT_ID']])) continue;
    total++;
    var v = crm6_txt_(vals[i][hm['PERFIL']]);
    if (v) { preenchidos++; amostra[v] = (amostra[v] || 0) + 1; }
  }
  var res = {
    ok: true, existe: true, totalProspects: total, preenchidos: preenchidos,
    vazios: total - preenchidos, valores: amostra,
    recomendacao: preenchidos === 0
      ? 'Coluna sem uso. E lida em 12 pontos do backend, entao NAO remova a coluna: ou passe a usa-la, ou deixe como esta. Remover exigiria alterar backend e front juntos.'
      : 'Coluna em uso - manter.'
  };
  Logger.log(JSON.stringify(res, null, 2));
  return res;
}

/* ==================== 6. SETUP COMPLETO ==================== */
/**
 * Roda, na ordem correta, tudo que NAO altera dados de prospect:
 * cria a aba de listas, aplica os dropdowns e instala o gatilho.
 * A limpeza dos dados fica separada de proposito (tem modo teste).
 */
function crm6_setupCompleto() {
  var out = {};
  out.listas = crm6_setupListas();
  out.validacoes = crm6_aplicarValidacoes();
  out.gatilhos = crm6_instalarGatilhos();
  out.proximoPasso = 'Agora rode crm6_limparProspectsTeste (relatorio) e depois crm6_limparProspectsAplicar (grava).';
  Logger.log(JSON.stringify(out, null, 2));
  return out;
}

/* ==================== HELPERS ==================== */

function crm6_ss_() {
  if (typeof op_getSpreadsheet_ === 'function') return op_getSpreadsheet_();
  return SpreadsheetApp.getActiveSpreadsheet();
}
function crm6_txt_(v) { return v === null || v === undefined ? '' : String(v).trim(); }
function crm6_headerMap_(headerRow) {
  var hm = {};
  (headerRow || []).forEach(function (h, i) {
    var k = crm6_txt_(h).toUpperCase();
    if (k && hm[k] === undefined) hm[k] = i; // primeira ocorrencia vence
  });
  return hm;
}
function crm6_agora_() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone() || 'America/Fortaleza', "yyyy-MM-dd'T'HH:mm:ssXXX");
}
function crm6_semAcento_(s) {
  return crm6_txt_(s).toUpperCase()
    .replace(/[ÁÀÂÃÄ]/g, 'A').replace(/[ÉÈÊË]/g, 'E').replace(/[ÍÌÎÏ]/g, 'I')
    .replace(/[ÓÒÔÕÖ]/g, 'O').replace(/[ÚÙÛÜ]/g, 'U').replace(/[Ç]/g, 'C');
}
/** Alta/Media/Baixa (feminino antigo) -> Alto/Medio/Baixo (masculino oficial). */
function crm6_normPotencial_(v) {
  var k = crm6_semAcento_(v);
  if (k === 'ALTA' || k === 'ALTO') return 'Alto';
  if (k === 'MEDIA' || k === 'MEDIO') return 'Médio';
  if (k === 'BAIXA' || k === 'BAIXO') return 'Baixo';
  return 'A avaliar';
}
/** "P2 - media", "P2 — média", "2" -> "P2". Vazio vira P2 (padrao). */
function crm6_normPrioridade_(v) {
  var k = crm6_semAcento_(v);
  if (k.indexOf('P1') === 0 || k === '1' || k.indexOf('ALTA') >= 0) return 'P1';
  if (k.indexOf('P3') === 0 || k === '3' || k.indexOf('BAIXA') >= 0) return 'P3';
  return 'P2';
}
/** PLANILHA_LOTE e VISITA_EM_CAMPO nao sao origem comercial. */
function crm6_normOrigem_(v) {
  var k = crm6_semAcento_(v).replace(/[_\s]+/g, ' ').trim();
  if (!k || k === 'PLANILHA LOTE' || k === 'VISITA EM CAMPO' || k === 'PROSPECCAO ATIVA') return 'Prospecção ativa';
  if (k === 'INDICACAO') return 'Indicação';
  if (k === 'WHATSAPP') return 'WhatsApp';
  if (k === 'INSTAGRAM') return 'Instagram';
  if (k.indexOf('GOOGLE') === 0) return 'Google/Busca';
  if (k === 'CLIENTE ATIVO') return 'Cliente ativo';
  if (k === 'PARCERIA') return 'Parceria';
  return 'Outro';
}
/** Resolve o responsavel padrao (Manu) pelo username em CRM_RESPONSAVEIS. */
function crm6_responsavelPadrao_() {
  try {
    var sh = crm6_ss_().getSheetByName(CRM6_CFG.SHEETS.RESPONSAVEIS);
    if (sh && sh.getLastRow() > 1) {
      var vals = sh.getDataRange().getValues();
      var hm = crm6_headerMap_(vals[0]);
      for (var i = 1; i < vals.length; i++) {
        if (crm6_txt_(vals[i][hm['USERNAME']]).toLowerCase() === CRM6_CFG.RESPONSAVEL_PADRAO_USERNAME) {
          return { id: crm6_txt_(vals[i][hm['RESPONSAVEL_ID']]), nome: crm6_txt_(vals[i][hm['DISPLAY_NAME']]) };
        }
      }
    }
  } catch (e) {}
  return CRM6_CFG.RESPONSAVEL_PADRAO_FALLBACK;
}
function crm6_invalidarDados_() {
  try { if (typeof crm3_bumpCacheRev_ === 'function') crm3_bumpCacheRev_(); } catch (e) {}
  try { if (typeof op_invalidateOperationCaches_ === 'function') op_invalidateOperationCaches_(); } catch (e) {}
}
function crm6_invalidarConfig_() {
  try { if (typeof crm5x_bumpConfigRev_ === 'function') crm5x_bumpConfigRev_(); } catch (e) {}
  crm6_invalidarDados_();
}
