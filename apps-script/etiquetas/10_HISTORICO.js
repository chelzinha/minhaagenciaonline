/**
 * APP ETIQUETAS AGF — 10_HISTORICO.gs
 * CRUD do histórico de etiquetas geradas.
 *
 * Uma linha em HISTORICO_ETIQUETAS é criada DURANTE a chamada
 * salvarEtiqueta, antes mesmo da Correios responder. Isso garante
 * que mesmo se a chamada falhar, há rastro do que aconteceu.
 *
 * O status da linha vai mudando conforme o processo avança:
 *   PROCESSANDO_VALIDACAO → PROCESSANDO_PREPOST → PROCESSANDO_ROTULO
 *   → CONCLUIDO | ERRO_VALIDACAO | ERRO_PREPOST | ERRO_ROTULO | CANCELADO
 */

const HIST_HEADERS = [
  'DATA_HORA', 'ID_REGISTRO', 'ID_CRM', 'LOGIN_APP',
  'NOME_REMETENTE', 'NOME_FANTASIA', 'CNPJ_CPF',
  'NUM_CONTRATO', 'CARTAO_POSTAGEM',
  'DEST_NOME', 'DEST_CPFCNPJ', 'DEST_CEP', 'DEST_UF', 'DEST_CIDADE',
  'DEST_LOGRADOURO', 'DEST_NUMERO', 'DEST_BAIRRO', 'DEST_COMPLEMENTO', 'DEST_CELULAR', 'DEST_EMAIL',
  'SERVICO', 'TIPO_OBJETO', 'PESO_G',
  'COMPRIMENTO_CM', 'LARGURA_CM', 'ALTURA_CM', 'DIAMETRO_CM',
  'VALOR_DECLARADO', 'AR', 'MAO_PROPRIA',
  'PRECO_COTADO', 'PRAZO_DIAS',
  'TIPO_DOCUMENTO', 'ITENS_DC_JSON',
  'ID_PREPOSTAGEM', 'CODIGO_OBJETO', 'ID_RECIBO_ROTULO',
  'URL_PDF_DRIVE', 'FILE_ID_PDF_DRIVE',
  'URL_PDF_DECLARACAO_DRIVE', 'FILE_ID_DECLARACAO_DRIVE',
  'STATUS', 'MENSAGEM_ERRO',
  'ID_REQUISICAO'
];

/**
 * Garante o schema do histórico sem apagar nem deslocar dados existentes.
 *
 * Versões antigas da planilha já possuíam cabeçalhos, mas não continham
 * TIPO_DOCUMENTO, ITENS_DC_JSON e as referências do DACE. A implementação
 * anterior só criava headers quando a aba estava totalmente vazia; por isso
 * novas colunas nunca eram adicionadas em produção.
 *
 * A migração é incremental: apenas acrescenta ao final os headers ausentes.
 * Como toda leitura/escrita usa o nome do cabeçalho, a ordem física não afeta
 * compatibilidade com registros antigos.
 */
function ensureHistoricoHeaders_() {
  const sh = getOrCreateSheet_(CFG.SHEETS.HIST);
  const lastCol = sh.getLastColumn();

  if (lastCol === 0) {
    sh.getRange(1, 1, 1, HIST_HEADERS.length).setValues([HIST_HEADERS]);
    sh.getRange(1, 1, 1, HIST_HEADERS.length).setFontWeight('bold');
    sh.setFrozenRows(1);
    return;
  }

  const currentHeaders = sh.getRange(1, 1, 1, lastCol)
    .getDisplayValues()[0]
    .map(h => String(h || '').trim());
  const missingHeaders = HIST_HEADERS.filter(h => currentHeaders.indexOf(h) < 0);

  if (missingHeaders.length) {
    sh.getRange(1, lastCol + 1, 1, missingHeaders.length)
      .setValues([missingHeaders])
      .setFontWeight('bold');
    sh.setFrozenRows(1);
  }
}

