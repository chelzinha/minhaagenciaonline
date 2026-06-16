/**
 * AGF Address Service
 * Backend Apps Script separado para consulta centralizada de CEP/endereço.
 * Publicar como Web App: Executar como "Eu" / Acesso "Qualquer pessoa".
 */
const AGF_ADDRESS_CONFIG = Object.freeze({
  VERSION: '1.4.2-correios-api-cep-v3-faixa-numeracao',
  DEFAULT_UF: 'CE',
  DEFAULT_CIDADE: 'Fortaleza',
  MAX_RESULTS: 50,
  CORREIOS_ADDRESS_PAGE_LIMIT: 3, // páginas por variante; respeita paginação oficial
  CORREIOS_MAX_PAGE_SIZE: 2000, // conforme Swagger CEP v3
  CACHE_TTL_SECONDS: 21600, // 6 horas no CacheService
  SHEET_CACHE_MAX_AGE_DAYS: 120,
  SHEET_NAME: 'CACHE_ENDERECOS',
  LOG_PREFIX: '[AGF_ADDRESS]',

  /**
   * API oficial Busca CEP dos Correios.
   * Base principal de consulta nacional. Não coloque credenciais aqui; use Script Properties.
   */
  CORREIOS_API_PRODUCT_NAME: 'API CEP v3 (41)',
  // No Swagger público/manual, o produto CEP v3 expõe o recurso de endereços em /cep/v2/enderecos.
  // Se o Swagger do CWS da conta mostrar outro path, altere via setCorreiosCepEndpointUrl().
  CORREIOS_CEP_BASE_URL: 'https://api.correios.com.br/cep/v2/enderecos',
  CORREIOS_TOKEN_URL_PRIMARY: 'https://api.correios.com.br/token/v1/autentica/contrato',
  CORREIOS_TOKEN_URL_FALLBACK: 'https://api.correios.com.br/token/autentica/contrato',
  CORREIOS_TOKEN_REFRESH_BUFFER_SECONDS: 300
});

const AGF_ADDRESS_SCRIPT_PROPERTIES = Object.freeze({
  CACHE_SPREADSHEET_ID: 'ADDRESS_CACHE_SPREADSHEET_ID',
  DEFAULT_UF: 'ADDRESS_DEFAULT_UF',
  DEFAULT_CIDADE: 'ADDRESS_DEFAULT_CIDADE',
  CORREIOS_CEP_ENABLED: 'CORREIOS_CEP_ENABLED',
  CORREIOS_BEARER_TOKEN: 'CORREIOS_BEARER_TOKEN',
  CORREIOS_BEARER_TOKEN_EXPIRES_AT: 'CORREIOS_BEARER_TOKEN_EXPIRES_AT',
  CORREIOS_LOGIN: 'CORREIOS_LOGIN',
  CORREIOS_API_CODE: 'CORREIOS_API_CODE',
  CORREIOS_CONTRATO: 'CORREIOS_CONTRATO',
  CORREIOS_DR: 'CORREIOS_DR',
  CORREIOS_TOKEN_URL_PRIMARY: 'CORREIOS_TOKEN_URL_PRIMARY',
  CORREIOS_TOKEN_URL_FALLBACK: 'CORREIOS_TOKEN_URL_FALLBACK',
  CORREIOS_CEP_BASE_URL: 'CORREIOS_CEP_BASE_URL'
});

const AGF_ADDRESS_HEADERS = Object.freeze([
  'KEY',
  'TYPE',
  'CEP',
  'LOGRADOURO',
  'BAIRRO',
  'CIDADE',
  'UF',
  'IBGE',
  'PROVIDER',
  'CONFIDENCE',
  'JSON',
  'UPDATED_AT'
]);

const AGF_VALID_UFS = Object.freeze([
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG',
  'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'
]);

const AGF_STREET_TYPE_PREFIXES = Object.freeze([
  'RUA', 'R', 'AVENIDA', 'AV', 'AV.', 'TRAVESSA', 'TV', 'TV.', 'ALAMEDA', 'AL', 'AL.',
  'RODOVIA', 'ROD', 'ROD.', 'ESTRADA', 'EST', 'EST.', 'PRACA', 'PRAÇA', 'PC', 'PC.',
  'LARGO', 'VIELA', 'PASSAGEM', 'PASSARELA', 'CONJUNTO', 'CJ', 'CJ.', 'QUADRA', 'Q',
  'SERVIDAO', 'SERVIDÃO', 'BECO', 'LADEIRA', 'VIA'
]);

const AGF_UF_NAME_TO_SIGLA = Object.freeze({
  'ACRE': 'AC',
  'ALAGOAS': 'AL',
  'AMAPA': 'AP',
  'AMAZONAS': 'AM',
  'BAHIA': 'BA',
  'CEARA': 'CE',
  'DISTRITO FEDERAL': 'DF',
  'ESPIRITO SANTO': 'ES',
  'GOIAS': 'GO',
  'MARANHAO': 'MA',
  'MATO GROSSO': 'MT',
  'MATO GROSSO DO SUL': 'MS',
  'MINAS GERAIS': 'MG',
  'PARA': 'PA',
  'PARAIBA': 'PB',
  'PARANA': 'PR',
  'PERNAMBUCO': 'PE',
  'PIAUI': 'PI',
  'RIO DE JANEIRO': 'RJ',
  'RIO GRANDE DO NORTE': 'RN',
  'RIO GRANDE DO SUL': 'RS',
  'RONDONIA': 'RO',
  'RORAIMA': 'RR',
  'SANTA CATARINA': 'SC',
  'SAO PAULO': 'SP',
  'SERGIPE': 'SE',
  'TOCANTINS': 'TO'
});
