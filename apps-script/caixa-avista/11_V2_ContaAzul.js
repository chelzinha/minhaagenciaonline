function v2EnqueueContaAzul_(env,closureId,entries) {
  var rows=[];
  entries.filter(function(e){return e.status!=='EXCLUIDO';}).forEach(function(e){
    var payload=v2ContaAzulPayload_(e);
    var configured=payload.ready;
    rows.push([Utilities.getUuid(),closureId,e.id,e.unitId,e.type,configured?'PENDENTE':'CONFIGURACAO_PENDENTE',0,'',JSON.stringify(payload.body),configured?'':'Preencha UUIDs de contato, conta, categoria e centro de custo na biblioteca.',new Date(),new Date()]);
  });
  if(rows.length)env.caQueue.getRange(env.caQueue.getLastRow()+1,1,rows.length,rows[0].length).setValues(rows);
}

function v2ContaAzulPayload_(entry) {
  var env=v2Environment_();
  var unit=v2ReadObjects_(env.units,CAIXA_V2_CFG.HEADERS.UNITS).filter(function(x){return String(x.unit_id)===entry.unitId;})[0]||{};
  var contactId=entry.type==='RECEITA'?String(unit.default_revenue_contact_ca_id||''):String(unit.default_expense_contact_ca_id||'');
  var value=Number(entry.amountCents||0)/100;
  var descricaoContaAzul=v2ContaAzulDescricao_(entry,unit);
  var body={data_competencia:entry.date,valor:value,observacao:'Caixa à Vista | '+descricaoContaAzul+' | ID: '+entry.id,descricao:descricaoContaAzul,contato:contactId,conta_financeira:entry.accountContaAzulId,rateio:[{id_categoria:entry.categoryContaAzulId,valor:value,rateio_centro_custo:[{id_centro_custo:entry.costCenterContaAzulId,valor:value}]}],condicao_pagamento:{parcelas:[{descricao:descricaoContaAzul,data_vencimento:entry.date,nota:'Baixa manual pelo financeiro. Forma informada: '+entry.paymentName,conta_financeira:entry.accountContaAzulId,detalhe_valor:{multa:0,juros:0,valor_bruto:value,valor_liquido:value,desconto:0,taxa:0},metodo_pagamento:entry.paymentContaAzulMethod}]}};
  return {ready:Boolean(contactId&&entry.accountContaAzulId&&entry.categoryContaAzulId&&entry.costCenterContaAzulId&&entry.paymentContaAzulMethod),body:body};
}

function processContaAzulQueueV2(limitValue) {
  var env=v2Environment_(),limit=Math.max(1,Math.min(100,Number(limitValue||20))),rows=v2ReadObjects_(env.caQueue,CAIXA_V2_CFG.HEADERS.CA_QUEUE),processed=0;
  for(var i=0;i<rows.length&&processed<limit;i++){
    var item=rows[i],status=String(item.status),protocol=String(item.protocol||'');
    if(['PENDENTE','ERRO','AGUARDANDO_PROTOCOLO'].indexOf(status)<0)continue;
    try{
      if(status==='AGUARDANDO_PROTOCOLO'&&protocol){
        var protocolResult=v2CheckContaAzulProtocol_(protocol);
        v2ApplyProtocolResult_(env,item,i,protocolResult);
      }else{
        var body=JSON.parse(String(item.payload_json||'{}'));
        var endpoint=String(item.entry_type)==='DESPESA'?'/v1/financeiro/eventos-financeiros/contas-a-pagar':'/v1/financeiro/eventos-financeiros/contas-a-receber';
        var result=v2ContaAzulFetch_(endpoint,{method:'post',contentType:'application/json',payload:JSON.stringify(body),muteHttpExceptions:true});
        var code=result.getResponseCode(),data=JSON.parse(result.getContentText()||'{}');
        if(code<200||code>=300)throw new Error('HTTP '+code+': '+(data.message||data.error||result.getContentText()));
        protocol=String(data.protocolo||data.protocolId||'');
        if(!protocol)throw new Error('Conta Azul não retornou o protocolo da operação.');
        v2ApplyProtocolResult_(env,item,i,{protocol:protocol,status:String(data.status||'PENDING').toUpperCase(),message:String(data.mensagem||data.message||'')});
      }
    }catch(error){
      v2SetQueueRow_(env,i+2,'ERRO',Number(item.attempts||0)+1,protocol,String(error.message||error),item.created_at||new Date());
      v2UpdateEntryContaAzul_(env,String(item.entry_id),'ERRO',protocol,String(error.message||error));
      v2RefreshClosureContaAzulStatus_(env,String(item.closure_id));
    }
    processed++;
  }
  return {ok:true,processed:processed};
}

