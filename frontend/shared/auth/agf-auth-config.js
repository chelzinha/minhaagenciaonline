/* ============================================================
 * AGF José Bonifácio — configuração do controle de acesso
 * ------------------------------------------------------------
 * Depois de implantar o projeto Apps Script AGF_AUTH, substitua
 * APENAS o valor de apiUrl pelo URL terminado em /exec.
 * ============================================================ */
window.AGF_AUTH_CONFIG = Object.freeze({
  apiUrl: 'https://script.google.com/macros/s/AKfycbxv_3OLKyy13PqtEdqnVSA2zg3xljaU5gAKgn-TIVaaSRaTNPGgWIaRvDV_JuT9PTc5/exec',
  portalUrl: '/agf/',
  storageKey: 'agf_jb_session_v1',
  cookieName: 'agf_jb_session',
  userStorageKey: 'agf_jb_user_v1',
  uiCacheKey: 'agf_jb_ui_v1',
  requestTimeoutMs: 15000,
  /* Janela em que uma sessão já confirmada pelo servidor renderiza a
   * página imediatamente e revalida em segundo plano (anti-lentidão).
   * 0 desativa e volta ao bloqueio "Validando acesso…" em todo load. */
  revalidateTtlMs: 10 * 60 * 1000
});
