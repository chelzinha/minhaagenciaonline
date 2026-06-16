// ============================================================
//  PAINEL POSTAGENS — AGF JOSÉ BONIFÁCIO
//  Backend Apps Script v18 — detecção robusta de payload + tipo exclusivo do atendimento
// ============================================================

const CONFIG = {
  SPREADSHEET_ID: '1fltKs2wJVZg7IU8pJX_cej0Jsrtk_T5CuHsfssw17ZI',
  SHEET_NAME: 'Postagens',
  PROP_KEY_SS_ID: 'SS_ID',
  TZ: 'America/Fortaleza',
  CREATE_BACKUP_ON_STRUCTURE_CHANGE: true,
  // A recuperação automática foi desativada no carregamento normal.
  // A planilha já foi reparada; manter a varredura de backups em toda abertura
  // deixava a leitura lenta. A função manual continua disponível.
  AUTO_REPAIR_RENAMED_FIELDS_FROM_BACKUP: false,
  // Para máxima velocidade, o painel usa as larguras padrão abaixo em vez de
  // consultar largura e visibilidade de cada coluna individualmente no Sheets.
  READ_SHEET_COLUMN_UI_METADATA: false,
};

// Ordem canônica solicitada. Esta ordem será mantida na planilha e no painel.
const FIELD_DEFS = [
  ['dtAtendimento', 'Data'],
  ['idAtendente', 'Atendente'],
  ['codObjeto', 'Objeto'],
  ['codigoAtendimento', 'codigo'],
  ['descricaoAtendimento', 'descricao'],
  ['categoria', 'Categoria'],
  ['contrato', 'Contrato'],
  ['cartaoPostagem', 'Cartão Postagem'],
  ['rem_nome', 'Remetente'],
  ['rem_documento', 'Rem. Documento'],
  ['valorPostagem', 'Valor'],
  ['formaPagamento', 'Forma Pagamento'],
  ['peso', 'Peso (kg)'],
  ['largura', 'Larg. (cm)'],
  ['comprimento', 'Comp. (cm)'],
  ['altura', 'Alt. (cm)'],
  ['diametro', 'Diâm. (cm)'],
  ['valorDeclarado', 'VD'],
  ['formato', 'Formato'],
  ['rem_cep', 'Rem. CEP'],
  ['rem_logradouro', 'Rem. Logradouro'],
  ['rem_numero', 'Rem. Número'],
  ['rem_complemento', 'Rem. Comp'],
  ['rem_bairro', 'Rem. Bairro'],
  ['rem_cidade', 'Rem. Cidade'],
  ['rem_uf', 'Rem. UF'],
  ['rem_telefone', 'Rem. Telefone'],
  ['dest_nome', 'Dest. Nome'],
  ['dest_documento', 'Dest. Documento'],
  ['dest_cep', 'Dest. CEP'],
  ['dest_logradouro', 'Dest. Logradouro'],
  ['dest_numero', 'Dest. Número'],
  ['dest_complemento', 'Dest. Complemento'],
  ['dest_bairro', 'Dest. Bairro'],
  ['dest_cidade', 'Dest. Cidade'],
  ['dest_uf', 'Dest. UF'],
  ['origem', 'Tipo Postagem'],
  ['statusDesc', 'Status'],
  ['dtPrevista', 'Prev. Entrega'],
  // Campos adicionais do JSON de ATENDIMENTO.
  // Mantidos ao final com rótulos em camelCase para não colidir com
  // as colunas já existentes "Tipo Postagem" e "Forma Pagamento".
  ['tipoAtendimento', 'tipo'],
  ['formaPagamentoAtendimento', 'formaPagamento'],
];

const HEADERS = FIELD_DEFS.map(row => row[0]);
const HEADER_LABELS = FIELD_DEFS.map(row => row[1]);

// Mapeamento completo dos cabeçalhos já usados em versões anteriores.
// A chave é o nome final exibido na planilha/painel.
// A lista inclui nomes antigos, nomes compactos e chaves técnicas.
// Isso impede perda de dados ao alternar entre versões do backend.
const SOURCE_ALIASES = {
  'Data': ['Dt. Atendimento', 'dtAtendimento'],
  'Atendente': ['ID Atendente', 'idCorreiosAtendente', 'idAtendente'],
  'Objeto': ['Código Objeto', 'codObjeto'],
  'codigo': ['codigoAtendimento', 'tipoPostal_codigo', 'tipoPostalCodigo', 'codigoTipoPostal'],
  'descricao': ['descricaoAtendimento', 'tipoPostal_descricao', 'tipoPostalDescricao', 'descricaoTipoPostal'],
  'Categoria': ['categoria'],
  'Contrato': ['contrato'],
  'Cartão Postagem': ['cartaoPostagem'],
  'Remetente': ['Rem. Nome', 'rem_nome'],
  'Rem. Documento': ['rem_documento'],
  'Valor': ['Valor Postagem (R$)', 'valorPostagem'],
  'Forma Pagamento': ['formaPagamento'],
  'Peso (kg)': ['peso'],
  'Larg. (cm)': ['largura'],
  'Comp. (cm)': ['comprimento'],
  'Alt. (cm)': ['altura'],
  'Diâm. (cm)': ['diametro'],
  'VD': ['Valor Declarado (R$)', 'valorDeclarado'],
  'Formato': ['formato'],
  'Rem. CEP': ['rem_cep'],
  'Rem. Logradouro': ['rem_logradouro'],
  'Rem. Número': ['rem_numero'],
  'Rem. Comp': ['Rem. Complemento', 'rem_complemento'],
  'Rem. Bairro': ['rem_bairro'],
  'Rem. Cidade': ['rem_cidade'],
  'Rem. UF': ['rem_uf'],
  'Rem. Telefone': ['rem_telefone'],
  'Dest. Nome': ['dest_nome'],
  'Dest. Documento': ['dest_documento'],
  'Dest. CEP': ['dest_cep'],
  'Dest. Logradouro': ['dest_logradouro'],
  'Dest. Número': ['dest_numero'],
  'Dest. Complemento': ['dest_complemento'],
  'Dest. Bairro': ['dest_bairro'],
  'Dest. Cidade': ['dest_cidade'],
  'Dest. UF': ['dest_uf'],
  'Tipo Postagem': ['Tipo', 'Origem', 'origem'],
  'Status': ['statusDesc'],
  'Prev. Entrega': ['dtPrevista'],
  // Novas colunas finais. "formaPagamento" pode reaproveitar dados históricos
  // da coluna visual antiga "Forma Pagamento", pois ambas têm a mesma origem.
  // "tipo" não recebe alias de "Tipo" nem de "Tipo Postagem": são conceitos diferentes.
  'tipo': ['tipoAtendimento'],
  'formaPagamento': ['formaPagamentoAtendimento', 'Forma Pagamento'],
};

const CRITICAL_HEADERS = ['Objeto', 'Remetente', 'Rem. Documento', 'Dest. Documento', 'Status'];

const COLUMN_WIDTHS = {
  'Data': 145,
  'Atendente': 145,
  'Objeto': 155,
  'codigo': 88,
  'descricao': 185,
  'Categoria': 120,
  'Contrato': 112,
  'Cartão Postagem': 125,
  'Remetente': 215,
  'Rem. Documento': 140,
  'Valor': 145,
  'Forma Pagamento': 145,
  'Peso (kg)': 88,
  'Larg. (cm)': 88,
  'Comp. (cm)': 92,
  'Alt. (cm)': 82,
  'Diâm. (cm)': 90,
  'VD': 145,
  'Formato': 105,
  'Rem. CEP': 95,
  'Rem. Logradouro': 210,
  'Rem. Número': 100,
  'Rem. Comp': 150,
  'Rem. Bairro': 150,
  'Rem. Cidade': 145,
  'Rem. UF': 70,
  'Rem. Telefone': 135,
  'Dest. Nome': 215,
  'Dest. Documento': 140,
  'Dest. CEP': 95,
  'Dest. Logradouro': 210,
  'Dest. Número': 100,
  'Dest. Complemento': 150,
  'Dest. Bairro': 150,
  'Dest. Cidade': 145,
  'Dest. UF': 70,
  'Tipo Postagem': 125,
  'Status': 230,
  'Prev. Entrega': 120,
  'tipo': 205,
  'formaPagamento': 155,
};

const TEXT_COLUMNS = new Set([
  'Atendente', 'Objeto', 'codigo', 'Contrato', 'Cartão Postagem',
  'Rem. Documento', 'Rem. CEP', 'Rem. Número', 'Rem. Telefone',
  'Dest. Documento', 'Dest. CEP', 'Dest. Número',
  'tipo', 'formaPagamento',
]);

// ============================================================
//  ENTRY POINT
// ============================================================
function doGet() {
  return HtmlService
    .createHtmlOutputFromFile('Index')
    .setTitle('Postagens — AGF José Bonifácio')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// ============================================================
//  AÇÃO MANUAL OPCIONAL: NORMALIZAR A ESTRUTURA DA ABA
// ============================================================
function aplicarEstruturaFinal() {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
    const sheet = getSheet();
    const result = normalizeSheetStructure_(sheet);
    return { ok: true, ...result, ...buscarDadosPayload_() };
  } catch (err) {
    return { ok: false, error: err.message || String(err) };
  } finally {
    try { lock.releaseLock(); } catch (_) {}
  }
}

