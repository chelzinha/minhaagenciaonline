/**
 * APP ETIQUETAS AGF — 11_DESTINATARIOS.gs
 * Cadastro central de destinatários por LOGIN_APP.
 *
 * Alimentação:
 *   1) automática após importação de NF-e;
 *   2) automática após etiqueta gerada;
 *   3) manual pela aba DESTINATÁRIOS do /app.
 *
 * Compatibilidade: preserva buscarDestinatarios para autocomplete das telas
 * existentes e migra a aba incrementalmente sem apagar dados antigos.
 */

const DEST_HEADERS = [
  'ID_DESTINATARIO', 'LOGIN_APP', 'NOME', 'CPF_CNPJ', 'CELULAR', 'EMAIL',
  'CEP', 'LOGRADOURO', 'NUMERO', 'COMPLEMENTO', 'BAIRRO', 'CIDADE', 'UF',
  'ENVIO_NF', 'ENVIO_DECLARACAO_CONTEUDO', 'SEMPRE_VALOR_DECLARADO',
  'FORMA_PAGAMENTO_PREFERENCIAL', 'FRETE_POR_CONTA',
  'ORIGEM_CADASTRO', 'CRIADO_EM', 'ATUALIZADO_EM', 'ULTIMA_USO', 'TOTAL_USOS'
];

