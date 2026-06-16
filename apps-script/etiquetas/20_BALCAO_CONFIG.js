/**
 * APP ETIQUETAS AGF — 20_BALCAO_CONFIG.gs
 * Módulo: Calculadora Balcão à Vista
 *
 * Objetivo:
 * - Calcular PREÇO de balcão por tabela interna no Google Sheets.
 * - Consultar PRAZO pela API Prazo dos Correios, quando configurada.
 * - Manter o fluxo parecido com o app atual: informar dados uma vez e mostrar
 *   comparativo de todas as opções disponíveis.
 *
 * Este módulo NÃO gera SRO. Ele prepara uma cotação e um rascunho para alimentar,
 * depois, a etiqueta/ficha de balcão sem SRO físico.
 */

const BCFG = {
  APP_VERSION: 'BALCAO-1.0.1-CEP-CORREIOS',

  SHEETS: {
    CONFIG: 'BALCAO_CONFIG',
    SERVICOS: 'BALCAO_SERVICOS',
    TARIFAS: 'BALCAO_TARIFAS',
    ADICIONAIS: 'BALCAO_ADICIONAIS',
    RASCUNHOS: 'BALCAO_RASCUNHOS',
    LOG: 'BALCAO_LOG'
  },

  DEFAULTS: {
    CEP_ORIGEM: '60055974',
    CIDADE_ORIGEM: 'Fortaleza',
    UF_ORIGEM: 'CE',
    CUBAGEM_DIVISOR: 6000,
    CUBAGEM_ISENCAO_KG: 5,
    AD_VALOREM_PERCENT: 0.01,
    INDENIZACAO_AUTOMATICA: 25.63,
    VD_MIN: 24.50,
    VD_MAX_PAC: 4477.36,
    VD_MAX_SEDEX: 38057.59,
    API_PRAZO_ATIVA: 'SIM'
  },

  PROPS: {
    PRAZO_LOGIN: 'BALCAO_CWS_LOGIN_IDCORREIOS',
    PRAZO_TOKEN_API: 'BALCAO_CWS_TOKEN_API',
    PRAZO_CARTAO: 'BALCAO_CWS_CARTAO_POSTAGEM',
    PRAZO_AMBIENTE: 'BALCAO_CWS_AMBIENTE',
    PRAZO_TOKEN_CACHE: 'BALCAO_CWS_PRAZO_TOKEN_CACHE'
  },

  SERVICOS_PADRAO: [
    { codigo: '04510', nome: 'PAC à vista', chave: 'PAC', ativo: 'SIM', tipo: 'PAC', codigoPrazo: '04510', limitePesoG: 30000 },
    { codigo: '04014', nome: 'SEDEX à vista', chave: 'SEDEX', ativo: 'SIM', tipo: 'SEDEX', codigoPrazo: '04014', limitePesoG: 30000 },
    { codigo: '04790', nome: 'SEDEX 10', chave: 'SEDEX10', ativo: 'SIM', tipo: 'SEDEX', codigoPrazo: '04790', limitePesoG: 30000 },
    { codigo: '04782', nome: 'SEDEX 12', chave: 'SEDEX12', ativo: 'SIM', tipo: 'SEDEX', codigoPrazo: '04782', limitePesoG: 30000 },
    { codigo: '04804', nome: 'SEDEX Hoje', chave: 'SEDEXHOJE', ativo: 'SIM', tipo: 'SEDEX', codigoPrazo: '04804', limitePesoG: 10000 }
  ],

  CAPITAIS: {
    AC: 'RIO BRANCO', AL: 'MACEIO', AP: 'MACAPA', AM: 'MANAUS', BA: 'SALVADOR', CE: 'FORTALEZA', DF: 'BRASILIA',
    ES: 'VITORIA', GO: 'GOIANIA', MA: 'SAO LUIS', MT: 'CUIABA', MS: 'CAMPO GRANDE', MG: 'BELO HORIZONTE',
    PA: 'BELEM', PB: 'JOAO PESSOA', PR: 'CURITIBA', PE: 'RECIFE', PI: 'TERESINA', RJ: 'RIO DE JANEIRO',
    RN: 'NATAL', RS: 'PORTO ALEGRE', RO: 'PORTO VELHO', RR: 'BOA VISTA', SC: 'FLORIANOPOLIS',
    SP: 'SAO PAULO', SE: 'ARACAJU', TO: 'PALMAS'
  }
};

/**
 * Rode uma vez se quiser gravar as credenciais da API Prazo para a calculadora balcão.
 * Use o mesmo padrão do CWS: idCorreios/login, senha/código da API e cartão de postagem.
 */