// ============================================================
//  PROCESSAR JSON DE POSTAGEM
// ============================================================
function processarEBuscar(jsonString) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
    const records = extrairRegistrosDoJsonPostagem_(jsonString);
    validarRegistrosExtraidos_(records);
    const result = gravarNaPlanilha(records);
    return { ok: true, ...result, total: records.length, ...buscarDadosPayload_() };
  } catch (err) {
    return { ok: false, error: err.message || String(err) };
  } finally {
    try { lock.releaseLock(); } catch (_) {}
  }
}

// ============================================================
//  EXTRAÇÃO E VALIDAÇÃO PRÉVIA DO JSON DE POSTAGEM
// ============================================================
function extrairRegistrosDoJsonPostagem_(jsonString) {
  const roots = parseJsonRoots_(jsonString);
  validarRootsSemErro_(roots, 'postagem');

  const itens = collectPayloadItems_(roots, 'postagem');
  if (!itens.length) {
    if (collectPayloadItems_(roots, 'atendimento').length) {
      throw new Error(
        'Foi detectado um JSON de atendimento no campo de postagem. ' +
        'Cole esse conteúdo em "JSON de atendimento" e clique em "Enriquecer".'
      );
    }
    throw new Error(
      'Nenhuma lista de postagens foi encontrada no JSON. ' +
      'O sistema procurou itens/objetos de postagem em toda a estrutura recebida.'
    );
  }

  const records = [];
  itens.forEach(item => {
    const ac = isObj(item.acoletar) ? item.acoletar : null;
    const col = isObj(item.coletado) ? item.coletado : null;
    const itemDiretoTemObjeto = firstText_(item.codObjeto, item.codigoObjeto).trim();
    const obj = (!ac && !col && itemDiretoTemObjeto) ? item : null;
    if (ac) records.push(extrairRegistro(ac, 'A Coletar', item));
    if (col) records.push(extrairRegistro(col, 'Coletado', item));
    if (obj) records.push(extrairRegistro(obj, 'Rastreamento', item));
  });

  if (!records.length) {
    throw new Error(
      'A lista de postagem foi localizada, mas nenhum objeto rastreável pôde ser extraído. ' +
      'Verifique se os itens possuem acoletar, coletado, codObjeto ou codigoObjeto.'
    );
  }
  return records;
}

// Pode ser executada manualmente no editor para conferir um JSON real sem
// escrever nenhuma linha. Retorna uma prévia já com os títulos visíveis.
function validarJsonPostagemSemGravar(jsonString) {
  try {
    const records = extrairRegistrosDoJsonPostagem_(jsonString);
    validarRegistrosExtraidos_(records);
    const previews = records.map(record => {
      const row = HEADERS.map(key => record[key] ?? '');
      validarLinhasAntesDeInserir_([record], [row]);
      const preview = {};
      HEADER_LABELS.forEach((label, index) => { preview[label] = row[index]; });
      return preview;
    });
    return { ok: true, total: previews.length, previews: previews.slice(0, 10) };
  } catch (err) {
    return { ok: false, error: err.message || String(err) };
  }
}

// ============================================================
//  PROCESSAR JSON DE ATENDIMENTO
// ============================================================
function processarAtendimentos(jsonString) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
    const atendimentos = extrairAtendimentosDoJson_(jsonString);

    const mapaAt = {};
    atendimentos.forEach(at => {
      const formaPagamentoDoAtendimento = Array.isArray(at.pagamentos) && at.pagamentos[0]
        ? safe(at.pagamentos[0].formaPagamento).trim()
        : '';

      const base = {
        // Salva como Date real na planilha. O formato visual é aplicado pela coluna Data.
        dtAtendimento: parseDateTimeValue_(at.dataHoraAtual) || '',
        // Campo solicitado no painel: Atendente recebe idCorreiosAtendente.
        idAtendente: safe(at.idCorreiosAtendente).trim(),
        // Coluna antiga preservada por compatibilidade.
        formaPagamento: formaPagamentoDoAtendimento,
        // Novas colunas finais: fontes explícitas do JSON de ATENDIMENTO.
        tipoAtendimento: safe(at.tipo).trim(),
        formaPagamentoAtendimento: formaPagamentoDoAtendimento,
      };

      (Array.isArray(at.itens) ? at.itens : []).forEach(item => {
        const codObjeto = normalizeObjectCode_(item.codigoObjeto);
        if (!codObjeto) return;
        mapaAt[codObjeto] = {
          ...base,
          valorPostagem: item.valor != null ? item.valor : (at.valorTotal || 0),
          // Fonte autoritativa solicitada: item do JSON de atendimento.
          // Ex.: item.codigo = "03301" e item.descricao = "PAC REVERSO".
          codigoAtendimento: safe(item.codigo).trim(),
          descricaoAtendimento: safe(item.descricao).trim(),
        };
      });
    });

    const sheet = getSheet();
    normalizeSheetStructure_(sheet);
    const matrix = readSheetMatrix_(sheet);
    if (!matrix.rows.length) {
      return { ok: true, updated: 0, notFound: 0, notFoundList: [], total: 0, ...buscarDadosPayload_() };
    }

    const codIdx = matrix.indexByHeader['Objeto'];
    if (codIdx == null) throw new Error('Coluna "Objeto" não encontrada na planilha.');

    const rowByCod = new Map();
    matrix.rows.forEach((row, index) => {
      const codObjeto = normalizeObjectCode_(row[codIdx]);
      if (codObjeto) rowByCod.set(codObjeto, index);
    });

    const campos = [
      ['Data', 'dtAtendimento'],
      ['Atendente', 'idAtendente'],
      ['codigo', 'codigoAtendimento'],
      ['descricao', 'descricaoAtendimento'],
      ['Valor', 'valorPostagem'],
      ['Forma Pagamento', 'formaPagamento'],
      // Novas colunas ao final do painel. A coluna final "tipo" recebe SOMENTE at.tipo.
      ['tipo', 'tipoAtendimento'],
      ['formaPagamento', 'formaPagamentoAtendimento'],
    ];

    let updated = 0;
    const notFoundList = [];
    const changedRowIndexes = new Set();
    Object.keys(mapaAt).forEach(codObjeto => {
      const rowIndex = rowByCod.get(codObjeto);
      if (rowIndex == null) {
        notFoundList.push(codObjeto);
        return;
      }
      campos.forEach(([label, key]) => {
        const colIndex = matrix.indexByHeader[label];
        if (colIndex == null) return;
        const value = mapaAt[codObjeto][key] ?? '';
        // codigo e descricao têm fonte autoritativa no item de atendimento,
        // mas um item incompleto não deve apagar um valor já preenchido.
        if ((key === 'codigoAtendimento' || key === 'descricaoAtendimento') && !isMeaningful_(value)) return;
        matrix.rows[rowIndex][colIndex] = value;
      });
      changedRowIndexes.add(rowIndex);
      updated++;
    });

    if (changedRowIndexes.size) {
      writeChangedRowsInBlocks_(sheet, matrix.rows, changedRowIndexes, matrix.headers.length);
    }

    return {
      ok: true,
      updated,
      notFound: notFoundList.length,
      notFoundList,
      total: Object.keys(mapaAt).length,
      ...buscarDadosPayload_(),
    };
  } catch (err) {
    return { ok: false, error: err.message || String(err) };
  } finally {
    try { lock.releaseLock(); } catch (_) {}
  }
}

// ============================================================
//  LEITURA PARA O FRONT
// ============================================================
function buscarDados() {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
    return { ok: true, ...buscarDadosPayload_() };
  } catch (err) {
    return { ok: false, error: err.message || String(err) };
  } finally {
    try { lock.releaseLock(); } catch (_) {}
  }
}

function buscarDadosPayload_() {
  const sheet = getSheet();
  normalizeSheetStructure_(sheet);

  // A autorrecuperação deixou de rodar em cada abertura. Ela continua
  // disponível manualmente em corrigirMapeamentoERestaurarDados().
  const matrix = readSheetMatrix_(sheet);
  const columns = buildColumns_(matrix.headers, sheet);
  const rows = matrix.rows.map(row => {
    const obj = {};
    matrix.headers.forEach((header, index) => {
      obj[header] = formatCell_(row[index], header);
    });
    return obj;
  });
  return { rows, columns };
}

function lerPlanilha() {
  return buscarDadosPayload_().rows;
}