function criarRegistroHistorico_(client, payload) {
  ensureHistoricoHeaders_();
  const idRegistro = uid_('ETQ');

  const row = {
    DATA_HORA: nowIso_(),
    ID_REGISTRO: idRegistro,
    ID_CRM: sanitize_(client.ID_CRM),
    LOGIN_APP: sanitize_(client.LOGIN_APP),
    NOME_REMETENTE: sanitize_(client.NOME_REMETENTE),
    NOME_FANTASIA: sanitize_(client.NOME_FANTASIA),
    CNPJ_CPF: sanitize_(client.CNPJ_CPF),
    NUM_CONTRATO: sanitize_(client.NUM_CONTRATO),
    CARTAO_POSTAGEM: sanitize_(client.CARTAO_POSTAGEM),
    DEST_NOME: sanitize_(payload.destinatarioNome),
    DEST_CPFCNPJ: sanitize_(payload.destinatarioCpfCnpj),
    DEST_CEP: sanitize_(payload.destinatarioCep),
    DEST_UF: upper_(payload.destinatarioUf),
    DEST_CIDADE: sanitize_(payload.destinatarioCidade),
    DEST_LOGRADOURO: sanitize_(payload.destinatarioEndereco),
    DEST_NUMERO: sanitize_(payload.destinatarioNumero),
    DEST_BAIRRO: sanitize_(payload.destinatarioBairro),
    DEST_COMPLEMENTO: sanitize_(payload.destinatarioComplemento),
    DEST_CELULAR: digitsOnly_(payload.destinatarioCelular),
    DEST_EMAIL: sanitize_(payload.destinatarioEmail),
    SERVICO: upper_(payload.servico),
    TIPO_OBJETO: upper_(payload.tipoObjeto),
    PESO_G: sanitize_(payload.pesoG),
    COMPRIMENTO_CM: sanitize_(payload.comprimentoCm),
    LARGURA_CM: sanitize_(payload.larguraCm),
    ALTURA_CM: sanitize_(payload.alturaCm),
    DIAMETRO_CM: sanitize_(payload.diametroCm),
    VALOR_DECLARADO: sanitize_(payload.valorDeclarado),
    AR: upper_(payload.ar) === 'SIM' ? 'SIM' : 'NAO',
    MAO_PROPRIA: upper_(payload.maoPropria) === 'SIM' ? 'SIM' : 'NAO',
    PRECO_COTADO: '',
    PRAZO_DIAS: '',
    TIPO_DOCUMENTO: upper_(payload.tipoDocumento || ''),
    ITENS_DC_JSON: Array.isArray(payload.itensDeclaracao) && payload.itensDeclaracao.length
      ? truncate_(safeJsonStringify_(payload.itensDeclaracao), 2000)
      : '',
    ID_PREPOSTAGEM: '',
    CODIGO_OBJETO: '',
    ID_RECIBO_ROTULO: '',
    URL_PDF_DRIVE: '',
    FILE_ID_PDF_DRIVE: '',
    URL_PDF_DECLARACAO_DRIVE: '',
    FILE_ID_DECLARACAO_DRIVE: '',
    STATUS: 'PROCESSANDO_VALIDACAO',
    MENSAGEM_ERRO: '',
    ID_REQUISICAO: sanitize_(payload.idRequisicao || '')
  };

  const rowNum = appendByHeaders_(CFG.SHEETS.HIST, row);
  return { idRegistro: idRegistro, rowNum: rowNum };
}

/**
 * Proteção contra emissão duplicada (idempotência).
 * Procura, nas últimas linhas do histórico, um registro do mesmo login
 * com o mesmo ID_REQUISICAO que NÃO tenha falhado. Se existir, o front
 * tentou reenviar (timeout de rede etc.) e a segunda emissão deve ser
 * barrada para não gerar cobrança em dobro.
 */
function buscarRegistroPorRequisicao_(loginApp, idRequisicao) {
  const key = sanitize_(idRequisicao);
  if (!key) return null;
  const tail = readSheetTailAsObjects_(CFG.SHEETS.HIST, 300);
  for (let i = tail.length - 1; i >= 0; i--) {
    const r = tail[i];
    if (sanitize_(r.LOGIN_APP) !== sanitize_(loginApp)) continue;
    if (sanitize_(r.ID_REQUISICAO) !== key) continue;
    const status = upper_(r.STATUS);
    if (status.indexOf('ERRO') === 0 || status === 'CANCELADA') continue;
    return r;
  }
  return null;
}

function atualizarHistorico_(rowNum, patch) {
  updateRowByHeader_(CFG.SHEETS.HIST, rowNum, patch);
}

/**
 * AÇÃO: listarHistorico
 * Filtros: mes (YYYY-MM), dataInicio, dataFim, status, busca (nome dest), limit
 */
function normalizeHistoricoMes_(value) {
  const s = sanitize_(value);
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(s) ? s : '';
}

function historicoMoneyNumber_(value) {
  let s = sanitize_(value).replace(/R\$/gi, '').replace(/\s/g, '');
  if (!s) return 0;

  const comma = s.lastIndexOf(',');
  const dot = s.lastIndexOf('.');

  if (comma >= 0 && dot >= 0) {
    s = comma > dot
      ? s.replace(/\./g, '').replace(',', '.')
      : s.replace(/,/g, '');
  } else if (comma >= 0) {
    s = s.replace(/\./g, '').replace(',', '.');
  } else if (dot >= 0 && /^-?\d{1,3}(\.\d{3})+$/.test(s)) {
    s = s.replace(/\./g, '');
  }

  s = s.replace(/[^\d.-]/g, '');
  const n = Number(s);
  return isFinite(n) ? n : 0;
}