function v2CheckContaAzulProtocol_(protocol) {
  var response=v2ContaAzulFetch_('/v1/protocolo/'+encodeURIComponent(protocol),{method:'get',muteHttpExceptions:true});
  var code=response.getResponseCode(),data=JSON.parse(response.getContentText()||'{}');
  if(code<200||code>=300)throw new Error('Falha ao consultar protocolo '+protocol+': HTTP '+code+' '+response.getContentText());
  return {protocol:protocol,status:String(data.status||'PENDING').toUpperCase(),message:String(data.mensagem||data.message||data.erro||data.error||'')};
}

function v2ApplyProtocolResult_(env,item,index,result) {
  var protocol=String(result.protocol||item.protocol||''),status=String(result.status||'PENDING').toUpperCase(),attempts=Number(item.attempts||0)+1;
  if(status==='SUCCESS'){
    v2SetQueueRow_(env,index+2,'SINCRONIZADO',attempts,protocol,'',item.created_at||new Date());
    v2UpdateEntryContaAzul_(env,String(item.entry_id),'SINCRONIZADO',protocol,'');
  }else if(status==='ERROR'){
    var message=result.message||'O protocolo foi concluído com erro no Conta Azul.';
    v2SetQueueRow_(env,index+2,'ERRO',attempts,protocol,message,item.created_at||new Date());
    v2UpdateEntryContaAzul_(env,String(item.entry_id),'ERRO',protocol,message);
  }else{
    v2SetQueueRow_(env,index+2,'AGUARDANDO_PROTOCOLO',attempts,protocol,'',item.created_at||new Date());
    v2UpdateEntryContaAzul_(env,String(item.entry_id),'AGUARDANDO_PROTOCOLO',protocol,'');
  }
  v2RefreshClosureContaAzulStatus_(env,String(item.closure_id));
}

function v2SetQueueRow_(env,sheetRow,status,attempts,protocol,error,createdAt) {
  var payload=env.caQueue.getRange(sheetRow,9).getValue();
  env.caQueue.getRange(sheetRow,6,1,7).setValues([[status,attempts,protocol,payload,error,createdAt,new Date()]]);
}

function v2RefreshClosureContaAzulStatus_(env,closureId) {
  if(!closureId)return;
  var queue=v2ReadObjects_(env.caQueue,CAIXA_V2_CFG.HEADERS.CA_QUEUE).filter(function(x){return String(x.closure_id)===closureId;});
  var status='PENDENTE';
  if(queue.length&&queue.every(function(x){return String(x.status)==='SINCRONIZADO';}))status='SINCRONIZADO';
  else if(queue.some(function(x){return ['ERRO','CONFIGURACAO_PENDENTE'].indexOf(String(x.status))>=0;}))status='COM_ERRO';
  var closures=v2ReadObjects_(env.closures,CAIXA_V2_CFG.HEADERS.CLOSURES);
  for(var i=0;i<closures.length;i++)if(String(closures[i].closure_id)===closureId){env.closures.getRange(i+2,33).setValue(status);break;}
}

function v2UpdateEntryContaAzul_(env,entryId,status,protocol,error) {
  var last=env.entries.getLastRow();if(last<2)return;var rows=env.entries.getRange(2,1,last-1,CAIXA_V2_CFG.HEADERS.ENTRIES.length).getValues();
  for(var i=0;i<rows.length;i++)if(String(rows[i][0])===entryId){rows[i][34]=status;if(protocol)rows[i][35]=protocol;rows[i][36]=error||'';rows[i][37]=Number(rows[i][37]||0)+1;if(status==='SINCRONIZADO')rows[i][38]=new Date();env.entries.getRange(i+2,1,1,rows[i].length).setValues([rows[i]]);break;}
}