// ============================================================
//  EXTRAIR REGISTRO DE POSTAGEM
// ============================================================
function extrairRegistro(ac, origem, itemPai) {
  const pai = isObj(itemPai) ? itemPai : {};
  const eventos = firstArray_(ac.eventos, pai.eventos);
  const eventoPostagem = eventos.find(evento => evento && evento.codigo === 'PO')
    || eventos.find(evento => isObj(evento) && (evento.remetente || evento.destinatario))
    || eventos.find(evento => isObj(evento))
    || {};

  // Algumas respostas trazem os dados pessoais dentro do evento PO;
  // outras os repetem diretamente no objeto coletado. O fallback evita
  // que uma variação de estrutura gere linha vazia silenciosamente.
  const remetente = firstObject_(eventoPostagem.remetente, ac.remetente, pai.remetente);
  const destinatario = firstObject_(eventoPostagem.destinatario, ac.destinatario, pai.destinatario);
  const enderecoRemetente = firstObject_(remetente.endereco, ac.enderecoRemetente, pai.enderecoRemetente);
  const enderecoDestinatario = firstObject_(destinatario.endereco, ac.enderecoDestinatario, pai.enderecoDestinatario);
  const telefoneObj = firstObject_(
    firstArray_(remetente.telefones)[0],
    remetente.telefone,
    ac.telefoneRemetente,
    pai.telefoneRemetente
  );
  const telefone = telefoneObj
    ? firstText_(
        telefoneObj.numeroCompleto,
        `${firstText_(telefoneObj.ddd)}${firstText_(telefoneObj.numero)}`
      )
    : firstText_(remetente.telefone, ac.telefoneRemetente, pai.telefoneRemetente);
  const servico = firstObject_(ac.servico, pai.servico);
  const tipoPostal = firstObject_(ac.tipoPostal, pai.tipoPostal);

  return {
    dtAtendimento: '',
    idAtendente: '',
    codObjeto: firstText_(ac.codObjeto, ac.codigoObjeto, pai.codObjeto, pai.codigoObjeto).trim(),
    // codigo e descricao NÃO vêm do JSON de postagem.
    // Eles são preenchidos posteriormente pelo JSON de atendimento,
    // item a item, cruzando item.codigoObjeto com Objeto.
    codigoAtendimento: '',
    descricaoAtendimento: '',
    categoria: firstText_(tipoPostal.categoria, ac.categoria, pai.categoria),
    contrato: firstText_(ac.contrato, pai.contrato),
    cartaoPostagem: firstText_(ac.cartaoPostagem, pai.cartaoPostagem),
    rem_nome: firstText_(remetente.nome, remetente.nomeRazaoSocial, remetente.razaoSocial).trim(),
    rem_documento: firstText_(remetente.documento, remetente.cpfCnpj, remetente.cpf, remetente.cnpj).trim(),
    valorPostagem: '',
    formaPagamento: '',
    peso: firstNumber_(ac.peso, pai.peso),
    largura: firstNumber_(ac.largura, pai.largura),
    comprimento: firstNumber_(ac.comprimento, pai.comprimento),
    altura: firstNumber_(ac.altura, pai.altura),
    diametro: firstNumber_(ac.diametro, pai.diametro),
    valorDeclarado: parseBRNumber_(firstText_(servico.vd, ac.valorRecebido, pai.valorRecebido, '0')),
    formato: firstText_(ac.formato, pai.formato),
    rem_cep: firstText_(enderecoRemetente.cep).trim(),
    rem_logradouro: firstText_(enderecoRemetente.logradouro, enderecoRemetente.endereco).trim(),
    rem_numero: firstText_(enderecoRemetente.numero).trim(),
    rem_complemento: firstText_(enderecoRemetente.complemento).trim(),
    rem_bairro: firstText_(enderecoRemetente.bairro).trim(),
    rem_cidade: firstText_(enderecoRemetente.cidade, enderecoRemetente.municipio).trim(),
    rem_uf: firstText_(enderecoRemetente.uf).trim(),
    rem_telefone: formatPhone_(telefone),
    dest_nome: firstText_(destinatario.nome, destinatario.nomeRazaoSocial, destinatario.razaoSocial).trim(),
    dest_documento: firstText_(destinatario.documento, destinatario.cpfCnpj, destinatario.cpf, destinatario.cnpj).trim(),
    dest_cep: firstText_(enderecoDestinatario.cep).trim(),
    dest_logradouro: firstText_(enderecoDestinatario.logradouro, enderecoDestinatario.endereco).trim(),
    dest_numero: firstText_(enderecoDestinatario.numero).trim(),
    dest_complemento: firstText_(enderecoDestinatario.complemento).trim(),
    dest_bairro: firstText_(enderecoDestinatario.bairro).trim(),
    dest_cidade: firstText_(enderecoDestinatario.cidade, enderecoDestinatario.municipio).trim(),
    dest_uf: firstText_(enderecoDestinatario.uf).trim(),
    origem,
    statusDesc: firstText_(eventoPostagem.descricao, ac.statusDesc, ac.status, ac.descricao, pai.statusDesc, pai.status),
    dtPrevista: firstText_(ac.dtPrevista, pai.dtPrevista).substring(0, 10),
    // Preenchidos exclusivamente pelo JSON de ATENDIMENTO.
    tipoAtendimento: '',
    formaPagamentoAtendimento: '',
  };
}

function validarRegistrosExtraidos_(records) {
  const invalidos = [];
  records.forEach((record, index) => {
    const codObjeto = normalizeObjectCode_(record.codObjeto);
    if (!codObjeto) invalidos.push(`#${index + 1}: Objeto`);
    // Mantém o código SRO padronizado antes de qualquer comparação ou gravação.
    record.codObjeto = codObjeto;
  });

  if (invalidos.length) {
    throw new Error(
      'Importação cancelada antes de gravar: o JSON não forneceu o campo obrigatório Objeto em ' +
      `${invalidos.length} registro(s). Verifique a estrutura recebida. ` +
      invalidos.slice(0, 8).join(' | ') +
      (invalidos.length > 8 ? ' | ...' : '')
    );
  }
}

// ============================================================
//  GRAVAR NA PLANILHA — ANTI-DUPLICATA
// ============================================================
function gravarNaPlanilha(records) {
  const sheet = getSheet();
  normalizeSheetStructure_(sheet);
  const matrix = readSheetMatrix_(sheet);
  const codIdx = matrix.indexByHeader['Objeto'];
  if (codIdx == null) throw new Error('Coluna "Objeto" não encontrada na planilha.');

  // Compara códigos normalizados para impedir duplicidade mesmo quando o JSON
  // trouxer espaços extras ou diferença entre letras maiúsculas e minúsculas.
  // codigo e descricao NÃO são atualizados aqui: a fonte autoritativa é o
  // JSON de atendimento, processado exclusivamente em processarAtendimentos().
  const objectCodes = new Set();
  matrix.rows.forEach(row => {
    const objectCode = normalizeObjectCode_(row[codIdx]);
    if (objectCode) objectCodes.add(objectCode);
  });

  const vistosNoLote = new Set();
  const novos = [];
  let duplicateExisting = 0;
  let duplicatePayload = 0;

  records.forEach(record => {
    const codObjeto = normalizeObjectCode_(record.codObjeto);
    record.codObjeto = codObjeto;

    // A validação anterior já bloqueia objeto vazio. Esta checagem permanece
    // como proteção defensiva caso a função seja chamada isoladamente.
    if (!codObjeto) return;

    // Evita duas linhas para o mesmo SRO dentro do próprio JSON.
    if (vistosNoLote.has(codObjeto)) {
      duplicatePayload++;
      return;
    }
    vistosNoLote.add(codObjeto);

    // Evita nova linha se o SRO já estiver na planilha.
    if (objectCodes.has(codObjeto)) {
      duplicateExisting++;
      return;
    }

    novos.push(record);
    objectCodes.add(codObjeto);
  });

  const skipped = duplicateExisting + duplicatePayload;

  if (!headersMatch_(matrix.headers, HEADER_LABELS)) {
    throw new Error('Estrutura da aba divergente após normalização. A gravação foi cancelada por segurança.');
  }

  if (novos.length) {
    // A aba é normalizada imediatamente antes da inserção. Por isso, a nova
    // linha é escrita pelas chaves técnicas estáveis e pela ordem canônica,
    // sem depender do texto exibido no cabeçalho.
    const rows = novos.map(record => HEADERS.map(key => record[key] ?? ''));
    validarLinhasAntesDeInserir_(novos, rows);
    sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, HEADER_LABELS.length).setValues(rows);
    SpreadsheetApp.flush();
  }

  return {
    added: novos.length,
    skipped,
    duplicateExisting,
    duplicatePayload,
  };
}

function validarLinhasAntesDeInserir_(records, rows) {
  const objectIndex = HEADERS.indexOf('codObjeto');

  rows.forEach((row, index) => {
    const codObjeto = normalizeObjectCode_(row[objectIndex]);
    if (!codObjeto) {
      throw new Error(
        `Gravação cancelada: o registro ${index + 1} perderia o campo obrigatório Objeto. ` +
        `Código técnico recebido: ${safe(records[index].codObjeto) || '(vazio)'}.`
      );
    }
    row[objectIndex] = codObjeto;
  });
}

// Escreve somente as linhas alteradas, agrupando índices consecutivos.
// Evita regravar toda a planilha ao enriquecer poucos objetos.
function writeChangedRowsInBlocks_(sheet, rows, changedRowIndexes, columnCount) {
  const indexes = Array.from(changedRowIndexes).sort((a, b) => a - b);
  if (!indexes.length) return;

  let start = indexes[0];
  let previous = indexes[0];
  const flushBlock = end => {
    const block = rows.slice(start, end + 1);
    sheet.getRange(start + 2, 1, block.length, columnCount).setValues(block);
  };

  for (let index = 1; index < indexes.length; index++) {
    const current = indexes[index];
    if (current === previous + 1) {
      previous = current;
      continue;
    }
    flushBlock(previous);
    start = current;
    previous = current;
  }
  flushBlock(previous);
  SpreadsheetApp.flush();
}