function action_listarHistorico_(params) {
  ensureHistoricoHeaders_();
  const sessionClient = getSessionClient_(params.sessionToken);
  const f = params.filtros || {};
  const limit = Math.min(toNumber_(f.limit, 100), 500);

  // Performance: lê apenas as últimas 3000 linhas (mais que suficiente
  // para os filtros de mês/período do app) em vez da planilha inteira.
  const all = readSheetTailAsObjects_(CFG.SHEETS.HIST, 3000);
  const meusRegistros = all.filter(r => sanitize_(r.LOGIN_APP) === sessionClient.LOGIN_APP);
  const mes = normalizeHistoricoMes_(f.mes);
  const registrosPeriodo = mes
    ? meusRegistros.filter(r => sanitize_(r.DATA_HORA).slice(0, 7) === mes)
    : meusRegistros.slice();
  const postagensConcluidasPeriodo = registrosPeriodo.filter(r => upper_(r.STATUS) === 'CONCLUIDO');
  const valorTotalPostagens = postagensConcluidasPeriodo.reduce((total, r) => {
    return total + historicoMoneyNumber_(r.PRECO_COTADO);
  }, 0);

  let filtered = registrosPeriodo;

  if (f.status) {
    const s = upper_(f.status);
    filtered = filtered.filter(r => upper_(r.STATUS) === s);
  }
  if (f.uf) {
    const uf = upper_(f.uf);
    filtered = filtered.filter(r => upper_(r.DEST_UF) === uf);
  }
  if (f.busca) {
    const q = lower_(f.busca);
    filtered = filtered.filter(r =>
      lower_(r.DEST_NOME).indexOf(q) >= 0 ||
      lower_(r.CODIGO_OBJETO).indexOf(q) >= 0 ||
      lower_(r.ID_REGISTRO).indexOf(q) >= 0
    );
  }
  if (f.dataInicio) {
    filtered = filtered.filter(r => sanitize_(r.DATA_HORA) >= sanitize_(f.dataInicio));
  }
  if (f.dataFim) {
    filtered = filtered.filter(r => sanitize_(r.DATA_HORA) <= sanitize_(f.dataFim) + ' 23:59:59');
  }

  // Ordena descendente por data
  filtered.sort((a, b) => sanitize_(b.DATA_HORA).localeCompare(sanitize_(a.DATA_HORA)));

  return {
    total: filtered.length,
    resumo: {
      periodo: mes,
      totalRegistrosPeriodo: registrosPeriodo.length,
      totalPostagensConcluidas: postagensConcluidasPeriodo.length,
      valorTotalPostagens: Math.round(valorTotalPostagens * 100) / 100,
      totalResultados: filtered.length
    },
    ufs: Array.from(new Set(meusRegistros.map(r => upper_(r.DEST_UF)).filter(Boolean))).sort(),
    items: (function () {
      const destContatoLookup = buildDestinatarioContatoLookup_(sessionClient.LOGIN_APP);
      return filtered.slice(0, limit).map(r => {
      const contato = (digitsOnly_(r.DEST_CELULAR) || sanitize_(r.DEST_EMAIL))
        ? { celular: digitsOnly_(r.DEST_CELULAR), email: sanitize_(r.DEST_EMAIL) }
        : getDestinatarioContatoParaHistorico_(sessionClient.LOGIN_APP, r, destContatoLookup);
      return ({
      idRegistro: r.ID_REGISTRO,
      dataHora: r.DATA_HORA,
      destNome: r.DEST_NOME,
      destCidade: r.DEST_CIDADE,
      destUf: r.DEST_UF,
      destCep: r.DEST_CEP,
      destCelular: contato.celular || '',
      destEmail: contato.email || '',
      servico: r.SERVICO,
      pesoG: r.PESO_G,
      precoCotado: r.PRECO_COTADO,
      precoCotadoNumero: historicoMoneyNumber_(r.PRECO_COTADO),
      codigoObjeto: r.CODIGO_OBJETO,
      idPrepostagem: r.ID_PREPOSTAGEM,
      urlPdf: r.URL_PDF_DRIVE,
      fileIdPdf: r.FILE_ID_PDF_DRIVE,
      urlPdfDeclaracao: r.URL_PDF_DECLARACAO_DRIVE,
      fileIdPdfDeclaracao: r.FILE_ID_DECLARACAO_DRIVE,
      tipoDocumento: r.TIPO_DOCUMENTO,
      status: r.STATUS,
      mensagemErro: r.MENSAGEM_ERRO
      });
    });
    })()
  };
}

/**
 * AÇÃO: detalheEtiqueta
 */
function action_detalheEtiqueta_(params) {
  ensureHistoricoHeaders_();
  const sessionClient = getSessionClient_(params.sessionToken);
  const idRegistro = sanitize_(params.idRegistro);
  if (!idRegistro) throw new Error('idRegistro obrigatório');

  const all = readSheetAsObjects_(CFG.SHEETS.HIST);
  const reg = all.find(r =>
    sanitize_(r.ID_REGISTRO) === idRegistro &&
    sanitize_(r.LOGIN_APP) === sessionClient.LOGIN_APP
  );

  if (!reg) throw new Error('Etiqueta não encontrada ou sem permissão de acesso');

  return reg;
}