function ensureDestinatariosHeaders_() {
  const sh = getOrCreateSheet_(CFG.SHEETS.DEST);
  const lastCol = sh.getLastColumn();
  if (lastCol === 0) {
    sh.getRange(1, 1, 1, DEST_HEADERS.length).setValues([DEST_HEADERS]);
    sh.getRange(1, 1, 1, DEST_HEADERS.length).setFontWeight('bold');
    sh.setFrozenRows(1);
    return;
  }

  const current = sh.getRange(1, 1, 1, lastCol).getDisplayValues()[0]
    .map(h => String(h || '').trim());
  const missing = DEST_HEADERS.filter(h => current.indexOf(h) < 0);
  if (missing.length) {
    sh.getRange(1, lastCol + 1, 1, missing.length).setValues([missing]).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
}

function destBool_(value, fallback) {
  const s = upper_(value);
  if (['SIM','S','TRUE','1','YES'].indexOf(s) >= 0) return 'SIM';
  if (['NAO','NÃO','N','FALSE','0','NO'].indexOf(s) >= 0) return 'NAO';
  return fallback == null ? '' : fallback;
}

function normalizeDestinatarioPayload_(payload) {
  payload = payload || {};
  return {
    idDestinatario: sanitize_(payload.idDestinatario || payload.ID_DESTINATARIO),
    nome: sanitize_(payload.nome || payload.NOME || payload.destinatarioNome),
    cpfCnpj: digitsOnly_(payload.cpfCnpj || payload.CPF_CNPJ || payload.destinatarioCpfCnpj),
    celular: digitsOnly_(payload.celular || payload.CELULAR || payload.destinatarioCelular),
    email: sanitize_(payload.email || payload.EMAIL || payload.destinatarioEmail),
    cep: digitsOnly_(payload.cep || payload.CEP || payload.destinatarioCep),
    logradouro: sanitize_(payload.logradouro || payload.LOGRADOURO || payload.endereco || payload.destinatarioEndereco),
    numero: sanitize_(payload.numero || payload.NUMERO || payload.destinatarioNumero),
    complemento: sanitize_(payload.complemento || payload.COMPLEMENTO || payload.destinatarioComplemento),
    bairro: sanitize_(payload.bairro || payload.BAIRRO || payload.destinatarioBairro),
    cidade: sanitize_(payload.cidade || payload.CIDADE || payload.destinatarioCidade),
    uf: upper_(payload.uf || payload.UF || payload.destinatarioUf).slice(0, 2),
    envioNf: destBool_(payload.envioNf || payload.ENVIO_NF, ''),
    envioDeclaracaoConteudo: destBool_(payload.envioDeclaracaoConteudo || payload.ENVIO_DECLARACAO_CONTEUDO, ''),
    sempreValorDeclarado: destBool_(payload.sempreValorDeclarado || payload.USAR_VALOR_DECLARADO || payload.SEMPRE_VALOR_DECLARADO, ''),
    formaPagamentoPreferencial: upper_(payload.formaPagamentoPreferencial || payload.FORMA_PAGAMENTO_PREFERENCIAL),
    fretePorConta: upper_(payload.fretePorConta || payload.FRETE_POR_CONTA),
    origemCadastro: upper_(payload.origemCadastro || payload.ORIGEM_CADASTRO)
  };
}

function destinatarioKeyNormalized_(loginApp, dest) {
  const cpf = digitsOnly_(dest.cpfCnpj);
  if (cpf) return sanitize_(loginApp) + '|DOC|' + cpf;
  return sanitize_(loginApp) + '|NOMECEP|' + lower_(dest.nome) + '|' + digitsOnly_(dest.cep);
}

function destinatarioKey_(loginApp, payload) {
  return destinatarioKeyNormalized_(loginApp, normalizeDestinatarioPayload_(payload));
}

function destItemFromRow_(r) {
  return {
    idDestinatario: sanitize_(r.ID_DESTINATARIO) || ('ROW_' + r._row),
    nome: r.NOME,
    cpfCnpj: r.CPF_CNPJ,
    celular: r.CELULAR,
    email: r.EMAIL,
    cep: r.CEP,
    logradouro: r.LOGRADOURO,
    numero: r.NUMERO,
    complemento: r.COMPLEMENTO,
    bairro: r.BAIRRO,
    cidade: r.CIDADE,
    uf: r.UF,
    envioNf: destBool_(r.ENVIO_NF, 'NAO'),
    envioDeclaracaoConteudo: destBool_(r.ENVIO_DECLARACAO_CONTEUDO, 'NAO'),
    sempreValorDeclarado: destBool_(r.SEMPRE_VALOR_DECLARADO, 'NAO'),
    formaPagamentoPreferencial: upper_(r.FORMA_PAGAMENTO_PREFERENCIAL),
    fretePorConta: upper_(r.FRETE_POR_CONTA),
    origemCadastro: upper_(r.ORIGEM_CADASTRO),
    criadoEm: r.CRIADO_EM,
    atualizadoEm: r.ATUALIZADO_EM,
    ultimoUso: r.ULTIMA_USO,
    totalUsos: toNumber_(r.TOTAL_USOS, 0)
  };
}

function findDestinatarioRow_(loginApp, dest, rows) {
  rows = rows || readSheetAsObjects_(CFG.SHEETS.DEST);
  const id = sanitize_(dest.idDestinatario);
  if (id) {
    const byId = rows.find(r => sanitize_(r.LOGIN_APP) === loginApp && (sanitize_(r.ID_DESTINATARIO) === id || ('ROW_' + r._row) === id));
    if (byId) return byId;
  }
  const key = destinatarioKeyNormalized_(loginApp, dest);
  const exact = rows.find(r => sanitize_(r.LOGIN_APP) === loginApp && destinatarioKey_(loginApp, {
    destinatarioCpfCnpj: r.CPF_CNPJ,
    destinatarioNome: r.NOME,
    destinatarioCep: r.CEP
  }) === key);
  if (exact) return exact;

  // Compatibilidade: uma NF pode chegar sem CPF/CNPJ e a etiqueta posterior com documento.
  // Nesse caso, evita duplicar o mesmo destinatário usando nome + CEP como fallback.
  const nomeCep = lower_(dest.nome) + '|' + digitsOnly_(dest.cep);
  return rows.find(r => sanitize_(r.LOGIN_APP) === loginApp &&
    (lower_(r.NOME) + '|' + digitsOnly_(r.CEP)) === nomeCep) || null;
}

/**
 * Upsert interno.
 * options: { registrarUso, origemCadastro }
 */
function upsertDestinatario_(loginApp, payload, options) {
  ensureDestinatariosHeaders_();
  options = options || {};
  const dest = normalizeDestinatarioPayload_(payload);
  const all = readSheetAsObjects_(CFG.SHEETS.DEST);
  const existing = findDestinatarioRow_(loginApp, dest, all);
  const now = nowIso_();
  const origem = upper_(options.origemCadastro || dest.origemCadastro || 'ETIQUETA_GERADA');
  const registrarUso = options.registrarUso !== false;
  const id = existing ? (sanitize_(existing.ID_DESTINATARIO) || uid_('DST')) : uid_('DST');
  const allowBlankOverwrite = origem === 'MANUAL';
  const mergeText = (incoming, oldValue) => allowBlankOverwrite ? sanitize_(incoming) : (sanitize_(incoming) || sanitize_(oldValue));

  const patch = {
    ID_DESTINATARIO: id,
    LOGIN_APP: sanitize_(loginApp),
    NOME: mergeText(dest.nome, existing && existing.NOME),
    CPF_CNPJ: mergeText(dest.cpfCnpj, existing && existing.CPF_CNPJ),
    CELULAR: mergeText(dest.celular, existing && existing.CELULAR),
    EMAIL: mergeText(dest.email, existing && existing.EMAIL),
    CEP: mergeText(dest.cep, existing && existing.CEP),
    LOGRADOURO: mergeText(dest.logradouro, existing && existing.LOGRADOURO),
    NUMERO: mergeText(dest.numero, existing && existing.NUMERO),
    COMPLEMENTO: mergeText(dest.complemento, existing && existing.COMPLEMENTO),
    BAIRRO: mergeText(dest.bairro, existing && existing.BAIRRO),
    CIDADE: mergeText(dest.cidade, existing && existing.CIDADE),
    UF: mergeText(dest.uf, existing && existing.UF),
    ENVIO_NF: dest.envioNf || (existing ? destBool_(existing.ENVIO_NF, 'NAO') : 'NAO'),
    ENVIO_DECLARACAO_CONTEUDO: dest.envioDeclaracaoConteudo || (existing ? destBool_(existing.ENVIO_DECLARACAO_CONTEUDO, 'NAO') : 'NAO'),
    SEMPRE_VALOR_DECLARADO: dest.sempreValorDeclarado || (existing ? destBool_(existing.SEMPRE_VALOR_DECLARADO, 'NAO') : 'NAO'),
    FORMA_PAGAMENTO_PREFERENCIAL: dest.formaPagamentoPreferencial || (existing ? upper_(existing.FORMA_PAGAMENTO_PREFERENCIAL) : ''),
    FRETE_POR_CONTA: dest.fretePorConta || (existing ? upper_(existing.FRETE_POR_CONTA) : ''),
    ORIGEM_CADASTRO: origem || (existing ? upper_(existing.ORIGEM_CADASTRO) : ''),
    CRIADO_EM: existing ? (existing.CRIADO_EM || now) : now,
    ATUALIZADO_EM: now,
    ULTIMA_USO: registrarUso ? now : (existing ? existing.ULTIMA_USO : ''),
    TOTAL_USOS: (existing ? toNumber_(existing.TOTAL_USOS, 0) : 0) + (registrarUso ? 1 : 0)
  };

  if (existing) updateRowByHeader_(CFG.SHEETS.DEST, existing._row, patch);
  else appendByHeaders_(CFG.SHEETS.DEST, patch);
  return patch;
}

function validateDestinatarioManual_(dest) {
  const faltando = [];
  if (!dest.nome) faltando.push('Nome');
  if (dest.cep.length !== 8) faltando.push('CEP com 8 dígitos');
  if (!dest.logradouro) faltando.push('Logradouro');
  if (!dest.numero) faltando.push('Número');
  if (!dest.bairro) faltando.push('Bairro');
  if (!dest.cidade) faltando.push('Cidade');
  if (dest.uf.length !== 2) faltando.push('UF');
  if (faltando.length) throw new Error('Preencha: ' + faltando.join(', ') + '.');
}

/** Autocomplete legado e novo: busca livre limitada. */
function action_buscarDestinatarios_(params) {
  const sessionClient = getSessionClient_(params.sessionToken);
  const q = lower_(params.q || '');
  const uf = upper_(params.uf || '');
  const limit = Math.min(toNumber_(params.limit, 10), 100);
  ensureDestinatariosHeaders_();
  let meus = readSheetAsObjects_(CFG.SHEETS.DEST).filter(r => sanitize_(r.LOGIN_APP) === sessionClient.LOGIN_APP);
  if (uf) meus = meus.filter(r => upper_(r.UF) === uf);
  if (q) {
    const qDigits = digitsOnly_(q);
    meus = meus.filter(r => lower_(r.NOME).indexOf(q) >= 0 ||
      (qDigits && digitsOnly_(r.CPF_CNPJ).indexOf(qDigits) >= 0) ||
      (qDigits && digitsOnly_(r.CEP).indexOf(qDigits) >= 0));
  }
  meus.sort((a,b) => {
    const uso = toNumber_(b.TOTAL_USOS,0) - toNumber_(a.TOTAL_USOS,0);
    if (uso !== 0) return uso;
    return lower_(a.NOME).localeCompare(lower_(b.NOME));
  });
  return { total: meus.length, items: meus.slice(0, limit).map(destItemFromRow_) };
}

/** AÇÃO: listarDestinatarios — tela de controle. */
function action_listarDestinatarios_(params) {
  const sessionClient = getSessionClient_(params.sessionToken);
  const f = params.filtros || {};
  const q = lower_(f.busca || f.q || '');
  const uf = upper_(f.uf || '');
  const limit = Math.min(toNumber_(f.limit, 500), 1000);
  ensureDestinatariosHeaders_();
  const todos = readSheetAsObjects_(CFG.SHEETS.DEST).filter(r => sanitize_(r.LOGIN_APP) === sessionClient.LOGIN_APP);
  const ufs = Array.from(new Set(todos.map(r => upper_(r.UF)).filter(Boolean))).sort();
  let rows = todos;
  if (uf) rows = rows.filter(r => upper_(r.UF) === uf);
  if (q) {
    const qDigits = digitsOnly_(q);
    rows = rows.filter(r => lower_(r.NOME).indexOf(q) >= 0 ||
      lower_(r.EMAIL).indexOf(q) >= 0 ||
      (qDigits && digitsOnly_(r.CPF_CNPJ).indexOf(qDigits) >= 0) ||
      (qDigits && digitsOnly_(r.CELULAR).indexOf(qDigits) >= 0) ||
      (qDigits && digitsOnly_(r.CEP).indexOf(qDigits) >= 0));
  }
  rows.sort((a,b) => lower_(a.NOME).localeCompare(lower_(b.NOME)));
  return { total: rows.length, ufs: ufs, items: rows.slice(0, limit).map(destItemFromRow_) };
}

/** AÇÃO: salvarDestinatario — manual ou importação NF-e. */
function action_salvarDestinatario_(params) {
  const sessionClient = getSessionClient_(params.sessionToken);
  const payload = params.payload || {};
  const dest = normalizeDestinatarioPayload_(payload);
  const origem = upper_(payload.origemCadastro || 'MANUAL');
  if (origem === 'MANUAL') validateDestinatarioManual_(dest);
  else {
    if (!dest.nome) throw new Error('Nome do destinatário obrigatório.');
    if (dest.cep && dest.cep.length !== 8) throw new Error('CEP do destinatário inválido.');
  }
  let saved;
  withLock_(() => { saved = upsertDestinatario_(sessionClient.LOGIN_APP, payload, { registrarUso: false, origemCadastro: origem }); });
  return { ok: true, item: destItemFromRow_(Object.assign({ _row: 0 }, saved)) };
}



/** AÇÃO: importarDestinatariosCsv — upsert em lote enviado pelo frontend. */
function action_importarDestinatariosCsv_(params) {
  const sessionClient = getSessionClient_(params.sessionToken);
  const items = Array.isArray(params.items)
    ? params.items
    : (params.payload && Array.isArray(params.payload.items) ? params.payload.items : []);

  if (!items.length) throw new Error('O CSV não contém destinatários para importar.');
  if (items.length > 500) throw new Error('Importe no máximo 500 destinatários por arquivo CSV.');

  const out = { recebidos: items.length, importados: 0, criados: 0, atualizados: 0, erros: [] };
  ensureDestinatariosHeaders_();

  withLock_(() => {
    items.forEach((raw, index) => {
      try {
        const payload = Object.assign({}, raw || {}, { origemCadastro: 'CSV_IMPORT' });
        const dest = normalizeDestinatarioPayload_(payload);
        if (!dest.nome) throw new Error('Nome obrigatório.');
        if (dest.cep && dest.cep.length !== 8) throw new Error('CEP deve conter 8 dígitos.');
        if (dest.uf && dest.uf.length !== 2) throw new Error('UF deve conter 2 letras.');

        const existing = findDestinatarioRow_(sessionClient.LOGIN_APP, dest);
        upsertDestinatario_(sessionClient.LOGIN_APP, payload, {
          registrarUso: false,
          origemCadastro: 'CSV_IMPORT'
        });
        out.importados += 1;
        if (existing) out.atualizados += 1;
        else out.criados += 1;
      } catch (e) {
        out.erros.push({ linha: index + 2, mensagem: e.message || String(e) });
      }
    });
  });

  return out;
}

/** AÇÃO: excluirDestinatario — remove somente registros do cliente logado. */
function action_excluirDestinatario_(params) {
  const sessionClient = getSessionClient_(params.sessionToken);
  const id = sanitize_(params.idDestinatario);
  if (!id) throw new Error('idDestinatario obrigatório.');
  ensureDestinatariosHeaders_();
  const rows = readSheetAsObjects_(CFG.SHEETS.DEST);
  const row = rows.find(r => sanitize_(r.LOGIN_APP) === sessionClient.LOGIN_APP && (sanitize_(r.ID_DESTINATARIO) === id || ('ROW_' + r._row) === id));
  if (!row) throw new Error('Destinatário não encontrado ou sem permissão.');
  withLock_(() => { getSheet_(CFG.SHEETS.DEST).deleteRow(row._row); });
  return { ok: true, idDestinatario: id };
}

/** Contato para enriquecer históricos legados sem DEST_CELULAR. */
function buildDestinatarioContatoLookup_(loginApp) {
  ensureDestinatariosHeaders_();
  const login = sanitize_(loginApp);
  const map = {};
  readSheetAsObjects_(CFG.SHEETS.DEST)
    .filter(r => sanitize_(r.LOGIN_APP) === login)
    .forEach(r => {
      const dest = normalizeDestinatarioPayload_({
        destinatarioNome: r.NOME,
        destinatarioCpfCnpj: r.CPF_CNPJ,
        destinatarioCep: r.CEP
      });
      const contato = { celular: digitsOnly_(r.CELULAR), email: sanitize_(r.EMAIL) };
      map[destinatarioKeyNormalized_(login, dest)] = contato;
      map[login + '|NOMECEP|' + lower_(dest.nome) + '|' + digitsOnly_(dest.cep)] = contato;
    });
  return map;
}

function getDestinatarioContatoParaHistorico_(loginApp, histRow, lookup) {
  const login = sanitize_(loginApp);
  const dest = normalizeDestinatarioPayload_({
    destinatarioNome: histRow.DEST_NOME,
    destinatarioCpfCnpj: histRow.DEST_CPFCNPJ,
    destinatarioCep: histRow.DEST_CEP
  });
  const map = lookup || buildDestinatarioContatoLookup_(login);
  return map[destinatarioKeyNormalized_(login, dest)] ||
    map[login + '|NOMECEP|' + lower_(dest.nome) + '|' + digitsOnly_(dest.cep)] ||
    { celular: '', email: '' };
}