// ============================================================
//  NORMALIZAÇÃO MANUAL DA COLUNA DATA — EXECUTAR UMA ÚNICA VEZ
// ============================================================
function padronizarColunaData() {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
    const sheet = getSheet();
    normalizeSheetStructure_(sheet);

    const lastRow = sheet.getLastRow();
    const dataColumn = HEADER_LABELS.indexOf('Data') + 1;
    if (!dataColumn) throw new Error('Coluna "Data" não encontrada.');

    if (lastRow < 2) {
      return { ok: true, updated: 0, invalid: 0, invalidRows: [], backupSheetName: '' };
    }

    const range = sheet.getRange(2, dataColumn, lastRow - 1, 1);
    const values = range.getValues();
    const normalized = [];
    const invalidRows = [];
    let updated = 0;

    values.forEach((row, index) => {
      const original = row[0];
      if (!isMeaningful_(original)) {
        normalized.push(['']);
        return;
      }

      const parsed = parseDateTimeValue_(original);
      if (!parsed) {
        normalized.push([original]);
        invalidRows.push(index + 2);
        return;
      }

      normalized.push([parsed]);
      updated++;
    });

    const backupSheetName = updated ? backupSheetBeforeMigration_(sheet) : '';
    if (updated) range.setValues(normalized);
    range.setNumberFormat('dd/MM/yyyy HH:mm');
    SpreadsheetApp.flush();

    return {
      ok: true,
      updated,
      invalid: invalidRows.length,
      invalidRows: invalidRows.slice(0, 30),
      backupSheetName,
    };
  } catch (err) {
    return { ok: false, error: err.message || String(err) };
  } finally {
    try { lock.releaseLock(); } catch (_) {}
  }
}

// ============================================================
//  LIMPEZA MANUAL DE LINHAS INVÁLIDAS GERADAS POR VERSÕES ANTERIORES
// ============================================================
// Não executa automaticamente. Use uma vez somente se existirem linhas sem
// Objeto criadas antes desta correção. A função cria backup antes de remover.
function removerLinhasInvalidasSemObjeto() {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
    const sheet = getSheet();
    normalizeSheetStructure_(sheet);
    const matrix = readSheetMatrix_(sheet);
    const objectIndex = matrix.indexByHeader['Objeto'];
    if (objectIndex == null) throw new Error('Coluna "Objeto" não encontrada.');

    const validRows = [];
    let removed = 0;
    matrix.rows.forEach(row => {
      const hasAnyContent = row.some(isMeaningful_);
      const hasObject = isMeaningful_(row[objectIndex]);
      if (hasAnyContent && !hasObject) {
        removed++;
        return;
      }
      validRows.push(row);
    });

    if (!removed) return { ok: true, removed: 0, message: 'Nenhuma linha inválida sem Objeto foi encontrada.' };

    const safetyBackup = backupSheetBeforeMigration_(sheet);
    writeCanonicalRows_(sheet, validRows, Math.max(sheet.getLastRow(), validRows.length + 1), HEADER_LABELS.length);
    return { ok: true, removed, safetyBackup };
  } catch (err) {
    return { ok: false, error: err.message || String(err) };
  } finally {
    try { lock.releaseLock(); } catch (_) {}
  }
}

// ============================================================
//  PLANILHA E MIGRAÇÃO SEGURA DO SCHEMA
// ============================================================
function getSheet() {
  const spreadsheet = getSpreadsheet();
  let sheet = spreadsheet.getSheetByName(CONFIG.SHEET_NAME);
  if (!sheet) {
    sheet = spreadsheet.insertSheet(CONFIG.SHEET_NAME);
    ensureGridWidth_(sheet, HEADER_LABELS.length);
    sheet.getRange(1, 1, 1, HEADER_LABELS.length).setValues([HEADER_LABELS]);
    applySheetFormatting_(sheet);
  }
  return sheet;
}

function getSpreadsheet() {
  if (CONFIG.SPREADSHEET_ID) return SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);

  const properties = PropertiesService.getScriptProperties();
  const savedId = properties.getProperty(CONFIG.PROP_KEY_SS_ID);
  if (savedId) {
    try { return SpreadsheetApp.openById(savedId); } catch (_) {}
  }

  const spreadsheet = SpreadsheetApp.create('Postagens — AGF José Bonifácio');
  properties.setProperty(CONFIG.PROP_KEY_SS_ID, spreadsheet.getId());
  return spreadsheet;
}

function getSpreadsheetUrl() {
  try {
    return { ok: true, url: getSpreadsheet().getUrl() };
  } catch (err) {
    return { ok: false, error: err.message || String(err) };
  }
}

function normalizeSheetStructure_(sheet) {
  const desiredHeaders = HEADER_LABELS;
  const currentLastRow = Math.max(sheet.getLastRow(), 1);
  const currentLastCol = Math.max(sheet.getLastColumn(), 1);
  const currentHeaders = sheet.getRange(1, 1, 1, currentLastCol).getValues()[0].map(safe);
  const isCanonical = headersMatch_(currentHeaders, desiredHeaders);

  // Se o schema já estiver correto, não reescreve dados nem formatação a cada carga.
  // Isso reduz escrita desnecessária e evita alterar larguras manualmente ajustadas na planilha.
  if (isCanonical) {
    return { migrated: false, backupSheetName: '' };
  }

  const oldRows = currentLastRow >= 2
    ? sheet.getRange(2, 1, currentLastRow - 1, currentLastCol).getValues()
    : [];
  const sourceIndexes = buildSourceIndexes_(currentHeaders);
  const normalizedRows = canonicalizeRows_(oldRows, sourceIndexes);

  // Bloqueio de segurança: uma migração nunca pode reduzir o preenchimento
  // dos campos canônicos que já existiam na origem.
  validateMigrationCoverage_(oldRows, normalizedRows, sourceIndexes);

  const backupSheetName = CONFIG.CREATE_BACKUP_ON_STRUCTURE_CHANGE
    ? backupSheetBeforeMigration_(sheet)
    : '';

  writeCanonicalRows_(sheet, normalizedRows, currentLastRow, currentLastCol);
  const sanitization = sanitizeTipoAtendimentoColumn_(sheet);
  return { migrated: true, backupSheetName, sanitization };
}


// ============================================================
//  SANITIZAÇÃO DA COLUNA FINAL tipo — JSON DE ATENDIMENTO
// ============================================================
// A coluna final "tipo" pertence exclusivamente ao JSON de atendimento:
//   at.tipo
//
// Em versões intermediárias, a proximidade visual entre "Tipo" e "tipo"
// poderia induzir preenchimento incorreto. Esta rotina remove somente valores
// claramente originados da classificação da postagem (A Coletar, Coletado ou
// Rastreamento). Valores válidos do atendimento, como AFATURAR, PRE_ATENDIMENTO
// e AFATURAR_AUTOMATIZADO, são preservados.
function sanitizeTipoAtendimentoColumn_(sheet) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return { cleaned: 0 };

  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(safe);
  const tipoAtendimentoIndex = headers.indexOf('tipo');
  const tipoPostagemIndex = headers.indexOf('Tipo Postagem');
  if (tipoAtendimentoIndex < 0) return { cleaned: 0 };

  const rows = sheet.getRange(2, 1, lastRow - 1, headers.length).getValues();
  const invalidPostingOrigins = new Set(['A COLETAR', 'COLETADO', 'RASTREAMENTO']);
  let cleaned = 0;

  rows.forEach(row => {
    const value = safe(row[tipoAtendimentoIndex]).trim();
    if (!value) return;
    const normalized = value.toUpperCase();
    const postingValue = tipoPostagemIndex >= 0 ? safe(row[tipoPostagemIndex]).trim().toUpperCase() : '';

    if (invalidPostingOrigins.has(normalized) || (postingValue && normalized === postingValue && invalidPostingOrigins.has(postingValue))) {
      row[tipoAtendimentoIndex] = '';
      cleaned++;
    }
  });

  if (cleaned) {
    sheet.getRange(2, 1, rows.length, headers.length).setValues(rows);
    SpreadsheetApp.flush();
  }
  return { cleaned };
}

// Execução manual opcional para conferir e limpar a coluna final "tipo".
// Cria backup somente quando encontra valores incorretos.
function corrigirColunaTipoAtendimento() {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
    const sheet = getSheet();
    normalizeSheetStructure_(sheet);

    const lastRow = sheet.getLastRow();
    if (lastRow < 2) return { ok: true, cleaned: 0, backupSheetName: '' };

    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(safe);
    const tipoAtendimentoIndex = headers.indexOf('tipo');
    if (tipoAtendimentoIndex < 0) throw new Error('Coluna final "tipo" não encontrada.');

    const values = sheet.getRange(2, tipoAtendimentoIndex + 1, lastRow - 1, 1).getValues();
    const invalidPostingOrigins = new Set(['A COLETAR', 'COLETADO', 'RASTREAMENTO']);
    const hasInvalid = values.some(([value]) => invalidPostingOrigins.has(safe(value).trim().toUpperCase()));
    if (!hasInvalid) return { ok: true, cleaned: 0, backupSheetName: '' };

    const backupSheetName = backupSheetBeforeMigration_(sheet);
    const result = sanitizeTipoAtendimentoColumn_(sheet);
    return { ok: true, cleaned: result.cleaned, backupSheetName };
  } catch (err) {
    return { ok: false, error: err.message || String(err) };
  } finally {
    try { lock.releaseLock(); } catch (_) {}
  }
}

