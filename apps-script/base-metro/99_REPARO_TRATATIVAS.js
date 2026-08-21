/* ============================================================
 * REPARO DE TRATATIVAS ORFAS
 *
 * Contexto: op_apiCreateProspect_ e op_apiCreateCliente_ gravavam o
 * cadastro na planilha mas nunca criavam a tratativa. Como o funil le a
 * aba CRM_TRATATIVAS, esses registros nunca apareciam no kanban.
 *
 * COMO USAR (nesta ordem):
 *   1. reparo_diagnosticar()          -> so le, nao altera nada
 *   2. Fazer copia de seguranca da planilha
 *   3. reparo_aplicar()               -> cria as tratativas faltantes
 *
 * As tratativas criadas ficam com ORIGEM = 'REPARO_TRATATIVAS' na aba
 * CRM_TRATATIVAS, entao da para filtrar e remover manualmente se preciso.
 * ============================================================ */

/* ---------- 1. DIAGNOSTICO (nao altera nada) ---------- */
function reparo_diagnosticar() {
  var r = reparo_levantar_();

  Logger.log('===== DIAGNOSTICO DE TRATATIVAS =====');
  Logger.log('PROSPECTS');
  Logger.log('  sem tratativa : ' + r.prospects.faltantes.length);
  Logger.log('  com tratativa : ' + r.prospects.ok);
  Logger.log('  ignorados     : ' + r.prospects.ignorados + ' (excluidos/inativos)');
  Logger.log('CLIENTES');
  Logger.log('  sem tratativa : ' + r.clientes.faltantes.length);
  Logger.log('  com tratativa : ' + r.clientes.ok);
  Logger.log('  ignorados     : ' + r.clientes.ignorados);
  Logger.log('TOTAL A CRIAR   : ' + (r.prospects.faltantes.length + r.clientes.faltantes.length));

  reparo_logarAmostra_('PROSPECTS sem tratativa', r.prospects.faltantes);
  reparo_logarAmostra_('CLIENTES sem tratativa', r.clientes.faltantes);

  return {
    prospectsFaltantes: r.prospects.faltantes.length,
    clientesFaltantes: r.clientes.faltantes.length
  };
}

/* ---------- 2. APLICACAO ---------- */
/* Sem argumento repara os dois. Passe 'PROSPECT' ou 'CLIENTE' para limitar. */
function reparo_aplicar(somenteTipo) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) {
    Logger.log('Outra execucao em andamento. Tente novamente em instantes.');
    return { ok: false, motivo: 'lock' };
  }
  try {
    var filtro = String(somenteTipo || '').toUpperCase();
    var r = reparo_levantar_();
    var totalCriadas = 0, totalFalhas = 0, falhas = [];

    if (filtro !== 'CLIENTE') {
      var pr = reparo_criarLote_('PROSPECT', r.prospects.faltantes);
      totalCriadas += pr.criadas; totalFalhas += pr.falhas;
      falhas = falhas.concat(pr.detalhes);
    }
    if (filtro !== 'PROSPECT') {
      var cl = reparo_criarLote_('CLIENTE', r.clientes.faltantes);
      totalCriadas += cl.criadas; totalFalhas += cl.falhas;
      falhas = falhas.concat(cl.detalhes);
    }

    Logger.log('===== REPARO CONCLUIDO =====');
    Logger.log('Criadas : ' + totalCriadas);
    Logger.log('Falhas  : ' + totalFalhas);
    falhas.slice(0, 30).forEach(function (d) { Logger.log('  ' + d); });
    if (falhas.length > 30) Logger.log('  ... e mais ' + (falhas.length - 30));

    return { ok: true, criadas: totalCriadas, falhas: totalFalhas };
  } finally {
    lock.releaseLock();
  }
}

/* Atalhos, caso queira rodar so um dos dois. */
function reparo_aplicarSomenteProspects() { return reparo_aplicar('PROSPECT'); }
function reparo_aplicarSomenteClientes()  { return reparo_aplicar('CLIENTE'); }

/* ---------- INTERNO ---------- */