function v2ContaAzulFetch_(path,options) {
  var token=v2ContaAzulToken_(); options=options||{};options.headers=Object.assign({},options.headers||{},{Authorization:'Bearer '+token});
  var response=UrlFetchApp.fetch(CAIXA_V2_CFG.CONTA_AZUL_API+path,options);
  if(response.getResponseCode()===401){token=v2RefreshContaAzulToken_();options.headers.Authorization='Bearer '+token;response=UrlFetchApp.fetch(CAIXA_V2_CFG.CONTA_AZUL_API+path,options);}return response;
}

function v2ContaAzulToken_() {
  var props=PropertiesService.getScriptProperties(),token=props.getProperty(CAIXA_V2_CFG.PROPS.CA_ACCESS_TOKEN),expires=Number(props.getProperty(CAIXA_V2_CFG.PROPS.CA_EXPIRES_AT)||0);
  if(token&&expires>Date.now()+60000)return token;return v2RefreshContaAzulToken_();
}

function v2RefreshContaAzulToken_() {
  var props=PropertiesService.getScriptProperties(),clientId=props.getProperty(CAIXA_V2_CFG.PROPS.CA_CLIENT_ID),secret=props.getProperty(CAIXA_V2_CFG.PROPS.CA_CLIENT_SECRET),refresh=props.getProperty(CAIXA_V2_CFG.PROPS.CA_REFRESH_TOKEN);
  if(!clientId||!secret||!refresh)throw new Error('Credenciais OAuth do Conta Azul não configuradas.');
  var response=UrlFetchApp.fetch(CAIXA_V2_CFG.CONTA_AZUL_TOKEN_URL,{method:'post',contentType:'application/x-www-form-urlencoded',headers:{Authorization:'Basic '+Utilities.base64Encode(clientId+':'+secret)},payload:{grant_type:'refresh_token',refresh_token:refresh},muteHttpExceptions:true});
  var data=JSON.parse(response.getContentText()||'{}');if(response.getResponseCode()<200||response.getResponseCode()>=300)throw new Error(data.error_description||data.error||'Falha ao renovar token Conta Azul.');
  props.setProperty(CAIXA_V2_CFG.PROPS.CA_ACCESS_TOKEN,data.access_token);props.setProperty(CAIXA_V2_CFG.PROPS.CA_REFRESH_TOKEN,data.refresh_token);props.setProperty(CAIXA_V2_CFG.PROPS.CA_EXPIRES_AT,String(Date.now()+Number(data.expires_in||3600)*1000));return data.access_token;
}

function contaAzulExchangeCodeV2(code) {
  var props=PropertiesService.getScriptProperties(),clientId=props.getProperty(CAIXA_V2_CFG.PROPS.CA_CLIENT_ID),secret=props.getProperty(CAIXA_V2_CFG.PROPS.CA_CLIENT_SECRET),redirect=props.getProperty(CAIXA_V2_CFG.PROPS.CA_REDIRECT_URI);
  if(!clientId||!secret||!redirect)throw new Error('Configure client_id, client_secret e redirect_uri.');
  var response=UrlFetchApp.fetch(CAIXA_V2_CFG.CONTA_AZUL_TOKEN_URL,{method:'post',contentType:'application/x-www-form-urlencoded',headers:{Authorization:'Basic '+Utilities.base64Encode(clientId+':'+secret)},payload:{grant_type:'authorization_code',code:code,redirect_uri:redirect},muteHttpExceptions:true});
  var data=JSON.parse(response.getContentText()||'{}');if(response.getResponseCode()<200||response.getResponseCode()>=300)throw new Error(data.error_description||data.error||'Falha ao trocar código.');
  props.setProperty(CAIXA_V2_CFG.PROPS.CA_ACCESS_TOKEN,data.access_token);props.setProperty(CAIXA_V2_CFG.PROPS.CA_REFRESH_TOKEN,data.refresh_token);props.setProperty(CAIXA_V2_CFG.PROPS.CA_EXPIRES_AT,String(Date.now()+Number(data.expires_in||3600)*1000));return {ok:true};
}