// ============================================================
//  AUTORRECUPERAÇÃO DOS CAMPOS RENOMEADOS
// ============================================================
// A troca de cabeçalhos deve ser somente visual. Os registros continuam
// vinculados às chaves técnicas estáveis definidas em FIELD_DEFS.
//
// Esta rotina existe para reparar versões intermediárias que já apagaram
// conteúdo ao tentar renomear cabeçalhos. Ela:
// - só executa quando a coluna Objeto perdeu preenchimento;
// - busca o backup mais completo;
// - cruza as linhas por assinatura estável;
// - preenche apenas campos renomeados que estejam vazios;
// - cria backup da aba atual antes de escrever;
// - nunca sobrescreve valor preenchido.
const RENAMED_FIELDS_TO_REPAIR = [
  'Data', 'Atendente', 'Objeto', 'Remetente', 'Valor', 'VD', 'Rem. Comp',
];

function autoRepairRenamedFieldsFromBackups_(sheet) {
  const current = readCanonicalSnapshot_(sheet);
  const objectIndex = HEADER_LABELS.indexOf('Objeto');
  const senderIndex = HEADER_LABELS.indexOf('Remetente');
  const currentObjectCount = current.rows.reduce(
    (count, row) => count + (isMeaningful_(row[objectIndex]) ? 1 : 0),
    0
  );
  const currentSenderCount = current.rows.reduce(
    (count, row) => count + (isMeaningful_(row[senderIndex]) ? 1 : 0),
    0
  );

  // Todo registro de postagem precisa ter código de objeto e remetente.
  // Se não houve perda evidente, não lê backups nem escreve na planilha.
  if (
    !current.rows.length ||
    (currentObjectCount === current.rows.length && currentSenderCount === current.rows.length)
  ) {
    return { repaired: false, reason: 'integrity-ok' };
  }

  const spreadsheet = sheet.getParent();
  const backups = spreadsheet.getSheets()
    .filter(candidate => candidate.getName().startsWith(`${CONFIG.SHEET_NAME}_BACKUP_`))
    .map(readCanonicalSnapshot_)
    .filter(snapshot => snapshot.score > current.score)
    .sort(compareSnapshots_);

  if (!backups.length) {
    return { repaired: false, reason: 'no-better-backup' };
  }

  const best = backups[0];
  const merge = mergeRenamedFieldsFromBackup_(current.rows, best.rows);
  if (!merge.cellsFilled) {
    return { repaired: false, reason: 'no-safe-match', sourceBackup: best.sheetName };
  }

  const safetyBackup = backupSheetBeforeMigration_(sheet);
  writeCanonicalRows_(
    sheet,
    merge.rows,
    Math.max(sheet.getLastRow(), merge.rows.length + 1),
    Math.max(sheet.getLastColumn(), HEADER_LABELS.length)
  );

  const result = {
    repaired: true,
    sourceBackup: best.sheetName,
    safetyBackup,
    rowsTouched: merge.rowsTouched,
    cellsFilled: merge.cellsFilled,
    rowsWithoutSafeMatch: merge.rowsWithoutSafeMatch,
  };
  console.log('[AUTO-REPAIR] ' + JSON.stringify(result));
  return result;
}

function mergeRenamedFieldsFromBackup_(currentRows, backupRows) {
  const resultRows = currentRows.map(row => row.slice());
  const backupBySignature = buildUniqueBackupSignatureMap_(backupRows);
  const repairIndexes = RENAMED_FIELDS_TO_REPAIR.map(label => HEADER_LABELS.indexOf(label));
  let rowsTouched = 0;
  let cellsFilled = 0;
  let rowsWithoutSafeMatch = 0;

  resultRows.forEach((row, rowIndex) => {
    const signature = buildStableSignature_(row);
    let sourceIndex = -1;

    if (
      backupRows[rowIndex] &&
      signature &&
      signature === buildStableSignature_(backupRows[rowIndex])
    ) {
      sourceIndex = rowIndex;
    } else if (signature && backupBySignature.has(signature)) {
      sourceIndex = backupBySignature.get(signature);
    }

    if (sourceIndex < 0) {
      rowsWithoutSafeMatch++;
      return;
    }

    const source = backupRows[sourceIndex];
    let touched = false;
    repairIndexes.forEach(index => {
      if (index < 0) return;
      if (!isMeaningful_(row[index]) && isMeaningful_(source[index])) {
        row[index] = source[index];
        touched = true;
        cellsFilled++;
      }
    });
    if (touched) rowsTouched++;
  });

  return { rows: resultRows, rowsTouched, cellsFilled, rowsWithoutSafeMatch };
}

// ============================================================
//  RECUPERAÇÃO SEGURA DE DADOS APÓS MIGRAÇÃO INCOMPLETA
// ============================================================
// A autorrecuperação ocorre na primeira carga do painel.
// Para executar uma revisão manual completa, use:
//   corrigirMapeamentoERestaurarDados
//
// A rotina:
// 1) avalia todas as abas Postagens_BACKUP_*;
// 2) escolhe a versão mais completa;
// 3) cria um novo backup da aba operacional atual;
// 4) preenche somente células vazias usando correspondência segura;
// 5) preserva qualquer valor atual que já esteja preenchido.
function corrigirMapeamentoERestaurarDados() {
  return recuperarDadosPerdidosDoMelhorBackup();
}

function recuperarDadosPerdidosDoMelhorBackup() {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);

    const spreadsheet = getSpreadsheet();
    const sheet = getSheet();
    normalizeSheetStructure_(sheet);

    const current = readCanonicalSnapshot_(sheet);
    const backups = spreadsheet.getSheets()
      .filter(candidate => candidate.getName().startsWith(`${CONFIG.SHEET_NAME}_BACKUP_`))
      .map(readCanonicalSnapshot_)
      .sort(compareSnapshots_);

    if (!backups.length) {
      throw new Error('Nenhuma aba de backup foi encontrada.');
    }

    const best = backups[0];
    const before = summarizeSnapshot_(current);
    const bestSummary = summarizeSnapshot_(best);

    if (best.score <= current.score) {
      const result = {
        ok: true,
        recovered: false,
        message: 'A aba atual já está tão completa quanto o melhor backup encontrado.',
        current: before,
        bestBackup: bestSummary,
      };
      console.log(JSON.stringify(result, null, 2));
      return result;
    }

    const safetyBackup = backupSheetBeforeMigration_(sheet);
    const merge = mergeMissingValuesFromBackup_(current.rows, best.rows);
    writeCanonicalRows_(
      sheet,
      merge.rows,
      Math.max(sheet.getLastRow(), merge.rows.length + 1),
      Math.max(sheet.getLastColumn(), HEADER_LABELS.length)
    );

    const after = readCanonicalSnapshot_(sheet);
    const result = {
      ok: true,
      recovered: true,
      safetyBackup,
      sourceBackup: best.sheetName,
      rowsTouched: merge.rowsTouched,
      cellsFilled: merge.cellsFilled,
      rowsAppended: merge.rowsAppended,
      rowsWithoutSafeMatch: merge.rowsWithoutSafeMatch,
      before,
      after: summarizeSnapshot_(after),
    };

    console.log(JSON.stringify(result, null, 2));
    return result;
  } catch (err) {
    const result = { ok: false, error: err.message || String(err) };
    console.error(JSON.stringify(result, null, 2));
    return result;
  } finally {
    try { lock.releaseLock(); } catch (_) {}
  }
}

// Diagnóstico opcional: não altera a planilha.
function diagnosticarIntegridadePostagens() {
  try {
    const spreadsheet = getSpreadsheet();
    const sheet = getSheet();
    const current = readCanonicalSnapshot_(sheet);
    const backups = spreadsheet.getSheets()
      .filter(candidate => candidate.getName().startsWith(`${CONFIG.SHEET_NAME}_BACKUP_`))
      .map(readCanonicalSnapshot_)
      .sort(compareSnapshots_)
      .map(summarizeSnapshot_);

    const result = {
      ok: true,
      current: summarizeSnapshot_(current),
      backups,
    };
    console.log(JSON.stringify(result, null, 2));
    return result;
  } catch (err) {
    const result = { ok: false, error: err.message || String(err) };
    console.error(JSON.stringify(result, null, 2));
    return result;
  }
}

function readCanonicalSnapshot_(sheet) {
  const lastRow = sheet.getLastRow();
  const lastCol = Math.max(sheet.getLastColumn(), 1);
  const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(safe);
  const rawRows = lastRow >= 2
    ? sheet.getRange(2, 1, lastRow - 1, lastCol).getValues()
    : [];
  const sourceIndexes = buildSourceIndexes_(headers);
  const rows = canonicalizeRows_(rawRows, sourceIndexes);
  return {
    sheetName: sheet.getName(),
    rows,
    score: scoreCanonicalRows_(rows),
    counts: countCanonicalFields_(rows),
  };
}

function summarizeSnapshot_(snapshot) {
  return {
    sheetName: snapshot.sheetName,
    rows: snapshot.rows.length,
    score: snapshot.score,
    filled: snapshot.counts,
  };
}

function compareSnapshots_(a, b) {
  if (a.score !== b.score) return b.score - a.score;
  return b.sheetName.localeCompare(a.sheetName);
}

