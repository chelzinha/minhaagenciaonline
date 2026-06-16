/**
 * AGF José Bonifácio — Portal interno
 * Configurações centrais do controle de acesso.
 */
const AGF_AUTH_CFG = Object.freeze({
  APP_NAME: 'AGF José Bonifácio — Portal Interno',
  DB_PROP: 'AGF_AUTH_SPREADSHEET_ID',
  CRM_DB_PROP: 'AGF_AUTH_CRM_SPREADSHEET_ID',
  CRM_DEFAULT_DB_ID: '1zJUYkvWzcTdHrgqdIMWOY2pm3qDoJoRlu9u43lV7QDA',
  PEPPER_PROP: 'AGF_AUTH_PASSWORD_PEPPER',
  JWT_PROP: 'AGF_AUTH_JWT_SECRET',
  UI_PROP: 'AGF_AUTH_UI_CONFIG',
  SESSION_DAYS: 3650,
  HASH_ROUNDS: 1800,
  SESSION_CACHE_SECONDS: 120,
  USERS_CACHE_SECONDS: 120,
  UI_CACHE_SECONDS: 300,
  LOGIN_MAX_ATTEMPTS: 8,
  LOGIN_ATTEMPT_WINDOW_SECONDS: 900,
  SHEETS: Object.freeze({
    USERS: 'Usuarios',
    SESSIONS: 'Sessoes',
    UI: 'Config_UI',
    LOGS: 'Logs',
    CRM_RESPONSIBLES: 'CRM_RESPONSAVEIS'
  }),
  ROLES: Object.freeze(['admin', 'manager', 'user']),
  CRM_SCOPES: Object.freeze(['OWN', 'TEAM', 'ALL']),
  APPS: Object.freeze([
    Object.freeze({ key: 'intra', label: 'Gerencial', path: '/intra/', category: 'Operação da agência', protected: true, roles: Object.freeze(['admin', 'manager']) }),
    Object.freeze({ key: 'manuais', label: 'Manuais', path: '/intra/manuais/', category: 'Operação da agência', protected: true, defaultEnabled: false, roles: Object.freeze(['admin', 'manager', 'user']) }),
    Object.freeze({ key: 'crm', label: 'CRM', path: '/crm/', category: 'Gestão comercial', protected: true, defaultEnabled: false, roles: Object.freeze(['admin', 'manager', 'user']) }),
    Object.freeze({ key: 'balcao', label: 'Balcão', path: '/balcao/', category: 'Operação da agência', protected: true, roles: Object.freeze(['admin', 'manager', 'user']) }),
    Object.freeze({ key: 'atende', label: 'Atende', path: '/atende/', category: 'Operação da agência', protected: true, roles: Object.freeze(['admin', 'manager', 'user']) }),
    Object.freeze({ key: 'cep', label: 'Consulta de CEP', path: '/cep/', category: 'Operação da agência', protected: false, roles: Object.freeze(['admin', 'manager', 'user']) }),
    Object.freeze({ key: 'sla', label: 'SLA', path: '/sla/', category: 'Operação da agência', protected: true, roles: Object.freeze(['admin', 'manager', 'user']) }),
    Object.freeze({ key: 'caixa', label: 'Caixa', path: '/caixa/', category: 'Operação da agência', protected: true, roles: Object.freeze(['admin', 'manager', 'user']) }),
    Object.freeze({ key: 'app', label: 'Minhas Postagens', path: '/app/', category: 'Aplicativos', protected: false, roles: Object.freeze(['admin', 'manager', 'user']) }),
    Object.freeze({ key: 'nuvemshop', label: 'Nuvemshop', path: '/nuvemshop/', category: 'Aplicativos', protected: false, roles: Object.freeze(['admin', 'manager', 'user']) }),
    Object.freeze({ key: 'superfrete-admin', label: 'SuperFrete Admin', path: '/superfrete-admin/', category: 'Aplicativos', protected: true, roles: Object.freeze(['admin', 'manager', 'user']) }),
    Object.freeze({ key: 'reverso-admin', label: 'Admin Reverso', path: '/reverso-admin/', category: 'Logística reversa', protected: true, defaultEnabled: false, roles: Object.freeze(['admin', 'manager', 'user']) }),
    Object.freeze({ key: 'reverso-coleta', label: 'Coleta Reverso', path: '/reverso-coleta/', category: 'Logística reversa', protected: true, defaultEnabled: false, roles: Object.freeze(['admin', 'manager', 'user']) }),
    Object.freeze({ key: 'reverso-expedicao', label: 'Expedição Reverso', path: '/reverso-expedicao/', category: 'Logística reversa', protected: true, defaultEnabled: false, roles: Object.freeze(['admin', 'manager', 'user']) })
  ]),
  DEFAULT_UI: Object.freeze({
    version: 1,
    colors: {
      primary: '#00416B',
      secondary: '#007CC3',
      accent: '#FFD400',
      success: '#168754',
      warning: '#B54708',
      danger: '#B42318',
      shipping: '#0077B6',
      cep: '#EE9B00',
      home: '#006494',
      dashboard: '#6A4C93',
      crm: '#8B5CF6',
      admin: '#9B5DE5',
      caixa: '#2A9D8F',
      atendimento: '#E76F51',
      nuvemshop: '#4D908E',
      balcao: '#F4A261',
      sla: '#577590',
      app: '#0077B6'
    },
    icons: {
      shipping: 'local_shipping',
      cep: 'location_on',
      home: 'home',
      logout: 'logout',
      refresh: 'refresh',
      sync: 'sync',
      dashboard: 'dashboard',
      crm: 'hub',
      admin: 'admin_panel_settings',
      caixa: 'point_of_sale',
      atendimento: 'support_agent',
      nuvemshop: 'cloud',
      balcao: 'storefront',
      sla: 'query_stats',
      app: 'sell',
      iconLibrary: 'palette'
    }
  })
});

const AGF_USERS_HEADERS = Object.freeze([
  'username', 'display_name', 'role', 'salt', 'password_hash', 'active',
  'created_at', 'updated_at', 'last_login_at', 'allowed_apps_json',
  'crm_responsavel_id', 'crm_linked', 'crm_agenda_scope',
  'crm_can_edit_clients', 'crm_can_edit_prospects', 'crm_can_move_funnel',
  'crm_can_complete_activities', 'crm_can_view_team', 'crm_can_view_indicators'
]);

const AGF_SESSIONS_HEADERS = Object.freeze([
  'sid_hash', 'username', 'role', 'created_at', 'last_seen_at', 'expires_at',
  'active', 'user_agent'
]);

const AGF_UI_HEADERS = Object.freeze(['updated_at', 'updated_by', 'config_json']);
const AGF_LOG_HEADERS = Object.freeze(['timestamp', 'event', 'username', 'detail']);

const AGF_CRM_RESPONSAVEIS_HEADERS = Object.freeze([
  'RESPONSAVEL_ID', 'USERNAME', 'DISPLAY_NAME', 'ROLE', 'USER_ACTIVE',
  'CRM_LINKED', 'AGENDA_SCOPE', 'CAN_EDIT_CLIENTS', 'CAN_EDIT_PROSPECTS',
  'CAN_MOVE_FUNNEL', 'CAN_COMPLETE_ACTIVITIES', 'CAN_VIEW_TEAM',
  'CAN_VIEW_INDICATORS', 'UPDATED_AT'
]);
