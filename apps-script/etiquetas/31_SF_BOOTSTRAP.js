/**
 * AGF SUPERFRETE — 31_SF_BOOTSTRAP.gs
 * Criação/instalação da planilha base.
 *
 * Use manualmente no editor Apps Script:
 * 1) sfCreateStandaloneSpreadsheet()
 *    Cria uma nova planilha Google Sheets completa e retorna ID/URL.
 *
 * 2) sfInstallIntoConfiguredSpreadsheet()
 *    Cria/atualiza as abas SF_* dentro da planilha CFG.SF_SPREADSHEET_ID.
 */

function sfCreateStandaloneSpreadsheet() {
  const ss = SpreadsheetApp.create('AGF SuperFrete — Base Operacional');
  sfEnsureAllSheets_(ss);
  return {
    ok: true,
    spreadsheetId: ss.getId(),
    url: ss.getUrl(),
    message: 'Planilha AGF SuperFrete criada. Copie o ID para CFG.SF_SPREADSHEET_ID.'
  };
}

function sfInstallIntoConfiguredSpreadsheet() {
  const ss = SpreadsheetApp.openById(sfGetSpreadsheetId_());
  sfEnsureAllSheets_(ss);
  return {
    ok: true,
    spreadsheetId: ss.getId(),
    url: ss.getUrl(),
    message: 'Abas SF_* criadas/atualizadas na planilha configurada.'
  };
}

function sfEnsureAllSheets_(ss) {
  const names = Object.keys(SF.HEADERS);
  names.forEach(function (sheetName) {
    const sh = sfGetOrCreateSheetIn_(ss, sheetName);
    sfSetHeaders_(sh, SF.HEADERS[sheetName]);
    sfStyleSheet_(sh, SF.HEADERS[sheetName].length);
  });

  sfApplyTextColumnFormats_(ss);

  sfSeedConfig_(ss.getSheetByName(SF.SHEETS.CONFIG));
  sfSeedListas_(ss.getSheetByName(SF.SHEETS.LISTAS));
  sfSeedAdmin_(ss.getSheetByName(SF.SHEETS.USUARIOS));
  sfSeedClienteExemplo_(ss);

  // README visual
  const readme = ss.getSheetByName('README_SUPERFRETE') || ss.insertSheet('README_SUPERFRETE', 0);
  readme.clear();
  readme.getRange(1, 1, 1, 3).setValues([['ITEM', 'DESCRIÇÃO', 'OBS']]);
  readme.getRange(2, 1, 6, 3).setValues([
    ['Projeto', 'AGF SuperFrete', 'Contrato SuperFrete único da AGF com subcontas internas por cliente/remetente.'],
    ['Financeiro', 'Conta corrente do cliente', 'Pode ficar positiva ou negativa; negativo limitado pelo LIMITE_CREDITO.'],
    ['Carteira SuperFrete', 'Controle paralelo', 'Espelha recargas, consumo real de etiquetas e estornos da conta AGF na SuperFrete.'],
    ['DC-e/DACE', 'Campos preparados', 'DC-e usa remetente, destinatário com CPF/CNPJ e itens com descrição, quantidade e valor.'],
    ['Tokens', 'Não salvar na planilha', 'Use PropertiesService: ' + SF.PROPERTIES.SUPERFRETE_TOKEN_SANDBOX + ' / ' + SF.PROPERTIES.SUPERFRETE_TOKEN_PRODUCAO],
    ['Senha inicial admin', 'gerada aleatoriamente no bootstrap', 'Ver log da execução; trocar com sfDefinirSenhaAdmin().']
  ]);
  sfStyleSheet_(readme, 3);
  return true;
}

function sfGetOrCreateSheetIn_(ss, name) {
  let sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  return sh;
}

function sfSetHeaders_(sh, headers) {
  const currentLastCol = Math.max(sh.getLastColumn(), headers.length);
  if (sh.getMaxColumns() < headers.length) {
    sh.insertColumnsAfter(sh.getMaxColumns(), headers.length - sh.getMaxColumns());
  }
  sh.getRange(1, 1, 1, headers.length).setValues([headers]);
  // Não apaga dados existentes. Apenas garante headers.
}