function mergeMissingValuesFromBackup_(currentRows, backupRows) {
  const resultRows = currentRows.map(row => row.slice());
  const backupBySignature = buildUniqueBackupSignatureMap_(backupRows);
  const usedBackupIndexes = new Set();
  let rowsTouched = 0;
  let cellsFilled = 0;
  let rowsWithoutSafeMatch = 0;

  resultRows.forEach((row, rowIndex) => {
    let sourceIndex = -1;
    const ownSignature = buildStableSignature_(row);

    // Primeiro tenta a mesma posição, pois as migrações preservam a ordem.
    if (backupRows[rowIndex] && ownSignature && ownSignature === buildStableSignature_(backupRows[rowIndex])) {
      sourceIndex = rowIndex;
    } else if (ownSignature && backupBySignature.has(ownSignature)) {
      sourceIndex = backupBySignature.get(ownSignature);
    }

    if (sourceIndex < 0) {
      rowsWithoutSafeMatch++;
      return;
    }

    const source = backupRows[sourceIndex];
    let touched = false;
    source.forEach((value, columnIndex) => {
      if (!isMeaningful_(row[columnIndex]) && isMeaningful_(value)) {
        row[columnIndex] = value;
        touched = true;
        cellsFilled++;
      }
    });

    if (touched) rowsTouched++;
    usedBackupIndexes.add(sourceIndex);
  });

  // Adiciona registros existentes no backup que desapareceram totalmente da aba atual.
  const currentObjects = new Set(
    resultRows
      .map(row => safe(row[HEADER_LABELS.indexOf('Objeto')]).trim())
      .filter(Boolean)
  );

  let rowsAppended = 0;
  backupRows.forEach((row, index) => {
    const objectCode = safe(row[HEADER_LABELS.indexOf('Objeto')]).trim();
    if (!objectCode || currentObjects.has(objectCode) || usedBackupIndexes.has(index)) return;
    resultRows.push(row.slice());
    currentObjects.add(objectCode);
    rowsAppended++;
  });

  return { rows: resultRows, rowsTouched, cellsFilled, rowsAppended, rowsWithoutSafeMatch };
}

function buildUniqueBackupSignatureMap_(rows) {
  const seen = new Map();
  const duplicates = new Set();

  rows.forEach((row, index) => {
    const signature = buildStableSignature_(row);
    if (!signature) return;
    if (seen.has(signature)) {
      duplicates.add(signature);
      return;
    }
    seen.set(signature, index);
  });

  duplicates.forEach(signature => seen.delete(signature));
  return seen;
}

function buildStableSignature_(row) {
  const labels = [
    'Categoria', 'Contrato', 'Cartão Postagem', 'Rem. Documento',
    'Peso (kg)', 'Larg. (cm)', 'Comp. (cm)', 'Alt. (cm)',
    'Dest. Documento', 'Dest. CEP', 'Dest. Logradouro',
    'Dest. Número', 'Status', 'Prev. Entrega',
  ];
  const values = labels.map(label => normalizeSignaturePart_(row[HEADER_LABELS.indexOf(label)]));
  return values.some(Boolean) ? values.join('|') : '';
}

function normalizeSignaturePart_(value) {
  return safe(value).trim().toLowerCase().replace(/\s+/g, ' ');
}

function scoreCanonicalRows_(rows) {
  const counts = countCanonicalFields_(rows);
  const totalFilled = Object.values(counts).reduce((sum, count) => sum + count, 0);
  return (
    (counts['Objeto'] || 0) * 1000000 +
    (counts['Remetente'] || 0) * 10000 +
    (counts['Rem. Documento'] || 0) * 100 +
    totalFilled
  );
}

function countCanonicalFields_(rows) {
  const counts = {};
  HEADER_LABELS.forEach(label => { counts[label] = 0; });
  rows.forEach(row => {
    row.forEach((value, index) => {
      if (isMeaningful_(value)) counts[HEADER_LABELS[index]]++;
    });
  });
  return counts;
}

function canonicalizeRows_(rows, sourceIndexes) {
  return rows.map(row => HEADER_LABELS.map(label => getCanonicalCellValue_(row, label, sourceIndexes)));
}

function validateMigrationCoverage_(sourceRows, normalizedRows, sourceIndexes) {
  HEADER_LABELS.forEach((label, index) => {
    const candidates = [label, ...(SOURCE_ALIASES[label] || [])];
    const sourceCount = sourceRows.reduce((count, row) => {
      const hasValue = candidates.some(candidate =>
        (sourceIndexes[candidate] || []).some(sourceIndex => isMeaningful_(row[sourceIndex]))
      );
      return count + (hasValue ? 1 : 0);
    }, 0);

    const normalizedCount = normalizedRows.reduce(
      (count, row) => count + (isMeaningful_(row[index]) ? 1 : 0),
      0
    );

    if (normalizedCount < sourceCount) {
      throw new Error(
        `Migração interrompida por segurança: o campo "${label}" perderia dados ` +
        `(${sourceCount} preenchidos na origem → ${normalizedCount} após normalização).`
      );
    }
  });
}

function writeCanonicalRows_(sheet, rows, previousLastRow, previousLastCol) {
  const rowCountToClear = Math.max(previousLastRow || 1, rows.length + 1, 1);
  const columnCountToClear = Math.max(previousLastCol || 1, HEADER_LABELS.length);

  ensureGridHeight_(sheet, rowCountToClear);
  ensureGridWidth_(sheet, columnCountToClear);
  sheet.getRange(1, 1, rowCountToClear, columnCountToClear).clearContent();
  sheet.getRange(1, 1, 1, HEADER_LABELS.length).setValues([HEADER_LABELS]);

  trimGridColumns_(sheet, HEADER_LABELS.length);
  applySheetFormatting_(sheet);

  if (rows.length) {
    sheet.getRange(2, 1, rows.length, HEADER_LABELS.length).setValues(rows);
  }

  SpreadsheetApp.flush();
}

function isMeaningful_(value) {
  return value !== '' && value !== null && value !== undefined;
}

function backupSheetBeforeMigration_(sheet) {
  const spreadsheet = sheet.getParent();
  const timestamp = Utilities.formatDate(new Date(), CONFIG.TZ, 'yyyyMMdd_HHmmss');
  let name = `${CONFIG.SHEET_NAME}_BACKUP_${timestamp}`;
  let suffix = 2;
  while (spreadsheet.getSheetByName(name)) {
    name = `${CONFIG.SHEET_NAME}_BACKUP_${timestamp}_${suffix++}`;
  }
  const backup = sheet.copyTo(spreadsheet).setName(name);
  backup.setTabColor('#94A3B8');
  return name;
}

function buildSourceIndexes_(headers) {
  const indexes = {};
  headers.forEach((header, index) => {
    if (!header) return;
    if (!indexes[header]) indexes[header] = [];
    indexes[header].push(index);
  });
  return indexes;
}

function getCanonicalCellValue_(row, label, sourceIndexes) {
  const candidates = [label, ...(SOURCE_ALIASES[label] || [])];
  for (const candidate of candidates) {
    const indexes = sourceIndexes[candidate] || [];
    for (const index of indexes) {
      const value = row[index];
      if (value !== '' && value !== null && value !== undefined) return value;
    }
  }
  return '';
}

function headersMatch_(currentHeaders, desiredHeaders) {
  if (currentHeaders.length !== desiredHeaders.length) return false;
  return desiredHeaders.every((header, index) => currentHeaders[index] === header);
}

function ensureGridHeight_(sheet, desiredCount) {
  const currentCount = sheet.getMaxRows();
  if (currentCount < desiredCount) sheet.insertRowsAfter(currentCount, desiredCount - currentCount);
}

function ensureGridWidth_(sheet, desiredCount) {
  const currentCount = sheet.getMaxColumns();
  if (currentCount < desiredCount) sheet.insertColumnsAfter(currentCount, desiredCount - currentCount);
}

function trimGridColumns_(sheet, desiredCount) {
  const currentCount = sheet.getMaxColumns();
  if (currentCount > desiredCount) sheet.deleteColumns(desiredCount + 1, currentCount - desiredCount);
}

function applySheetFormatting_(sheet) {
  const count = HEADER_LABELS.length;
  sheet.setFrozenRows(1);
  sheet.getRange(1, 1, 1, count)
    .setBackground('#00416B')
    .setFontColor('#FFFFFF')
    .setFontWeight('bold')
    .setHorizontalAlignment('center');

  HEADER_LABELS.forEach((label, index) => {
    const column = index + 1;
    sheet.setColumnWidth(column, COLUMN_WIDTHS[label] || 130);
    if (TEXT_COLUMNS.has(label)) sheet.getRange(2, column, Math.max(sheet.getMaxRows() - 1, 1), 1).setNumberFormat('@');
  });

  const moneyColumns = ['Valor', 'VD'];
  moneyColumns.forEach(label => {
    const index = HEADER_LABELS.indexOf(label);
    if (index >= 0) sheet.getRange(2, index + 1, Math.max(sheet.getMaxRows() - 1, 1), 1).setNumberFormat('#,##0.00');
  });

  // Data é armazenada como Date real e exibida sempre no mesmo padrão.
  const dataIndex = HEADER_LABELS.indexOf('Data');
  if (dataIndex >= 0) {
    sheet.getRange(2, dataIndex + 1, Math.max(sheet.getMaxRows() - 1, 1), 1)
      .setNumberFormat('dd/MM/yyyy HH:mm');
  }
}