function syncContaAzulLibraryV2() {
  var env = v2Environment_();
  var now = new Date();

  var categories = v2GetPaged_('/v1/categorias')
    .filter(v2ContaAzulItemAtivo_);

  var costCenters = v2GetPaged_('/v1/centro-de-custo')
    .filter(v2ContaAzulItemAtivo_);

  var accounts = v2GetPaged_('/v1/conta-financeira')
    .filter(v2ContaAzulItemAtivo_);

  v2SyncCaSheet_(
    env.caCategories,
    CAIXA_V2_CFG.HEADERS.CA_CATEGORIES,
    categories,
    function (x) {
      return [
        x.id,
        x.codigo || '',
        x.nome || '',
        x.tipo || '',
        x.ativo !== false,
        now
      ];
    }
  );

  v2SyncCaSheet_(
    env.caCostCenters,
    CAIXA_V2_CFG.HEADERS.CA_COST_CENTERS,
    costCenters,
    function (x) {
      return [
        x.id,
        x.codigo || '',
        x.nome || '',
        x.ativo !== false,
        now
      ];
    }
  );

  v2SyncCaSheet_(
    env.caAccounts,
    CAIXA_V2_CFG.HEADERS.CA_ACCOUNTS,
    accounts,
    function (x) {
      return [
        x.id,
        x.nome || '',
        x.tipo || '',
        x.ativo !== false,
        now
      ];
    }
  );

  return {
    ok: true,
    categorias: categories.length,
    centrosCusto: costCenters.length,
    contasFinanceiras: accounts.length,
    syncedAt: now.toISOString()
  };
}

function v2ContaAzulItemAtivo_(item) {
  return !item || item.ativo !== false;
}

function v2GetPaged_(path) {
  var page = 1;
  var pageSize = 100;
  var maxPages = 100;
  var all = [];
  var seen = {};

  while (page <= maxPages) {
    var separator = path.indexOf('?') >= 0 ? '&' : '?';

    var pagedPath =
      path +
      separator +
      'pagina=' + page +
      '&tamanho_pagina=' + pageSize;

    var response = v2ContaAzulFetch_(pagedPath, {
      method: 'get',
      muteHttpExceptions: true
    });

    var code = response.getResponseCode();

    if (code < 200 || code >= 300) {
      throw new Error(
        'Falha ao sincronizar ' +
        pagedPath +
        ': HTTP ' +
        code +
        ' ' +
        response.getContentText()
      );
    }

    var data = JSON.parse(response.getContentText() || '[]');

    var items = Array.isArray(data)
      ? data
      : (
          data.itens ||
          data.items ||
          data.data ||
          []
        );

    if (!Array.isArray(items)) {
      items = [];
    }

    var added = 0;

    items.forEach(function (item) {
      var key = String(
        item && item.id
          ? item.id
          : JSON.stringify(item)
      );

      if (!seen[key]) {
        seen[key] = true;
        all.push(item);
        added += 1;
      }
    });

    var total = Number(
      data.itens_totais ||
      data.total_itens ||
      data.total_items ||
      0
    );

    if (total > 0 && all.length >= total) {
      break;
    }

    if (items.length < pageSize || added === 0) {
      break;
    }

    page += 1;
  }

  return all;
}

function v2SyncCaSheet_(sheet,headers,items,mapper) {
  if(sheet.getLastRow()>1)sheet.getRange(2,1,sheet.getLastRow()-1,headers.length).clearContent();
  var rows=items.map(mapper);if(rows.length)sheet.getRange(2,1,rows.length,headers.length).setValues(rows);
}