function sfStyleSheet_(sh, colCount) {
  sh.setFrozenRows(1);
  const header = sh.getRange(1, 1, 1, colCount);
  header.setBackground('#00416B')
    .setFontColor('#FFFFFF')
    .setFontWeight('bold')
    .setHorizontalAlignment('center')
    .setVerticalAlignment('middle')
    .setWrap(true);
  sh.setRowHeight(1, 32);
  for (let c = 1; c <= colCount; c++) sh.setColumnWidth(c, 145);
}

function sfApplyTextColumnFormats_(ss) {
  // Protege campos que podem ter zeros à esquerda ou muitos dígitos.
  // Ex.: CPF/CNPJ, CEP, telefone, login, IDs e chaves de DC-e.
  const textHeaders = [
    'USUARIO_ID','CLIENTE_ID','REMETENTE_ID','LOGIN','DOCUMENTO','CNPJ_CPF','TELEFONE','CEP',
    'ORDER_ID_AGF','ORDER_ID_SUPERFRETE','TRACKING','DESTINATARIO_DOCUMENTO','DESTINATARIO_CEP',
    'DCE_CHAVE_ACESSO','DCE_QR_CODE','COBRANCA_ID','PAGAMENTO_ID','PROVEDOR_PAYMENT_ID','PROVEDOR_ORDER_NSU',
    'PIX_COPIA_COLA','TRANSACTION_ID'
  ];

  Object.keys(SF.HEADERS).forEach(function (sheetName) {
    const sh = ss.getSheetByName(sheetName);
    if (!sh) return;
    const headers = SF.HEADERS[sheetName] || [];
    headers.forEach(function (h, idx) {
      if (textHeaders.indexOf(h) >= 0) {
        sh.getRange(2, idx + 1, Math.max(sh.getMaxRows() - 1, 1), 1).setNumberFormat('@');
      }
    });
  });
}

function sfSeedConfig_(sh) {
  if (sh.getLastRow() > 1) return;
  const now = nowIso_();
  sh.getRange(2, 1, 7, 4).setValues([
    ['SUPERFRETE_AMBIENTE', 'SANDBOX', 'Ambiente padrão: SANDBOX ou PRODUCAO', now],
    ['SUPERFRETE_USER_AGENT', 'AGF-Jose-Bonifacio-SuperFrete/1.0', 'User-Agent obrigatório para API SuperFrete', now],
    ['SUPERFRETE_SALDO_MINIMO_ALERTA', '200', 'Alerta administrativo para recarga SuperFrete', now],
    ['MARGEM_SEGURANCA_COTACAO', String(SF.DEFAULTS.MARGEM_SEGURANCA_COTACAO), 'Valor extra em reais para validação de limite antes da emissão', now],
    ['PROVEDOR_PIX_ATIVO', 'INFINITEPAY', 'Provedor inicial previsto para Pix/checkout', now],
    ['PERMITIR_VALOR_NEGATIVO_EXTRA', 'NAO', 'Permitir ultrapassar limite por ajuste real de postagem', now],
    ['DCE_OBRIGATORIA_SEM_NF', 'SIM', 'Exigir itens de declaração quando não houver NF', now]
  ]);
}

