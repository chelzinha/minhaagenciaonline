/* =====================================================
   Atendimento Balcão AGF — Config
   =====================================================
   Backend: Worker agf-balcao-api (Cloudflare).
   Preço = tabelas à vista no D1. Prazo = API Prazo dos Correios.
*/

const BALCAO_CONFIG = {
  API_URL: /^(localhost|127\.0\.0\.1)$/.test(location.hostname)
    ? 'http://127.0.0.1:8787/api/balcao'
    : 'https://agf-balcao-api.chelzinha.workers.dev/api/balcao',
  APP_NAME: 'Atendimento Balcão AGF',
  VERSION: '2.0.0',
  CEP_ORIGEM_FALLBACK: '60055974',
  CIDADE_ORIGEM_FALLBACK: 'Fortaleza',
  UF_ORIGEM_FALLBACK: 'CE',
  WHATSAPP_SUPPORT_URL: 'https://wa.me/5585988864444'
};
