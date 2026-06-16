/* Minhas Postagens Cliente — Config */
const SF_CLIENT_CONFIG = {
  GAS_WEBAPP_URL: 'https://script.google.com/macros/s/AKfycbxwQQrMqe-2PFT1unzfzC0YOKB4VHqdwnMw6_ZzYCLZ0VmfITS5p4qn3A8zZE_gpVhl/exec',

  // Web App externo do módulo leitor de NF-e em PDF.
  // Deploy separado do projeto nfs.zip. Necessário para o botão "Importar PDF da NF-e".
  NFE_WEBAPP_URL: 'https://script.google.com/macros/s/AKfycbyBkFo2-qyULNKpagr8IF2gZ9KIP-cRl0D-s2ogNDzSr4dUeImNk7BbK2xg61pKOhr3jQ/exec',
  APP_NAME: 'Minhas Postagens',
  VERSION: '0.9.1-cliente-danfe-preview-v10',
  WHATSAPP_SUPPORT_URL: 'https://wa.me/5585988864444',
  TRACKING_URL: 'https://rastreamento.correios.com.br/app/index.php?objeto=',
  STORAGE_KEYS: {
    WEBAPP_URL: 'agf_sf_client_webapp_url',
    SESSION_TOKEN: 'agf_sf_client_session_token',
    USER: 'agf_sf_client_user',
    LAST_LOGIN: 'agf_sf_client_last_login',
    DRAFT: 'agf_sf_client_draft'
  }
};


// Expõe a configuração para módulos carregados separadamente (ex.: importador NF-e).
window.SF_CLIENT_CONFIG = SF_CLIENT_CONFIG;