function sfSeedListas_(sh) {
  if (sh.getLastRow() > 1) return;
  sh.getRange(2, 1, 22, 3).setValues([
    ['TIPO_USUARIO','ADMIN','Administrador do painel AGF'],
    ['TIPO_USUARIO','CLIENTE','Cliente/remetente'],
    ['STATUS_GERAL','ATIVO','Registro ativo'],
    ['STATUS_GERAL','BLOQUEADO','Registro bloqueado'],
    ['STATUS_GERAL','INATIVO','Registro inativo'],
    ['STATUS_CREDITO','ATIVO','Pode emitir dentro do limite'],
    ['STATUS_CREDITO','BLOQUEADO','Emissão bloqueada'],
    ['STATUS_LOGISTICO','COTADA','Frete cotado'],
    ['STATUS_LOGISTICO','RESERVADA','Valor reservado'],
    ['STATUS_LOGISTICO','PEDIDO_CRIADO','Pedido criado na SuperFrete'],
    ['STATUS_LOGISTICO','EMITIDA','Etiqueta emitida'],
    ['STATUS_LOGISTICO','CANCELADA','Etiqueta cancelada'],
    ['STATUS_FINANCEIRO','RESERVADA','Valor reservado'],
    ['STATUS_FINANCEIRO','EM_ABERTO','Debitado na conta do cliente'],
    ['STATUS_FINANCEIRO','EM_COBRANCA','Incluído em cobrança Pix'],
    ['STATUS_FINANCEIRO','PAGA','Pago/baixado'],
    ['COBRANCA_STATUS','AGUARDANDO_PAGAMENTO','Pix criado aguardando pagamento'],
    ['COBRANCA_STATUS','PAGA','Pagamento confirmado'],
    ['COBRANCA_STATUS','CANCELADA','Cobrança cancelada'],
    ['TIPO_DOCUMENTO','DCE','Declaração de Conteúdo Eletrônica'],
    ['TIPO_DOCUMENTO','NFE','Nota Fiscal Eletrônica'],
    ['ORIGEM_EMISSAO','PAINEL_ADMIN','Etiqueta gerada pela agência']
  ]);
}

function sfSeedAdmin_(sh) {
  const rows = sfReadObjectsFromSheet_(sh);
  if (rows.some(function (r) { return lower_(r.LOGIN) === lower_(SF.DEFAULTS.ADMIN_LOGIN); })) return;
  // Segurança: senha inicial ALEATÓRIA (nunca mais admin123 fixo).
  // O valor aparece UMA vez no log de execução; troque em seguida com
  // sfDefinirSenhaAdmin('novaSenha') se preferir uma senha sua.
  const senhaInicial = 'AGF-' + Utilities.getUuid().slice(0, 13);
  console.warn('[SF_BOOTSTRAP] Senha inicial do admin (anote e troque): ' + senhaInicial);
  sfAppendByHeadersToSheet_(sh, {
    USUARIO_ID: 'USR_ADMIN_001',
    TIPO_USUARIO: 'ADMIN',
    CLIENTE_ID: '',
    NOME: 'Administrador AGF',
    LOGIN: SF.DEFAULTS.ADMIN_LOGIN,
    SENHA_HASH: sfSha256_(senhaInicial),
    STATUS: 'ATIVO',
    PERMISSOES: 'ADMIN_MASTER',
    ULTIMO_LOGIN: '',
    CRIADO_EM: nowIso_(),
    ATUALIZADO_EM: nowIso_()
  });
}

/**
 * Troca a senha do admin do SuperFrete. Rodar direto no editor do
 * Apps Script: sfDefinirSenhaAdmin('minhaNovaSenhaForte')
 * Use também para corrigir instalações antigas que ficaram com admin123.
 */
function sfDefinirSenhaAdmin(novaSenha) {
  const senha = String(novaSenha || '').trim();
  if (senha.length < 8) throw new Error('Use uma senha com pelo menos 8 caracteres.');
  const ss = sfGetSs_();
  const sh = ss.getSheetByName(SF.SHEETS.USUARIOS);
  const rows = sfReadObjectsFromSheet_(sh);
  for (let i = 0; i < rows.length; i++) {
    if (lower_(rows[i].LOGIN) === lower_(SF.DEFAULTS.ADMIN_LOGIN)) {
      const headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getDisplayValues()[0];
      const colSenha = headers.indexOf('SENHA_HASH') + 1;
      const colAtu = headers.indexOf('ATUALIZADO_EM') + 1;
      if (colSenha < 1) throw new Error('Coluna SENHA_HASH não encontrada.');
      sh.getRange(rows[i]._row, colSenha).setValue(sfSha256_(senha));
      if (colAtu > 0) sh.getRange(rows[i]._row, colAtu).setValue(nowIso_());
      console.info('[SF] Senha do admin atualizada.');
      return 'OK';
    }
  }
  throw new Error('Usuário admin não encontrado na aba ' + SF.SHEETS.USUARIOS + '.');
}

