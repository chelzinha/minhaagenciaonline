/**
 * Configuracao do CRM - selecao automatica de ambiente.
 *
 * O ambiente e escolhido pela URL, nunca editando este arquivo a mao:
 *
 *   minhaagenciaonline.com.br / www.minhaagenciaonline.com.br -> PRODUCAO
 *   previews Netlify/Cloudflare e localhost                    -> HOMOLOGACAO
 *
 * REGRA DE SEGURANCA:
 * ambiente de homologacao sem API_HOMOLOG configurada NAO pode cair no
 * backend de producao. Nesse caso o CRM fica sem endpoint e exibe erro,
 * evitando que testes alterem dados reais.
 */
(function () {
  var API_PRODUCAO = 'https://script.google.com/macros/s/AKfycbytPcqQl8Rk62YclOVx0BH-zEgHtYFv0b-aUrTfyR_QKKr0VmjGbJc9GpX19rJ-1YV0OA/exec';
  var API_HOMOLOG = ''; // <<< colar aqui a URL /exec do projeto de homologacao

  var host = String(location.hostname || '').toLowerCase();
  var ehProducao = host === 'minhaagenciaonline.com.br'
    || host === 'www.minhaagenciaonline.com.br';
  var ehLocal = host === 'localhost' || host === '127.0.0.1';
  var ehNetlifyPreview = host.indexOf('deploy-preview') >= 0
    || host.indexOf('homolog') === 0
    || host.indexOf('homolog--') >= 0;
  var ehCloudflarePreview = host.endsWith('.pages.dev');
  var ehHomolog = !ehProducao && (ehLocal || ehNetlifyPreview || ehCloudflarePreview);

  // Hosts desconhecidos sao tratados como homologacao por seguranca. Um novo
  // dominio de producao precisa ser explicitamente incluido em ehProducao.
  if (!ehProducao && !ehHomolog) ehHomolog = true;

  var api = ehProducao ? API_PRODUCAO : API_HOMOLOG;
  if (ehHomolog && !API_HOMOLOG) {
    console.error('[CRM] Ambiente de homologacao/preview sem backend proprio. Acesso ao backend de producao foi bloqueado por seguranca.');
  }

  window.CRM_AMBIENTE = ehProducao ? 'producao' : 'homologacao';
  window.CRM_APP_CONFIG = Object.freeze({
    apiUrl: api,
    ambiente: window.CRM_AMBIENTE,
    defaultView: 'home',
    weekStartsOn: 1,
    requestTimeoutMs: 60000,
    bootstrapTimeoutMs: 90000,
    legacyTimeoutMs: 150000
  });

  /*
   * O boot lite nao inclui a jornada de Prospects. Antes, o app escondia o
   * spinner global assim que config + dashboard chegavam e renderizava o
   * Dashboard de Prospects com arrays ainda vazios. Por alguns segundos isso
   * fazia 0 prospects / 0% / "Sem etapas configuradas" parecerem dados reais.
   *
   * Este guard observa somente a PRIMEIRA resposta valida da jornada de
   * Prospects (ou de um boot completo de fallback). Enquanto ela nao chega,
   * o dashboard mostra um estado neutro de carregamento. Recarregamentos
   * posteriores preservam os dados antigos na tela e nao causam flicker.
   * Nao altera payloads, calculos nem a ordem das requisicoes do app.
   */
  (function installProspectInitialLoadingGuard() {
    if (window.__CRM_PROSPECT_LOADING_GUARD__) return;
    window.__CRM_PROSPECT_LOADING_GUARD__ = true;
    document.documentElement.setAttribute('data-crm-prospect-initial-loading', '1');

    var style = document.createElement('style');
    style.id = 'crmProspectInitialLoadingStyle';
    style.textContent = [
      'html[data-crm-prospect-initial-loading="1"] #prospects-dashboard{position:relative;min-height:260px}',
      'html[data-crm-prospect-initial-loading="1"] #prospects-dashboard>*:not(.crm-prospect-initial-loading){visibility:hidden}',
      '.crm-prospect-initial-loading{display:none;min-height:220px;align-items:center;justify-content:center;gap:10px;color:var(--muted,#64748B);font:600 14px/1.4 Inter,system-ui,sans-serif}',
      'html[data-crm-prospect-initial-loading="1"] .crm-prospect-initial-loading{display:flex}',
      '.crm-prospect-initial-loading .spinner{width:20px;height:20px;flex:0 0 20px}'
    ].join('');
    document.head.appendChild(style);

    document.addEventListener('DOMContentLoaded', function () {
      var dash = document.getElementById('prospects-dashboard');
      if (!dash || dash.querySelector('.crm-prospect-initial-loading')) return;
      var box = document.createElement('div');
      box.className = 'crm-prospect-initial-loading';
      box.setAttribute('role', 'status');
      box.setAttribute('aria-live', 'polite');
      box.innerHTML = '<span class="spinner" aria-hidden="true"></span><span>Carregando indicadores de prospects...</span>';
      dash.insertBefore(box, dash.firstChild);
    });

    if (typeof window.fetch !== 'function') return;
    var originalFetch = window.fetch.bind(window);
    var resolved = false;

    function finish() {
      if (resolved) return;
      resolved = true;
      document.documentElement.removeAttribute('data-crm-prospect-initial-loading');
    }
    function requestInfo(input) {
      try {
        var raw = (typeof Request !== 'undefined' && input instanceof Request) ? input.url : String(input || '');
        var u = new URL(raw, location.href);
        return {
          action: String(u.searchParams.get('action') || ''),
          tipo: String(u.searchParams.get('tipoEntidade') || '').toUpperCase()
        };
      } catch (_e) {
        return { action: '', tipo: '' };
      }
    }
    window.fetch = function () {
      var args = arguments;
      var info = requestInfo(args[0]);
      var prospectJourney = info.action === 'get_crm_jornada_data' && info.tipo === 'PROSPECT';
      var fullBoot = info.action === 'get_crm_boot_v4' || info.action === 'get_crm_boot_v3';
      var promise = originalFetch.apply(window, args);
      if (!resolved && (prospectJourney || fullBoot)) {
        promise.then(function (response) {
          try {
            response.clone().json().then(function (data) {
              if (!data || data.ok === false) return;
              if (prospectJourney || (fullBoot && data.journeyProspects)) finish();
            }).catch(function () {});
          } catch (_e) {}
        }).catch(function () {});
      }
      return promise;
    };
  })();

  document.addEventListener('DOMContentLoaded', function () {
    // Correcao isolada: o script inline do index tenta capturar o modal de
    // senha antes de ele existir no DOM. Este arquivo e carregado no momento
    // correto e religa apenas esse fluxo, sem alterar o restante do CRM.
    var s = document.createElement('script');
    s.src = '/crm/password-fix.js?v=1';
    s.defer = true;
    document.body.appendChild(s);

    // Mantem nome e ID do responsavel coerentes no cadastro de Prospects e
    // aplica Manu como responsavel padrao quando nenhum outro for escolhido.
    var r = document.createElement('script');
    r.src = '/crm/prospect-responsavel-fix.js?v=2';
    r.defer = true;
    document.body.appendChild(r);

    // Estabiliza digitacao nos filtros dinamicos e adiciona X para limpar
    // os campos de busca do CRM sem alterar o app.js principal.
    var q = document.createElement('script');
    q.src = '/crm/search-fix.js?v=1';
    q.defer = true;
    document.body.appendChild(q);

    // Faixa visual: deixa impossivel confundir a tela de teste com a real.
    if (!ehProducao) {
      var b = document.createElement('div');
      b.textContent = API_HOMOLOG ? 'HOMOLOGACAO - dados de teste' : 'HOMOLOGACAO - backend nao configurado';
      b.style.cssText = 'position:fixed;left:0;right:0;bottom:0;z-index:99999;background:#B45309;color:#fff;'
        + 'font:600 12px/1.6 Inter,system-ui,sans-serif;text-align:center;letter-spacing:.04em;padding:4px 8px;';
      document.body.appendChild(b);
    }
  });
})();