// ============================================================
//  HELPERS DE LEITURA E UI
// ============================================================
function readSheetMatrix_(sheet) {
  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();
  const headers = lastCol
    ? sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(safe)
    : [];
  const rows = lastRow >= 2 && headers.length
    ? sheet.getRange(2, 1, lastRow - 1, headers.length).getValues()
    : [];
  const indexByHeader = {};
  headers.forEach((header, index) => { indexByHeader[header] = index; });
  return { headers, rows, indexByHeader };
}

function buildColumns_(headers, sheet) {
  const readSheetMetadata = CONFIG.READ_SHEET_COLUMN_UI_METADATA === true;
  return headers.map((header, index) => {
    const width = readSheetMetadata
      ? sheet.getColumnWidth(index + 1)
      : (COLUMN_WIDTHS[header] || 130);
    const hidden = readSheetMetadata
      ? sheet.isColumnHiddenByUser(index + 1)
      : false;

    return {
      key: header,
      label: header,
      width: Math.max(1, Math.min(280, width || 130)),
      hidden,
      mono: /objeto|^codigo$|id|cpf|cnpj|cep|documento|contrato|cart[aã]o/i.test(header),
      numeric: /valor|^vd$|peso|larg|comp|alt|diâm|diam/i.test(header),
      type: /data|prev\./i.test(header) ? 'date' : (/valor|^vd$/i.test(header) ? 'money' : 'text'),
      group: /data|atendente|forma pagamento|^valor$|^tipo$|^formaPagamento$/i.test(header) ? 'atendimento' : 'postagem',
    };
  }).filter(column => !column.hidden);
}

function keyByLabel_(label) {
  const found = FIELD_DEFS.find(([, fieldLabel]) => {
    return fieldLabel === label || (SOURCE_ALIASES[fieldLabel] || []).includes(label);
  });
  return found ? found[0] : null;
}

function formatCell_(value, header) {
  if (header === 'Data') {
    const date = parseDateTimeValue_(value);
    return date ? Utilities.formatDate(date, CONFIG.TZ, 'dd/MM/yyyy HH:mm') : safe(value);
  }
  if (value instanceof Date) return Utilities.formatDate(value, CONFIG.TZ, 'dd/MM/yyyy HH:mm');
  return value == null ? '' : value;
}

// Aceita as formas já existentes na planilha e a estrutura ISO recebida no JSON:
// 2026-05-27 13:35 | 2026-05-27T13:35:00 | 29/05/2026 | 29/05/2026 13:35
// Retorna Date real para que o Sheets ordene cronologicamente, não como texto.
function parseDateTimeValue_(value) {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : new Date(value.getTime());
  }

  const text = safe(value).trim();
  if (!text) return null;

  let match = text.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/);
  if (match) {
    return buildLocalDate_(match[1], match[2], match[3], match[4], match[5], match[6]);
  }

  match = text.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/);
  if (match) {
    return buildLocalDate_(match[3], match[2], match[1], match[4], match[5], match[6]);
  }

  return null;
}

function buildLocalDate_(year, month, day, hour, minute, second) {
  const date = new Date(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour || 0),
    Number(minute || 0),
    Number(second || 0),
    0
  );

  if (
    date.getFullYear() !== Number(year) ||
    date.getMonth() !== Number(month) - 1 ||
    date.getDate() !== Number(day)
  ) return null;

  return date;
}

// ============================================================
//  DETECÇÃO ROBUSTA DO TIPO DE PAYLOAD
// ============================================================
// As APIs e ferramentas de captura podem devolver o mesmo conteúdo com
// envelopes diferentes. Estas funções não dependem de um único caminho fixo
// como root.body.itens: percorrem a estrutura recebida e coletam somente as
// listas compatíveis com o fluxo solicitado.
function extrairAtendimentosDoJson_(jsonString) {
  const roots = parseJsonRoots_(jsonString);
  validarRootsSemErro_(roots, 'atendimento');

  const atendimentos = collectPayloadItems_(roots, 'atendimento');
  if (!atendimentos.length) {
    if (collectPayloadItems_(roots, 'postagem').length) {
      throw new Error(
        'Foi detectado um JSON de postagem no campo de atendimento. ' +
        'Cole esse conteúdo em "JSON de postagem" e clique em "Processar".'
      );
    }
    throw new Error(
      'Nenhuma lista de atendimentos foi encontrada no JSON. ' +
      'O sistema procurou registros de atendimento em toda a estrutura recebida.'
    );
  }
  return atendimentos;
}

function validarRootsSemErro_(roots, tipoPayload) {
  if (!Array.isArray(roots) || !roots.length) {
    throw new Error(`JSON de ${tipoPayload} vazio ou sem conteúdo reconhecível.`);
  }
  const rootComErro = roots.find(root => isObj(root) && root.erro === true);
  if (rootComErro) {
    const detalhe = firstText_(rootComErro.mensagem, rootComErro.message, rootComErro.erroMensagem).trim();
    throw new Error(`JSON de ${tipoPayload} retornou erro${detalhe ? ': ' + detalhe : '.'}`);
  }
}

function collectPayloadItems_(roots, kind) {
  const results = [];
  const seenNodes = new Set();
  const seenItems = new Set();
  const matcher = kind === 'atendimento' ? isAtendimentoRecord_ : isPostagemRecord_;
  const maxDepth = 12;

  const addMatches = value => {
    if (!Array.isArray(value)) return false;
    const matches = value.filter(matcher);
    if (!matches.length) return false;
    matches.forEach(item => {
      if (seenItems.has(item)) return;
      seenItems.add(item);
      results.push(item);
    });
    return true;
  };

  const visit = (node, depth) => {
    if (depth > maxDepth || node === null || node === undefined || typeof node !== 'object') return;
    if (seenNodes.has(node)) return;
    seenNodes.add(node);

    // Também aceita arrays cujo conteúdo foi achatado pelo parser e chegou
    // como raiz individual, por exemplo: [{ atendimento1 }, { atendimento2 }].
    if (!Array.isArray(node) && matcher(node)) {
      if (!seenItems.has(node)) {
        seenItems.add(node);
        results.push(node);
      }
      return;
    }

    if (Array.isArray(node)) {
      if (addMatches(node)) return;
      node.forEach(child => visit(child, depth + 1));
      return;
    }

    Object.keys(node).forEach(key => {
      const value = node[key];
      if (Array.isArray(value)) {
        if (!addMatches(value)) visit(value, depth + 1);
      } else if (value && typeof value === 'object') {
        visit(value, depth + 1);
      }
    });
  };

  (Array.isArray(roots) ? roots : [roots]).forEach(root => visit(root, 0));
  return results;
}

function isAtendimentoRecord_(value) {
  if (!isObj(value)) return false;
  const itens = Array.isArray(value.itens) ? value.itens : [];
  if (!itens.length) return false;
  const hasMetadata = (
    Object.prototype.hasOwnProperty.call(value, 'dataHoraAtual') ||
    Object.prototype.hasOwnProperty.call(value, 'idCorreiosAtendente') ||
    Object.prototype.hasOwnProperty.call(value, 'tipo') ||
    Array.isArray(value.pagamentos)
  );
  const hasObjectItem = itens.some(item => (
    isObj(item) && !!normalizeObjectCode_(firstText_(item.codigoObjeto, item.codObjeto))
  ));
  return hasMetadata && hasObjectItem;
}

function isPostagemRecord_(value) {
  if (!isObj(value)) return false;
  if (isObj(value.acoletar) || isObj(value.coletado)) return true;

  const objectCode = normalizeObjectCode_(firstText_(value.codObjeto, value.codigoObjeto));
  if (!objectCode) return false;

  // Um item interno do JSON de atendimento também possui codigoObjeto.
  // Ele não pode ser confundido com uma postagem completa.
  if (looksLikeAtendimentoItem_(value)) return false;

  return true;
}

function looksLikeAtendimentoItem_(value) {
  if (!isObj(value)) return false;
  return (
    Object.prototype.hasOwnProperty.call(value, 'idItemAtendimento') ||
    Object.prototype.hasOwnProperty.call(value, 'tipoItemAtendimento') ||
    Object.prototype.hasOwnProperty.call(value, 'recurso')
  );
}

// ============================================================
//  PARSER JSON ROBUSTO
// ============================================================
// Mantém compatibilidade com o JSON único tradicional e também aceita:
// - BOM no início do texto;
// - bloco markdown ```json ... ```;
// - dois ou mais JSONs completos colados em sequência.
//
// Isso evita falhas do tipo:
//   Unexpected non-whitespace character after JSON
// sem alterar o conteúdo dos registros processados.
function parseJsonRoots_(jsonString) {
  let text = safe(jsonString).replace(/^\uFEFF/, '').trim();
  if (!text) throw new Error('JSON vazio.');

  text = stripMarkdownFence_(text);

  try {
    return flattenJsonRoots_([JSON.parse(text)]);
  } catch (firstError) {
    const documents = splitJsonDocuments_(text);
    if (documents.length <= 1) {
      throw new Error('JSON inválido: ' + (firstError.message || String(firstError)));
    }

    try {
      return flattenJsonRoots_(documents.map(document => JSON.parse(document)));
    } catch (multiError) {
      throw new Error('JSON inválido: ' + (multiError.message || String(multiError)));
    }
  }
}

function stripMarkdownFence_(text) {
  const trimmed = safe(text).trim();
  const match = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return match ? match[1].trim() : trimmed;
}