function balcaoConfigurarApiPrazo(loginIdCorreios, tokenApi, cartaoPostagem, ambiente) {
  if (!loginIdCorreios || !tokenApi || !cartaoPostagem) {
    throw new Error('Informe loginIdCorreios, tokenApi e cartaoPostagem.');
  }
  const props = PropertiesService.getScriptProperties();
  props.setProperties({
    [BCFG.PROPS.PRAZO_LOGIN]: String(loginIdCorreios).trim(),
    [BCFG.PROPS.PRAZO_TOKEN_API]: String(tokenApi).trim(),
    [BCFG.PROPS.PRAZO_CARTAO]: String(cartaoPostagem).replace(/\D/g, ''),
    [BCFG.PROPS.PRAZO_AMBIENTE]: String(ambiente || 'PRODUCAO').trim().toUpperCase()
  }, true);
  CacheService.getScriptCache().remove(BCFG.PROPS.PRAZO_TOKEN_CACHE);
  return { ok: true, message: 'Credenciais da API Prazo gravadas.' };
}

/**
 * Cria as abas-base da calculadora de balcão na planilha principal do app.
 * Não substitui as tabelas oficiais: cria estrutura normalizada para você colar/importar.
 */
function balcaoCriarAbasModelo() {
  const ss = getBalcaoSpreadsheet_();
  ensureBalcaoSheet_(ss, BCFG.SHEETS.CONFIG, ['CHAVE', 'VALOR', 'OBS']);
  ensureBalcaoSheet_(ss, BCFG.SHEETS.SERVICOS, [
    'ATIVO','CHAVE','CODIGO_SERVICO','CODIGO_PRAZO','NOME','TIPO','LIMITE_PESO_G','PERMITE_AR','PERMITE_MP','PERMITE_VD','ORDEM'
  ]);
  ensureBalcaoSheet_(ss, BCFG.SHEETS.TARIFAS, [
    'ATIVO','CHAVE_SERVICO','CODIGO_SERVICO','UF_ORIGEM','UF_DESTINO','GRUPO_DESTINO','TRECHO','PESO_MIN_G','PESO_MAX_G','PRECO_BASE','KG_ADICIONAL','OBS'
  ]);
  ensureBalcaoSheet_(ss, BCFG.SHEETS.ADICIONAIS, ['CHAVE','DESCRICAO','VALOR','ATIVO','OBS']);
  ensureBalcaoSheet_(ss, BCFG.SHEETS.RASCUNHOS, [
    'ID','DATA_HORA','CEP_ORIGEM','CIDADE_ORIGEM','UF_ORIGEM','CEP_DESTINO','CIDADE_DESTINO','UF_DESTINO','TIPO_OBJETO','PESO_G','ALTURA_CM','LARGURA_CM','COMPRIMENTO_CM','DIAMETRO_CM','VALOR_DECLARADO','AR','MAO_PROPRIA','SERVICO_ESCOLHIDO','CODIGO_SERVICO','PRECO_TOTAL','PRAZO_DIAS','RAW_JSON'
  ]);
  ensureBalcaoSheet_(ss, BCFG.SHEETS.LOG, ['DATA_HORA','NIVEL','MODULO','ACAO','MENSAGEM','JSON']);

  seedBalcaoConfig_(ss);
  seedBalcaoServicos_(ss);
  seedBalcaoAdicionais_(ss);
  seedBalcaoTarifasExemplo_(ss);

  return {
    ok: true,
    spreadsheetId: ss.getId(),
    url: ss.getUrl(),
    message: 'Abas da Calculadora Balcão criadas/atualizadas. Cole as tarifas oficiais normalizadas em BALCAO_TARIFAS.'
  };
}

