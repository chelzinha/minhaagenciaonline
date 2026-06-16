/**
 * APP ETIQUETAS AGF — 00_CFG.gs
 * Constantes centralizadas. Toda configuração mora aqui.
 *
 * Edite SPREADSHEET_ID e DRIVE_FOLDER_ID antes do primeiro deploy.
 */

const CFG = {
  // ============ PLANILHAS ============
  // Planilha principal do /app e /balcao. NÃO trocar para o SuperFrete.
  SPREADSHEET_ID: '1_QJT-6JcOG6GAB-eiNNHTbeJbW3hV4yKyGLcZL3FT1Q',

  // Planilha exclusiva do módulo /superfrete e /superfrete-admin.
  // Cole aqui o ID da planilha AGF SuperFrete criada na Etapa 1.
  SF_SPREADSHEET_ID: '1XhUX602YbOQecbduNEVvtyd0LMTOBOExQ57TwEbl9hU',

  SHEETS: {
    CLIENTES: 'CLIENTES_APP',
    CONFIG: 'CONFIG_APP',
    LISTAS: 'LISTAS_APP',
    HIST: 'HISTORICO_ETIQUETAS',
    DEST: 'DESTINATARIOS',
    LOG: 'LOG_APP'
  },

  // ============ DRIVE (PDFs gerados) ============
  // Crie uma pasta no Drive e cole o ID aqui. Os PDFs ficam salvos lá
  // para reimpressão posterior sem precisar chamar a Correios de novo.
  DRIVE_FOLDER_ID: '1ozECST1e66JiJ--MXf2olTMp0UJorJLH',

  // ============ APP ============
  APP_TITLE: 'APP Etiquetas AGF José Bonifácio',
  APP_VERSION: '2.2.0-DESTINATARIOS',

  // CORS / origens permitidas para chamadas do Netlify
  // Use ['*'] em desenvolvimento e restrinja em produção.
  ALLOWED_ORIGINS: ['*'],

  // ============ SESSÕES ============
  SESSION_PREFIX: 'APP_ETQ_SES_',
  SESSION_TTL_SEC: 60 * 60 * 12,  // 12h

  // ============ CORREIOS API (CWS) ============
  CWS: {
    BASES: {
      HOMOLOGACAO: {
        TOKEN: 'https://apihom.correios.com.br/token',
        PREPOSTAGEM: 'https://apihom.correios.com.br/prepostagem',
        CEP: 'https://apihom.correios.com.br/cep',
        PRECO: 'https://apihom.correios.com.br/preco',
        PRAZO: 'https://apihom.correios.com.br/prazo'
      },
      PRODUCAO: {
        TOKEN: 'https://api.correios.com.br/token',
        PREPOSTAGEM: 'https://api.correios.com.br/prepostagem',
        CEP: 'https://api.correios.com.br/cep',
        PRECO: 'https://api.correios.com.br/preco',
        PRAZO: 'https://api.correios.com.br/prazo'
      }
    },

    // Margem de segurança ao cachear o token (subtraída de expiraEm).
    // Token vale 24h; vamos renovar 30min antes de expirar.
    TOKEN_MARGEM_SEGURANCA_SEC: 60 * 30,
    TOKEN_TTL_FALLBACK_SEC: 60 * 60 * 23,  // 23h se expiraEm vier vazio

    // Polling do rótulo assíncrono
    ROTULO_POLL_INTERVAL_MS: 1500,
    ROTULO_POLL_TIMEOUT_MS: 75000,
    ROTULO_POLL_MAX_TENTATIVAS: 30,

    // Polling da declaração de conteúdo assíncrona (mesmo padrão do rótulo)
    DECLARACAO_POLL_INTERVAL_MS: 1500,
    DECLARACAO_POLL_TIMEOUT_MS: 45000,
    DECLARACAO_POLL_MAX_TENTATIVAS: 30,

    // Defaults editáveis em CONFIG_APP
    DEFAULT_TIPO_ROTULO: 'P',         // P=Padrão, R=Reduzido
    DEFAULT_FORMATO_ROTULO: 'ET',     // ET=Etiqueta, A4=Folha A4
    DEFAULT_TIPO_DOCUMENTO: 'DC',     // DC=Declaração, NF=Nota Fiscal, OUTRO

    // Códigos de serviços adicionais (manual capítulo 13/15)
    SERVICOS_ADICIONAIS: {
      AVISO_RECEBIMENTO: '001',
      MAO_PROPRIA: '002',
      VALOR_DECLARADO: '019',
      VALOR_DECLARADO_PAC: '064'
    }
  },

  // ============ MAPEAMENTOS ============
  // tipoObjeto da UI -> codigoFormatoObjetoInformado da API
  // (manual: 1=Envelope, 2=Caixa/Pacote, 3=Cilindro/Rolo)
  TIPO_OBJETO_MAP: {
    'ENVELOPE': '1',
    'CAIXA': '2',
    'PACOTE': '2',
    'ROLO': '3',
    'CILINDRO': '3'
  },

  // Validações
  VALIDACAO: {
    PESO_MIN_G: 1,
    PESO_MAX_G: 30000,
    DIM_MIN_CM: 1,
    DIM_MAX_CM: 105
  },

  // ============ ETIQUETA DIRETA ============
  // Fluxo simplificado da aba ETIQUETA: não passa por cotação e
  // não pede peso/medidas ao usuário. Esses defaults ficam só no
  // backend para o Atende/CWS receber um payload completo.
  ETIQUETA_DIRETA: {
    TIPO_OBJETO: 'ENVELOPE',
    PESO_G: 300,
    COMPRIMENTO_CM: 16,
    LARGURA_CM: 11,
    ALTURA_CM: 2,
    DIAMETRO_CM: 0
  }
};

// Travas internas (não editar)
const SYS = {
  LOCK_TIMEOUT_MS: 15000,
  CACHE_LOCAL_TTL_MS: 60000,
  LOG_TRUNCATE_LEN: 4000
};