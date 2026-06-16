/* =====================================================
   APP ETIQUETAS — Frontend Config
   =====================================================
   ÚNICA PEÇA QUE VOCÊ PRECISA EDITAR ANTES DE DEPLOYAR.

   Cole aqui a URL do Web App do Apps Script após
   o "Deploy → New deployment → Web app".

   Exemplo:
   GAS_WEBAPP_URL: "https://script.google.com/macros/s/AKfycbx.../exec"
   ===================================================== */

const APP_CONFIG = {
  GAS_WEBAPP_URL: 'https://script.google.com/macros/s/AKfycbxwQQrMqe-2PFT1unzfzC0YOKB4VHqdwnMw6_ZzYCLZ0VmfITS5p4qn3A8zZE_gpVhl/exec',

  // Web App externo do módulo leitor de NF-e em PDF.
  // Deploy separado do projeto nfs.zip. Necessário para o botão "Importar PDF da NF-e".
  NFE_WEBAPP_URL: 'https://script.google.com/macros/s/AKfycbyBkFo2-qyULNKpagr8IF2gZ9KIP-cRl0D-s2ogNDzSr4dUeImNk7BbK2xg61pKOhr3jQ/exec',

  // Versão do frontend (mostrada na tela de Config)
  VERSION: '2.3.3-destinatarios-v29-danfe-v10-ie-validation-fix',

  APP_NAME: 'Postagens AGF José Bonifácio',

  WHATSAPP_SUPPORT_URL: 'https://wa.me/5585988864444',

  // Persistência local
  STORAGE_KEYS: {
    SESSION_TOKEN: 'agf_etq_token',
    CLIENT: 'agf_etq_client',
    LAST_LOGIN: 'agf_etq_login'
  },

  // Comportamento
  TOAST_DURATION_MS: 3500,
  AUTOCOMPLETE_MIN_CHARS: 2,
  AUTOCOMPLETE_DEBOUNCE_MS: 250
};

// Expõe a configuração para módulos carregados separadamente (ex.: importador NF-e).
window.APP_CONFIG = APP_CONFIG;