function seedBalcaoConfig_(ss) {
  const sh = ss.getSheetByName(BCFG.SHEETS.CONFIG);
  const existing = sheetToObjects_(sh);
  if (existing.length) return;
  sh.getRange(2,1,10,3).setValues([
    ['CEP_ORIGEM_DEFAULT', BCFG.DEFAULTS.CEP_ORIGEM, 'CEP da agência. Pode ser alterado no front.'],
    ['CIDADE_ORIGEM_DEFAULT', BCFG.DEFAULTS.CIDADE_ORIGEM, 'Cidade padrão da agência.'],
    ['UF_ORIGEM_DEFAULT', BCFG.DEFAULTS.UF_ORIGEM, 'UF padrão da agência.'],
    ['CUBAGEM_DIVISOR', BCFG.DEFAULTS.CUBAGEM_DIVISOR, 'Fator de cubagem nacional.'],
    ['CUBAGEM_ISENCAO_KG', BCFG.DEFAULTS.CUBAGEM_ISENCAO_KG, 'Até este peso cúbico, tarifa por peso real.'],
    ['AD_VALOREM_PERCENT', BCFG.DEFAULTS.AD_VALOREM_PERCENT, 'Valor Declarado de encomendas: 1% sobre o excedente da indenização automática.'],
    ['INDENIZACAO_AUTOMATICA', BCFG.DEFAULTS.INDENIZACAO_AUTOMATICA, 'Valor coberto automaticamente antes do VD adicional.'],
    ['VD_MIN', BCFG.DEFAULTS.VD_MIN, 'Valor mínimo declarado.'],
    ['VD_MAX_PAC', BCFG.DEFAULTS.VD_MAX_PAC, 'Valor máximo declarado PAC.'],
    ['VD_MAX_SEDEX', BCFG.DEFAULTS.VD_MAX_SEDEX, 'Valor máximo declarado SEDEX.']
  ]);
}

function seedBalcaoServicos_(ss) {
  const sh = ss.getSheetByName(BCFG.SHEETS.SERVICOS);
  if (sheetToObjects_(sh).length) return;
  const rows = BCFG.SERVICOS_PADRAO.map((s, idx) => [
    s.ativo, s.chave, s.codigo, s.codigoPrazo, s.nome, s.tipo, s.limitePesoG, 'SIM', 'SIM', 'SIM', idx + 1
  ]);
  sh.getRange(2,1,rows.length,rows[0].length).setValues(rows);
}

function seedBalcaoAdicionais_(ss) {
  const sh = ss.getSheetByName(BCFG.SHEETS.ADICIONAIS);
  if (sheetToObjects_(sh).length) return;
  sh.getRange(2,1,4,5).setValues([
    ['AR', 'Aviso de Recebimento à vista', 8.10, 'SIM', 'Valor da tabela Serviços Adicionais e Outros 2026.'],
    ['MP', 'Mão Própria à vista', 9.55, 'SIM', 'Valor da tabela Serviços Adicionais e Outros 2026.'],
    ['VD_PERCENT', 'Percentual de Valor Declarado para encomendas', 0.01, 'SIM', 'Usado como fração: 0,01 = 1%.'],
    ['INDENIZACAO_AUTOMATICA', 'Indenização automática', 25.63, 'SIM', 'Valor abatido antes de calcular VD adicional.']
  ]);
}

function seedBalcaoTarifasExemplo_(ss) {
  const sh = ss.getSheetByName(BCFG.SHEETS.TARIFAS);
  if (sheetToObjects_(sh).length) return;
  sh.getRange(2,1,6,12).setValues([
    ['SIM','PAC','04510','CE','CE','Local','TODOS',0,300,23.30,'','Exemplo oficial visível na tabela PAC 2026. Substitua/complete.'],
    ['SIM','PAC','04510','CE','RJ','BA, PA, MG, RJ','TODOS',0,300,34.20,'','Exemplo para CE → RJ até 300g.'],
    ['SIM','SEDEX','04014','CE','CE','Local','TODOS',0,300,25.80,'','Exemplo oficial visível na tabela SEDEX 2026.'],
    ['SIM','SEDEX','04014','CE','RJ','BA, PA, MG, RJ','TODOS',0,300,77.10,'','Exemplo para CE → RJ até 300g.'],
    ['SIM','SEDEX','04014','CE','RJ','BA, PA, MG, RJ','TODOS',301,1000,83.60,'','Exemplo para CE → RJ 301 a 1000g.'],
    ['SIM','SEDEX','04014','CE','RJ','BA, PA, MG, RJ','TODOS',1001,2000,100.80,'','Exemplo para CE → RJ 1001 a 2000g.']
  ]);
}

function ensureBalcaoSheet_(ss, name, headers) {
  let sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  if (sh.getLastRow() === 0) {
    sh.getRange(1,1,1,headers.length).setValues([headers]);
  } else {
    const current = sh.getRange(1,1,1,Math.max(headers.length, sh.getLastColumn())).getValues()[0];
    const empty = current.every(v => String(v || '').trim() === '');
    if (empty) sh.getRange(1,1,1,headers.length).setValues([headers]);
  }
  sh.setFrozenRows(1);
  try { sh.getRange(1,1,1,headers.length).setFontWeight('bold'); } catch(e) {}
  return sh;
}
