const CFG = Object.freeze({
  PROP: {
    APP_ID: 'NUVEMSHOP_APP_ID',
    CLIENT_SECRET: 'NUVEMSHOP_CLIENT_SECRET',
    API_BASE_URL: 'NUVEMSHOP_API_BASE_URL',
    CONTACT_UA: 'NUVEMSHOP_CONTACT_UA',
    WEBAPP_URL: 'CONNECTOR_WEBAPP_URL',
    SPREADSHEET_ID: 'CONNECTOR_SPREADSHEET_ID'
  },

  SHEETS: {
    STORES: 'STORES',
    ORDERS: 'ORDERS',
    ORDER_ITEMS: 'ORDER_ITEMS',
    WEBHOOKS: 'WEBHOOKS',
    LOGS: 'LOGS'
  },

  HEADERS: {
    STORES: [
      'USER_ID',
      'ACCESS_TOKEN',
      'SCOPE',
      'STATUS',
      'INSTALLED_AT',
      'UPDATED_AT',
      'LAST_SYNC_AT',
      'LAST_SYNC_COUNT',
      'LAST_ERROR',
      'ID_CRM_REF'
    ],

    ORDERS: [
      'STORE_ID',
      'ORDER_ID',
      'ORDER_NUMBER',
      'CREATED_AT',
      'UPDATED_AT',
      'STATUS',
      'PAYMENT_STATUS',
      'SHIPPING_STATUS',
      'CUSTOMER_NAME',
      'CUSTOMER_EMAIL',
      'CUSTOMER_PHONE',
      'CUSTOMER_DOCUMENT',
      'SHIPPING_NAME',
      'SHIPPING_PHONE',
      'ZIP',
      'ADDRESS',
      'NUMBER',
      'FLOOR',
      'LOCALITY',
      'CITY',
      'PROVINCE',
      'TOTAL',
      'CURRENCY',
      'ORDER_WEIGHT',
      'ITEMS_COUNT',
      'SHIPPING_METHOD_RAW',
      'SHIPPING_SERVICE',
      'SHIPPING_OPTION_CODE',
      'SHIPPING_OPTION_NAME',
      'SHIPPING_CARRIER_CODE',
      'SHIPPING_CARRIER_NAME',
      'DOC_TYPE',
      'DOC_SOURCE',
      'INVOICE_KEY',
      'INVOICE_LINK',
      'INVOICE_JSON',
      'DECLARATION_ITEMS_JSON',
      'FULFILLMENTS_JSON',
      'RAW_JSON',
      'LAST_SYNC_AT',
      'REVIEW_JSON',
      'REVIEW_UPDATED_AT',
      'POSTAGENS_STATUS',
      'POSTAGENS_ID_REGISTRO',
      'POSTAGENS_ID_PREPOSTAGEM',
      'POSTAGENS_CODIGO_OBJETO',
      'POSTAGENS_URL_PDF',
      'POSTAGENS_URL_DECLARACAO',
      'POSTAGENS_ERRO',
      'POSTAGENS_UPDATED_AT',
      'FULFILLMENT_ORDER_ID',
      'NUVEMSHOP_TRACKING_SYNC_STATUS',
      'NUVEMSHOP_TRACKING_SYNC_AT',
      'NUVEMSHOP_TRACKING_SYNC_ERROR'
    ],

    ORDER_ITEMS: [
      'STORE_ID',
      'ORDER_ID',
      'LINE_KEY',
      'SKU',
      'NAME',
      'QUANTITY',
      'PRICE',
      'WEIGHT',
      'WIDTH',
      'HEIGHT',
      'DEPTH',
      'RAW_JSON',
      'LAST_SYNC_AT'
    ],

    WEBHOOKS: [
      'STORE_ID',
      'EVENT',
      'WEBHOOK_ID',
      'URL',
      'STATUS',
      'RAW_JSON',
      'UPDATED_AT'
    ],

    LOGS: [
      'AT',
      'LEVEL',
      'EVENT',
      'STORE_ID',
      'ORDER_ID',
      'MESSAGE',
      'DETAILS'
    ]
  }
});

function getConfig_() {
  const p = PropertiesService.getScriptProperties();
  return {
    appId: p.getProperty(CFG.PROP.APP_ID) || '',
    clientSecret: p.getProperty(CFG.PROP.CLIENT_SECRET) || '',
    apiBaseUrl: p.getProperty(CFG.PROP.API_BASE_URL) || 'https://api.nuvemshop.com.br/2025-03',
    contactUa: p.getProperty(CFG.PROP.CONTACT_UA) || 'MinhaAgenciaOnline (https://minhaagenciaonline.com.br)',
    webappUrl: p.getProperty(CFG.PROP.WEBAPP_URL) || '',
    spreadsheetId: p.getProperty(CFG.PROP.SPREADSHEET_ID) || ''
  };
}

/**
 * Preencha localmente e rode 1x.
 * Não deixe secrets hardcoded em produção.
 */
function bootstrapConnectorProperties_() {
  const p = PropertiesService.getScriptProperties();
  p.setProperties({
    [CFG.PROP.APP_ID]: '30001',
    [CFG.PROP.CLIENT_SECRET]: 'COLE_AQUI_O_CLIENT_SECRET_DA_NUVEMSHOP',
    [CFG.PROP.API_BASE_URL]: 'https://api.nuvemshop.com.br/2025-03',
    [CFG.PROP.CONTACT_UA]: 'MinhaAgenciaOnline (https://minhaagenciaonline.com.br)',
    [CFG.PROP.WEBAPP_URL]: 'COLE_AQUI_A_URL_EXEC_DO_WEBAPP_DO_CONECTOR'
  }, false);
}

function saveWebAppUrl_(url) {
  if (!url) throw new Error('Informe a URL /exec do Web App.');
  PropertiesService.getScriptProperties().setProperty(CFG.PROP.WEBAPP_URL, url);
}

function runBootstrapConnectorProperties() {
  bootstrapConnectorProperties_();
}


const FRONT_CFG = Object.freeze({
  SESSION_PREFIX: 'NUVEMSHOP_FRONT_SES_',
  SESSION_TTL_SEC: 60 * 60 * 12,
  APP_NAME: 'Minhas Postagens Nuvemshop',
  VERSION: '1.0.0'
});