function sfSeedClienteExemplo_(ss) {
  const clientes = ss.getSheetByName(SF.SHEETS.CLIENTES);
  const remetentes = ss.getSheetByName(SF.SHEETS.REMETENTES);
  const contas = ss.getSheetByName(SF.SHEETS.CONTAS);
  const usuarios = ss.getSheetByName(SF.SHEETS.USUARIOS);

  if (!sfReadObjectsFromSheet_(clientes).some(function (r) { return r.CLIENTE_ID === 'CLI_EXEMPLO'; })) {
    sfAppendByHeadersToSheet_(clientes, {
      CLIENTE_ID: 'CLI_EXEMPLO',
      STATUS: 'ATIVO',
      NOME_EXIBICAO: 'Cliente Exemplo',
      RAZAO_SOCIAL: 'Cliente Exemplo LTDA',
      DOCUMENTO: '12345678000199',
      EMAIL: 'cliente@exemplo.com.br',
      TELEFONE: '85999999999',
      OBS_INTERNA: 'Linha exemplo; substituir por dados reais',
      CRIADO_EM: nowIso_(),
      ATUALIZADO_EM: nowIso_()
    });
  }

  if (!sfReadObjectsFromSheet_(remetentes).some(function (r) { return r.REMETENTE_ID === 'REM_EXEMPLO'; })) {
    sfAppendByHeadersToSheet_(remetentes, {
      REMETENTE_ID: 'REM_EXEMPLO',
      CLIENTE_ID: 'CLI_EXEMPLO',
      STATUS: 'ATIVO',
      NOME_REMETENTE: 'Cliente Exemplo',
      RAZAO_SOCIAL: 'Cliente Exemplo LTDA',
      CNPJ_CPF: '12345678000199',
      EMAIL: 'cliente@exemplo.com.br',
      TELEFONE: '85999999999',
      CEP: '60000000',
      ENDERECO: 'Rua Exemplo',
      NUMERO: '100',
      BAIRRO: 'Centro',
      CIDADE: 'Fortaleza',
      UF: 'CE',
      PADRAO: 'SIM',
      CRIADO_EM: nowIso_(),
      ATUALIZADO_EM: nowIso_()
    });
  }

  if (!sfReadObjectsFromSheet_(contas).some(function (r) { return r.CLIENTE_ID === 'CLI_EXEMPLO'; })) {
    sfAppendByHeadersToSheet_(contas, {
      CLIENTE_ID: 'CLI_EXEMPLO',
      LIMITE_CREDITO: SF.DEFAULTS.LIMITE_CLIENTE_EXEMPLO,
      SALDO_CONTA: 0,
      VALOR_RESERVADO: 0,
      DISPONIVEL_EMISSAO: SF.DEFAULTS.LIMITE_CLIENTE_EXEMPLO,
      STATUS_CREDITO: 'ATIVO',
      BLOQUEAR_EMISSAO: 'NAO',
      ATUALIZADO_EM: nowIso_()
    });
  }

  if (!sfReadObjectsFromSheet_(usuarios).some(function (r) { return lower_(r.LOGIN) === lower_(SF.DEFAULTS.CLIENTE_EXEMPLO_LOGIN); })) {
    sfAppendByHeadersToSheet_(usuarios, {
      USUARIO_ID: 'USR_CLIENTE_EXEMPLO',
      TIPO_USUARIO: 'CLIENTE',
      CLIENTE_ID: 'CLI_EXEMPLO',
      NOME: 'Cliente Exemplo',
      LOGIN: SF.DEFAULTS.CLIENTE_EXEMPLO_LOGIN,
      SENHA_HASH: sfSha256_(SF.DEFAULTS.CLIENTE_EXEMPLO_PASSWORD),
      STATUS: 'ATIVO',
      PERMISSOES: 'CLIENTE',
      CRIADO_EM: nowIso_(),
      ATUALIZADO_EM: nowIso_()
    });
  }
}
