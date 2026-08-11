/**
 * Configuracao do CRM - selecao automatica de ambiente.
 *
 * O ambiente e escolhido pela URL, nunca editando este arquivo a mao:
 *
 *   minhaagenciaonline.com.br        -> backend de PRODUCAO
 *   homolog--agfjb.netlify.app       -> backend de HOMOLOGACAO
 *   localhost / 127.0.0.1            -> backend de HOMOLOGACAO
 *
 * Assim o mesmo commit funciona nos dois lugares e nao existe o risco de
 * publicar em producao um arquivo apontando para o backend de teste.
 *
 * PASSO PENDENTE: depois de criar o projeto de homologacao no Apps Script,
 * cole a URL /exec dele em API_HOMOLOG abaixo. Enquanto estiver vazio, a
 * homologacao cai no backend de producao (e avisa no console).
 */
(function () {
  var API_PRODUCAO = 'https://script.google.com/macros/s/AKfycbytPcqQl8Rk62YclOVx0BH-zEgHtYFv0b-aUrTfyR_QKKr0VmjGbJc9GpX19rJ-1YV0OA/exec';
  var API_HOMOLOG = ''; // <<< colar aqui a URL /exec do projeto de homologacao

  var host = String(location.hostname || '').toLowerCase();
  var ehHomolog = host.indexOf('homolog') === 0
    || host.indexOf('homolog--') >= 0
    || host === 'localhost'
    || host === '127.0.0.1'
    || host.indexOf('deploy-preview') >= 0;

  var api = API_PRODUCAO;
  if (ehHomolog) {
    if (API_HOMOLOG) api = API_HOMOLOG;
    else console.warn('[CRM] Ambiente de homologação sem backend próprio configurado. Usando produção. Preencha API_HOMOLOG em config.js.');
  }

  window.CRM_AMBIENTE = ehHomolog ? 'homologacao' : 'producao';
  window.CRM_APP_CONFIG = Object.freeze({
    apiUrl: api,
    ambiente: window.CRM_AMBIENTE,
    defaultView: 'home',
    weekStartsOn: 1,
    requestTimeoutMs: 60000,
    bootstrapTimeoutMs: 90000,
    legacyTimeoutMs: 150000
  });

  // Faixa visual: deixa impossivel confundir a tela de teste com a real.
  if (ehHomolog) {
    document.addEventListener('DOMContentLoaded', function () {
      var b = document.createElement('div');
      b.textContent = 'HOMOLOGAÇÃO - dados de teste';
      b.style.cssText = 'position:fixed;left:0;right:0;bottom:0;z-index:99999;background:#B45309;color:#fff;'
        + 'font:600 12px/1.6 Inter,system-ui,sans-serif;text-align:center;letter-spacing:.04em;padding:4px 8px;';
      document.body.appendChild(b);
    });
  }
})();
