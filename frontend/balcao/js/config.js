/* =====================================================
   Atendimento Balcão AGF — Config
   =====================================================
   Usa o mesmo Web App do Apps Script do app principal.
   Backend esperado: actions públicas balcaoConfig, balcaoCep,
   balcaoCotar, balcaoSalvarRascunho.
*/

const BALCAO_CONFIG = {
  GAS_WEBAPP_URL: 'https://script.google.com/macros/s/AKfycbxwQQrMqe-2PFT1unzfzC0YOKB4VHqdwnMw6_ZzYCLZ0VmfITS5p4qn3A8zZE_gpVhl/exec',
  APP_NAME: 'Atendimento Balcão AGF',
  VERSION: '1.1.1',
  CEP_ORIGEM_FALLBACK: '60055974',
  CIDADE_ORIGEM_FALLBACK: 'Fortaleza',
  UF_ORIGEM_FALLBACK: 'CE',
  WHATSAPP_SUPPORT_URL: 'https://wa.me/5585988864444'
};