function reparo_criarLote_(tipo, lista) {
  var ehProspect = tipo === 'PROSPECT';
  var funilId = ehProspect ? CRM3_CFG.FUNIL_PROSPECTS : CRM3_CFG.FUNIL_CLIENTES;
  var etapaPadrao = crm3_defaultStageForFunnel_(funilId);
  var criadas = 0, falhas = 0, detalhes = [];

  Logger.log('Reparando ' + lista.length + ' ' + tipo + '(s)...');

  for (var i = 0; i < lista.length; i++) {
    var item = lista[i];
    try {
      var etapa = item.etapa || etapaPadrao;
      try {
        crm3_validateStageForFunnel_(etapa, funilId);
      } catch (eEtapa) {
        etapa = etapaPadrao;
      }
      crm3_apiCreateTratativa_({
        tipoEntidade: tipo,
        entidadeId: item.id,
        funilId: funilId,
        etapaId: etapa,
        responsavelId: item.responsavel || '',
        origem: 'REPARO_TRATATIVAS',
        createdBy: 'REPARO'
      });
      criadas++;
    } catch (err) {
      falhas++;
      detalhes.push(tipo + ' ' + item.id + ' (' + item.nome + '): ' + err);
    }
    /* Pausa periodica para nao estourar o tempo maximo de execucao. */
    if (i > 0 && i % 40 === 0) Utilities.sleep(400);
  }

  return { criadas: criadas, falhas: falhas, detalhes: detalhes };
}

function reparo_levantar_() {
  crm3_assertSetupReady_();

  var tratativas = crm3_readObjects_(CRM3_CFG.SHEETS.TRATATIVAS);

  /* Indexa quem ja tem tratativa, por tipo de entidade. */
  var temProspect = {}, temCliente = {};
  for (var t = 0; t < tratativas.length; t++) {
    var tr = tratativas[t];
    var tipo = crm3_upper_(tr.TIPO_ENTIDADE);
    var eid = crm3_text_(tr.ENTIDADE_ID);
    if (!eid) continue;
    if (tipo === 'PROSPECT') temProspect[eid] = true;
    else if (tipo === 'CLIENTE') temCliente[eid] = true;
  }

  return {
    prospects: reparo_varrer_(
      crm3_readObjects_(CRM3_CFG.SHEETS.PROSPECTS),
      temProspect,
      'PROSPECT_ID',
      ['CLIENTE', 'NOME_FANTASIA'],
      'STATUS_PROSPECT'
    ),
    clientes: reparo_varrer_(
      crm3_readObjects_(CRM3_CFG.SHEETS.MASTER),
      temCliente,
      'CLIENTE_ID',
      ['CLIENTE', 'NOME_REMETENTE_BASE'],
      'STATUS_COMERCIAL'
    )
  };
}

function reparo_varrer_(linhas, jaTem, campoId, camposNome, campoStatus) {
  var faltantes = [], ok = 0, ignorados = 0;

  for (var i = 0; i < linhas.length; i++) {
    var x = linhas[i];
    var id = crm3_text_(x[campoId]);
    if (!id) continue;

    var status = crm3_upper_(x[campoStatus] || '');
    if (status.indexOf('EXCLU') === 0 || status === 'INATIVO') { ignorados++; continue; }

    if (jaTem[id]) { ok++; continue; }

    var nome = '';
    for (var n = 0; n < camposNome.length && !nome; n++) nome = crm3_text_(x[camposNome[n]]);

    faltantes.push({
      id: id,
      nome: nome || '(sem nome)',
      etapa: crm3_text_(x.ETAPA_FUNIL || ''),
      responsavel: crm3_text_(x.RESPONSAVEL || '')
    });
  }

  return { faltantes: faltantes, ok: ok, ignorados: ignorados };
}

function reparo_logarAmostra_(titulo, lista) {
  if (!lista.length) return;
  Logger.log('--- ' + titulo + ' (mostrando ate 30) ---');
  lista.slice(0, 30).forEach(function (p) {
    Logger.log('  ' + p.id + ' | ' + p.nome + ' | etapa: ' + (p.etapa || '(padrao)'));
  });
  if (lista.length > 30) Logger.log('  ... e mais ' + (lista.length - 30));
}
