/**
 * AGF Address Service — configuração das credenciais Correios Busca CEP.
 *
 * Use este arquivo apenas no projeto Apps Script.
 * Preencha os valores abaixo, execute configurarCredenciaisCorreiosBuscaCep()
 * e depois execute testCorreiosToken().
 *
 * Não suba este arquivo no Netlify.
 */
function configurarCredenciaisCorreiosBuscaCep() {
  const LOGIN_IDCORREIOS = '57131893000121';
  const CODIGO_ACESSO_API = 'YsohnuoHSO0ulNVliKknZfWWLsL0fNgtl9kJmvQ3';
  const CONTRATO = '9912681821';
  const DR = ''; // opcional. Deixe vazio se você não usa DR na autenticação.

  const pendencias = [];
  if (!LOGIN_IDCORREIOS || LOGIN_IDCORREIOS.indexOf('PREENCHA_AQUI') >= 0) pendencias.push('LOGIN_IDCORREIOS');
  if (!CODIGO_ACESSO_API || CODIGO_ACESSO_API.indexOf('PREENCHA_AQUI') >= 0) pendencias.push('CODIGO_ACESSO_API');
  if (!CONTRATO || CONTRATO.indexOf('PREENCHA_AQUI') >= 0) pendencias.push('CONTRATO');

  if (pendencias.length) {
    throw new Error('Preencha antes de executar: ' + pendencias.join(', '));
  }

  const result = setCorreiosCepCredentials(
    LOGIN_IDCORREIOS,
    CODIGO_ACESSO_API,
    CONTRATO,
    DR
  );

  console.log(JSON.stringify(result, null, 2));
  return result;
}

/**
 * Mostra se as credenciais foram salvas, sem expor os valores completos.
 */
function verificarConfiguracaoCorreiosBuscaCep() {
  const props = PropertiesService.getScriptProperties();

  const login = props.getProperty(AGF_ADDRESS_SCRIPT_PROPERTIES.CORREIOS_LOGIN) || '';
  const codigo = props.getProperty(AGF_ADDRESS_SCRIPT_PROPERTIES.CORREIOS_API_CODE) || '';
  const contrato = props.getProperty(AGF_ADDRESS_SCRIPT_PROPERTIES.CORREIOS_CONTRATO) || '';
  const dr = props.getProperty(AGF_ADDRESS_SCRIPT_PROPERTIES.CORREIOS_DR) || '';
  const enabled = props.getProperty(AGF_ADDRESS_SCRIPT_PROPERTIES.CORREIOS_CEP_ENABLED) || 'false';
  const tokenExpiresAt = props.getProperty(AGF_ADDRESS_SCRIPT_PROPERTIES.CORREIOS_BEARER_TOKEN_EXPIRES_AT) || '';

  const status = {
    ok: !!login && !!codigo && !!contrato && enabled === 'true',
    correiosCepEnabled: enabled,
    loginPreview: login ? login.slice(0, 4) + '...' : '',
    codigoAcessoSalvo: !!codigo,
    contratoPreview: contrato ? contrato.slice(0, 3) + '...' + contrato.slice(-2) : '',
    drInformada: !!dr,
    tokenExpiresAt,
    proximoTeste: 'Execute testCorreiosToken() e depois testCorreiosBuscaNacionalMariaTomasia().'
  };

  console.log(JSON.stringify(status, null, 2));
  return status;
}
