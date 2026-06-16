const CFG = {
  SPREADSHEET_ID: '1OhBUj_0R5HOKJ_NSEHSJyuBmfEUJUGsY6liHmDN7j-c',
  SHEETS: {
    CLIENTES: 'CLIENTES_APP',
    CONFIG: 'CONFIG_APP',
    LISTAS: 'LISTAS_APP',
    HIST: 'HISTORICO_ETIQUETAS',
    LOG: 'LOG_APP'
  },
  SESSION_PREFIX: 'APP_ETQ_SESSION_',
  SESSION_TTL_SEC: 60 * 60 * 12,
  APP_TITLE: 'APP Etiquetas',
  CWS: {
    BASES: {
      HOMOLOGACAO: {
        TOKEN: 'https://apihom.correios.com.br/token',
        PREPOSTAGEM: 'https://apihom.correios.com.br/prepostagem'
      },
      PRODUCAO: {
        TOKEN: 'https://api.correios.com.br/token',
        PREPOSTAGEM: 'https://api.correios.com.br/prepostagem'
      }
    },
    TOKEN_TTL_SEC_FALLBACK: 60 * 30,
    DEFAULT_TIPO_ROTULO: 'P',
    DEFAULT_FORMATO_ROTULO: 'ET',
    DEFAULT_TIPO_DOCUMENTO: 'NF'
  }
};

function getSs_() {
  return SpreadsheetApp.openById(CFG.SPREADSHEET_ID);
}

function getSheet_(name) {
  const sh = getSs_().getSheetByName(name);
  if (!sh) throw new Error('Aba não encontrada: ' + name);
  return sh;
}

function getConfigMap_() {
  const sh = getSheet_(CFG.SHEETS.CONFIG);
  const values = sh.getDataRange().getDisplayValues();
  const map = {};
  for (let i = 1; i < values.length; i++) {
    const key = sanitizeText_(values[i][0]);
    if (key) map[key] = values[i][1];
  }
  return map;
}
