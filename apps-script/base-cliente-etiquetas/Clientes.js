function getAppBootstrap() {
  const cfg = getConfigMap_();
  return {
    ok: true,
    appName: cfg.APP_NOME || CFG.APP_TITLE,
    formatos: getListaByName_('FORMATO_ETIQUETA'),
    tiposObjeto: getListaByName_('TIPO_OBJETO'),
    servicos: getListaByName_('SERVICO'),
    arOptions: getListaByName_('ADICIONAL_AR'),
    vdOptions: getListaByName_('ADICIONAL_VD')
  };
}

function getListaByName_(listName) {
  const rows = getDataObjects_(CFG.SHEETS.LISTAS)
    .filter(r => sanitizeText_(r.LISTA) === sanitizeText_(listName) && sanitizeText_(r.ATIVO) === 'SIM')
    .sort((a, b) => Number(a.ORDEM || 999) - Number(b.ORDEM || 999));
  return rows.map(r => ({ value: r.VALOR, label: r.LABEL || r.VALOR }));
}