function flattenJsonRoots_(documents) {
  const roots = [];
  documents.forEach(document => {
    if (Array.isArray(document)) roots.push(...document);
    else roots.push(document);
  });
  return roots.filter(root => root !== null && root !== undefined);
}

function splitJsonDocuments_(text) {
  const documents = [];
  const source = safe(text);
  let index = 0;

  while (index < source.length) {
    while (index < source.length && /\s/.test(source[index])) index++;
    if (index >= source.length) break;

    const first = source[index];
    if (first !== '{' && first !== '[') {
      throw new Error('Conteúdo inesperado antes do próximo JSON na posição ' + index + '.');
    }

    const start = index;
    let depth = 0;
    let inString = false;
    let escaping = false;

    for (; index < source.length; index++) {
      const char = source[index];

      if (inString) {
        if (escaping) escaping = false;
        else if (char === '\\') escaping = true;
        else if (char === '"') inString = false;
        continue;
      }

      if (char === '"') {
        inString = true;
        continue;
      }

      if (char === '{' || char === '[') depth++;
      else if (char === '}' || char === ']') depth--;

      if (depth < 0) throw new Error('Fechamento inesperado de JSON na posição ' + index + '.');

      if (depth === 0) {
        documents.push(source.slice(start, index + 1));
        index++;
        break;
      }
    }

    if (depth !== 0 || inString) {
      throw new Error('JSON incompleto a partir da posição ' + start + '.');
    }
  }

  return documents;
}

function parseBRNumber_(value) {
  const text = safe(value).trim();
  if (!text) return 0;
  if (text.includes(',')) return Number(text.replace(/\./g, '').replace(',', '.')) || 0;
  return Number(text) || 0;
}

function firstText_(...values) {
  for (const value of values) {
    if (value === null || value === undefined) continue;
    if (typeof value === 'object') continue;
    const text = String(value);
    if (text !== '') return text;
  }
  return '';
}

function firstNumber_(...values) {
  for (const value of values) {
    if (value === null || value === undefined || value === '') continue;
    const number = parseBRNumber_(value);
    if (!Number.isNaN(number)) return number;
  }
  return 0;
}

function firstObject_(...values) {
  for (const value of values) {
    if (isObj(value)) return value;
  }
  return {};
}

function firstArray_(...values) {
  for (const value of values) {
    if (Array.isArray(value)) return value;
  }
  return [];
}

function formatPhone_(value) {
  const digits = safe(value).replace(/\D/g, '');
  if (!digits) return '';
  if (digits.length === 11) return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  if (digits.length === 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return digits;
}

// Normaliza o SRO exclusivamente para validação, comparação anti-duplicata
// e gravação. Ex.: " ad 123 br " e "AD123BR" passam a ser o mesmo objeto.
function normalizeObjectCode_(value) {
  return safe(value).trim().toUpperCase().replace(/\s+/g, '');
}

// Diagnóstico opcional de tempo do backend. Não altera a planilha.
function diagnosticarPerformancePainel() {
  const marks = {};
  const start = Date.now();
  const sheet = getSheet();
  marks.getSheetMs = Date.now() - start;

  const t1 = Date.now();
  normalizeSheetStructure_(sheet);
  marks.normalizeMs = Date.now() - t1;

  const t2 = Date.now();
  const matrix = readSheetMatrix_(sheet);
  marks.readMatrixMs = Date.now() - t2;

  const t3 = Date.now();
  const columns = buildColumns_(matrix.headers, sheet);
  marks.buildColumnsMs = Date.now() - t3;

  marks.rows = matrix.rows.length;
  marks.columns = columns.length;
  marks.totalMs = Date.now() - start;
  console.log('[PERFORMANCE] ' + JSON.stringify(marks));
  return marks;
}

// Teste manual sem escrita na planilha. Pode ser executado no editor do Apps Script.
function testarMapeamentoNovaPostagem() {
  const payload = {
    codObjeto: 'TESTE123456BR',
    // O JSON de postagem pode trazer tipoPostal.descricao, mas essa informação
    // não deve alimentar as colunas codigo/descricao do painel.
    tipoPostal: { descricao: 'ETIQUETA LOGICA SEDEX AD', categoria: 'SEDEX' },
    contrato: '9912345678',
    cartaoPostagem: '12345678',
    peso: '1,25', largura: 20, comprimento: 30, altura: 10, diametro: 0,
    formato: 'PACOTE', dtPrevista: '2026-06-30',
    servico: { vd: '35,50' },
    eventos: [{
      codigo: 'PO', descricao: 'Postado',
      remetente: {
        nome: 'REMETENTE TESTE', documento: '00123456789',
        endereco: { cep: '60000000', logradouro: 'Rua Teste', numero: '10', cidade: 'Fortaleza', uf: 'CE' },
      },
      destinatario: {
        nome: 'DESTINATÁRIO TESTE', documento: '00987654321',
        endereco: { cep: '01001000', logradouro: 'Praça da Sé', numero: '1', cidade: 'São Paulo', uf: 'SP' },
      },
    }],
  };
  const record = extrairRegistro(payload, 'Rastreamento', payload);
  validarRegistrosExtraidos_([record]);
  const row = HEADERS.map(key => record[key] ?? '');
  validarLinhasAntesDeInserir_([record], [row]);
  const result = {};
  HEADER_LABELS.forEach((label, index) => { result[label] = row[index]; });
  if (result.codigo !== '' || result.descricao !== '') {
    throw new Error('Falha no teste: codigo/descricao não podem vir do JSON de postagem.');
  }
  console.log(JSON.stringify(result, null, 2));
  return result;
}

// Teste manual sem escrita: valida a fonte correta do JSON de atendimento.
function testarMapeamentoCodigoDescricaoDoAtendimento() {
  const item = {
    valor: 23.19,
    codigo: '03301',
    descricao: 'PAC REVERSO',
    codigoObjeto: 'AN976775385BR',
  };
  const result = {
    Objeto: normalizeObjectCode_(item.codigoObjeto),
    codigo: safe(item.codigo).trim(),
    descricao: safe(item.descricao).trim(),
    Valor: item.valor,
  };
  if (result.codigo !== '03301' || result.descricao !== 'PAC REVERSO') {
    throw new Error('Falha no teste: codigo/descricao não foram extraídos do item de atendimento.');
  }
  console.log(JSON.stringify(result, null, 2));
  return result;
}

// Teste manual sem escrita: valida as duas novas colunas finais do atendimento.
function testarMapeamentoTipoFormaPagamentoDoAtendimento() {
  const atendimento = {
    tipo: 'AFATURAR_REVERSO_ETICKET',
    pagamentos: [{ formaPagamento: 'CARTAO_POSTAGEM' }],
  };
  const formaPagamentoDoAtendimento = Array.isArray(atendimento.pagamentos) && atendimento.pagamentos[0]
    ? safe(atendimento.pagamentos[0].formaPagamento).trim()
    : '';
  const result = {
    tipo: safe(atendimento.tipo).trim(),
    formaPagamento: formaPagamentoDoAtendimento,
  };
  if (
    result.tipo !== 'AFATURAR_REVERSO_ETICKET' ||
    result.formaPagamento !== 'CARTAO_POSTAGEM'
  ) {
    throw new Error('Falha no teste: tipo/formaPagamento não foram extraídos do JSON de atendimento.');
  }
  console.log(JSON.stringify(result, null, 2));
  return result;
}

// OPCIONAL: execute uma única vez somente se a v11 já preencheu codigo e
// descricao a partir do JSON de postagem. Cria backup antes de limpar.
// Depois, reprocesse os JSONs de atendimento para preencher os valores corretos.
function limparCodigoDescricaoImportadosDoJsonPostagem() {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
    const sheet = getSheet();
    normalizeSheetStructure_(sheet);
    const matrix = readSheetMatrix_(sheet);
    const codigoIdx = matrix.indexByHeader['codigo'];
    const descricaoIdx = matrix.indexByHeader['descricao'];
    if (codigoIdx == null || descricaoIdx == null) {
      throw new Error('Colunas "codigo" e "descricao" não encontradas.');
    }

    const changedRowIndexes = new Set();
    let clearedCells = 0;
    matrix.rows.forEach((row, rowIndex) => {
      let changed = false;
      if (isMeaningful_(row[codigoIdx])) {
        row[codigoIdx] = '';
        clearedCells++;
        changed = true;
      }
      if (isMeaningful_(row[descricaoIdx])) {
        row[descricaoIdx] = '';
        clearedCells++;
        changed = true;
      }
      if (changed) changedRowIndexes.add(rowIndex);
    });

    if (!changedRowIndexes.size) {
      return { ok: true, clearedRows: 0, clearedCells: 0, message: 'Nenhuma célula precisou ser limpa.' };
    }

    const safetyBackup = backupSheetBeforeMigration_(sheet);
    writeChangedRowsInBlocks_(sheet, matrix.rows, changedRowIndexes, matrix.headers.length);
    return {
      ok: true,
      clearedRows: changedRowIndexes.size,
      clearedCells,
      safetyBackup,
      message: 'Limpeza concluída. Reprocesse os JSONs de atendimento para preencher os valores corretos.',
    };
  } catch (err) {
    return { ok: false, error: err.message || String(err) };
  } finally {
    try { lock.releaseLock(); } catch (_) {}
  }
}

function isObj(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

function safe(value) {
  return value === null || value === undefined ? '' : String(value);
}
