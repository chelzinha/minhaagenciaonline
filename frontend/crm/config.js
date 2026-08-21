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
    r.src = '/crm/prospect-responsavel-fix.js?v=1';
    r.defer = true;
    document.body.appendChild(r);

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