function vincularContatosPadraoContaAzulV2() {
  var env = v2Environment_();
  var now = new Date();

  var configuracoes = [
    {
      unitId: 'AGF',
      perfil: 'Cliente',
      campoUnidade: 'default_revenue_contact_ca_id',
      nome: 'FATURAMENTO BALCÃO AGF À VISTA'
    },
    {
      unitId: 'SHOPPING_METRO',
      perfil: 'Cliente',
      campoUnidade: 'default_revenue_contact_ca_id',
      nome: 'FATURAMENTO METRÔ À VISTA'
    },
    {
      unitId: 'AGF',
      perfil: 'Fornecedor',
      campoUnidade: 'default_expense_contact_ca_id',
      nome: 'DESPESAS BALCÃO AGF'
    },
    {
      unitId: 'SHOPPING_METRO',
      perfil: 'Fornecedor',
      campoUnidade: 'default_expense_contact_ca_id',
      nome: 'DESPESAS METRÔ'
    }
  ];

  var encontrados = [];
  var ausentes = [];

  configuracoes.forEach(function(config) {
    var path =
      '/v1/pessoas' +
      '?pagina=1' +
      '&tamanho_pagina=100' +
      '&tipo_perfil=' + encodeURIComponent(config.perfil) +
      '&com_endereco=false' +
      '&busca=' + encodeURIComponent(config.nome);

    var response = v2ContaAzulFetch_(path, {
      method: 'get',
      muteHttpExceptions: true
    });

    var code = response.getResponseCode();

    if (code < 200 || code >= 300) {
      throw new Error(
        'Erro ao procurar "' +
        config.nome +
        '": HTTP ' +
        code +
        ' ' +
        response.getContentText()
      );
    }

    var data = JSON.parse(
      response.getContentText() || '{}'
    );

    var items = Array.isArray(data)
      ? data
      : (
          data.items ||
          data.itens ||
          data.data ||
          []
        );

    var nomeEsperado = v2Normalize_(config.nome);

    var contato = items.filter(function(item) {
      var nomeItem = String(
        item.nome ||
        item.nome_empresa ||
        item.nome_fantasia ||
        ''
      );

      return (
        v2Normalize_(nomeItem) === nomeEsperado &&
        item.ativo !== false
      );
    })[0];

    if (!contato) {
      ausentes.push({
        nome: config.nome,
        perfil: config.perfil
      });

      return;
    }

    var id = String(
      contato.id ||
      contato.uuid ||
      ''
    ).trim();

    if (!id) {
      ausentes.push({
        nome: config.nome,
        perfil: config.perfil,
        motivo: 'Cadastro encontrado sem UUID.'
      });

      return;
    }

    encontrados.push({
      unitId: config.unitId,
      campoUnidade: config.campoUnidade,
      id: id,
      nome: config.nome,
      documento: String(
        contato.documento || ''
      ),
      perfil: config.perfil
    });
  });

  if (ausentes.length) {
    return {
      ok: false,
      mensagem:
        'Alguns contatos não foram encontrados no Conta Azul.',
      encontrados: encontrados,
      ausentes: ausentes
    };
  }

  var headersContatos =
    CAIXA_V2_CFG.HEADERS.CA_CONTACTS;

  if (env.caContacts.getLastRow() > 1) {
    env.caContacts
      .getRange(
        2,
        1,
        env.caContacts.getLastRow() - 1,
        headersContatos.length
      )
      .clearContent();
  }

  var linhasContatos = encontrados.map(function(item) {
    return [
      item.id,
      item.nome,
      item.documento,
      item.perfil,
      true,
      now
    ];
  });

  env.caContacts
    .getRange(
      2,
      1,
      linhasContatos.length,
      headersContatos.length
    )
    .setValues(linhasContatos);

  var headersUnidades =
    CAIXA_V2_CFG.HEADERS.UNITS;

  var indiceReceita =
    headersUnidades.indexOf(
      'default_revenue_contact_ca_id'
    );

  var indiceDespesa =
    headersUnidades.indexOf(
      'default_expense_contact_ca_id'
    );

  var unidades = env.units
    .getRange(
      2,
      1,
      env.units.getLastRow() - 1,
      headersUnidades.length
    )
    .getValues();

  encontrados.forEach(function(contato) {
    var indiceLinha = -1;

    unidades.forEach(function(row, index) {
      if (
        String(row[0]).trim() === contato.unitId
      ) {
        indiceLinha = index;
      }
    });

    if (indiceLinha < 0) {
      throw new Error(
        'Unidade não encontrada: ' +
        contato.unitId
      );
    }

    var indiceColuna =
      contato.campoUnidade ===
      'default_revenue_contact_ca_id'
        ? indiceReceita
        : indiceDespesa;

    unidades[indiceLinha][indiceColuna] =
      contato.id;
  });

  env.units
    .getRange(
      2,
      1,
      unidades.length,
      headersUnidades.length
    )
    .setValues(unidades);

  SpreadsheetApp.flush();

  return {
    ok: true,
    contatosVinculados: encontrados.length,
    contatos: encontrados.map(function(item) {
      return {
        unidade: item.unitId,
        perfil: item.perfil,
        nome: item.nome,
        id: item.id
      };
    }),
    mensagem:
      'Contatos técnicos vinculados às unidades.'
  };
}


