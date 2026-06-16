/**
 * AGF NFE PDF EXTRACTOR — 00_NFE_CFG.gs
 * Web App externo para ler DANFE/NF-e em PDF e devolver JSON pronto
 * para o app Minhas Postagens.
 *
 * Este projeto é isolado do backend atual. A integração com o /app
 * será feita depois, chamando este Web App externo.
 */
const NFE_CFG = {
  SERVICE_NAME: 'AGF NFe PDF Extractor',
  VERSION: '1.1.9-danfe10x15-optional-dest-ie-no-warning',
  TIMEZONE: 'America/Fortaleza',

  /**
   * Segurança / conversa com o app atual.
   *
   * Caminho recomendado em produção:
   * 1) Cole abaixo a mesma URL do Web App atual do /app.
   * 2) O front envia sessionToken junto com o PDF.
   * 3) Este script chama action=me no backend atual para validar a sessão.
   *
   * Enquanto MAIN_APP_GAS_URL estiver vazio e não houver secret salvo em
   * Script Properties, o serviço aceita chamadas para facilitar teste.
   */
  AUTH: {
    MAIN_APP_GAS_URL: '', // Ex: 'https://script.google.com/macros/s/AKfycbx.../exec'
    SESSION_ACTION: 'me',
    SECRET_PROP_NAME: 'NFE_API_SECRET',
    ALLOW_WITHOUT_AUTH_WHEN_UNCONFIGURED: true
  },

  PDF: {
    // 12 MB em base64 cobre DANFEs comuns com folga.
    MAX_BASE64_CHARS: 12 * 1024 * 1024,
    MAX_TEXT_CHARS: 350000,
    OCR_LANGUAGE: 'pt',
    // Tenta uma segunda leitura OCR apenas quando a leitura normal perdeu a IE do emitente.
    TRY_OCR_SUPPLEMENT_FOR_MISSING_IE: true,
    CLEANUP_CONVERTED_DOC: true,
    // Opcional: se quiser guardar PDFs temporários/conversões em uma pasta.
    TEMP_FOLDER_ID: ''
  },

  PARSER: {
    MIN_CONFIDENCE_ACCEPT: 0.55,
    MAX_ITEMS: 200,
    MIN_ITEM_DESC_LEN: 2
  }
};