function corrigirUnidadesEVincularContatosV2() {
  var env = v2Environment_();
  var headers = CAIXA_V2_CFG.HEADERS.UNITS;

  var unidadesDesejadas = [
    {
      unitId: 'AGF',
      name: 'AGF',
      costCenterName: 'Balcao AGF',
      costCenterId: '6b32b0e8-76e2-11f0-accb-5f19b1ac8112'
    },
    {
      unitId: 'SHOPPING_METRO',
      name: 'Shopping Metrô',
      costCenterName: 'Metrô',
      costCenterId: '79c33e10-d828-11ef-ba7a-977c5baa773b'
    }
  ];

  var rows = [];

  if (env.units.getLastRow() > 1) {
    rows = env.units
      .getRange(
        2,
        1,
        env.units.getLastRow() - 1,
        headers.length
      )
      .getValues();
  }

  unidadesDesejadas.forEach(function(config) {
    var index = -1;

    rows.forEach(function(row, rowIndex) {
      var unitId = String(row[0] || '').trim();
      var nome = v2Normalize_(row[1] || '');
      var centro = v2Normalize_(row[2] || '');

      if (
        unitId === config.unitId ||
        nome === v2Normalize_(config.name) ||
        centro === v2Normalize_(config.costCenterName)
      ) {
        index = rowIndex;
      }
    });

    if (index < 0) {
      rows.push([
        config.unitId,
        config.name,
        config.costCenterName,
        config.costCenterId,
        '',
        '',
        '',
        true
      ]);

      return;
    }

    var existing = rows[index];

    existing[0] = config.unitId;
    existing[1] = config.name;
    existing[2] = config.costCenterName;
    existing[3] = config.costCenterId;
    existing[7] = true;

    rows[index] = existing;
  });

  if (env.units.getLastRow() > 1) {
    env.units
      .getRange(
        2,
        1,
        env.units.getLastRow() - 1,
        headers.length
      )
      .clearContent();
  }

  env.units
    .getRange(
      2,
      1,
      rows.length,
      headers.length
    )
    .setValues(rows);

  SpreadsheetApp.flush();

  var resultadoContatos =
    vincularContatosPadraoContaAzulV2();

  return {
    ok: resultadoContatos.ok,
    unidadesCorrigidas: [
      'AGF',
      'SHOPPING_METRO'
    ],
    contatosVinculados:
      resultadoContatos.contatosVinculados || 0,
    resultadoContatos: resultadoContatos
  };
}


function v2ContaAzulDescricao_(entry, unit) {
  var partes = [];

  if (
    entry.type === 'RECEITA' &&
    String(entry.clientName || '').trim()
  ) {
    partes.push(
      String(entry.clientName).trim()
    );
  }

  var descricao = String(
    entry.description ||
    entry.categoryContaAzulName ||
    (
      entry.type === 'DESPESA'
        ? 'Despesa de caixa'
        : 'Atendimento de balcão'
    )
  ).trim();

  if (descricao) {
    partes.push(descricao);
  }

  if (String(entry.paymentName || '').trim()) {
    partes.push(
      String(entry.paymentName).trim()
    );
  }

  var unidade = String(
    unit.name ||
    entry.unitId ||
    ''
  ).trim();

  if (unidade) {
    partes.push(unidade);
  }

  return partes.join(' | ');
}
