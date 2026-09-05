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
 * REGRA DE SEGURANCA: ambiente de homologacao nunca pode cair no backend de
 * producao. Enquanto API_HOMOLOG estiver vazio, as chamadas usam um dominio
 * reservado .invalid e falham de forma explicita ate o backend de teste ser
 * configurado.
 */
(function () {
  var API_PRODUCAO = 'https://script.google.com/macros/s/AKfycbytPcqQl8Rk62YclOVx0BH-zEgHtYFv0b-aUrTfyR_QKKr0VmjGbJc9GpX19rJ-1YV0OA/exec';
  var API_HOMOLOG = ''; // <<< colar aqui a URL /exec do projeto de homologacao
  var API_HOMOLOG_BLOQUEADA = 'https://backend-homologacao-nao-configurado.invalid/';

  var host = String(location.hostname || '').toLowerCase();
  var ehHomolog = host.indexOf('homolog') === 0
    || host.indexOf('homolog--') >= 0
    || host === 'localhost'
    || host === '127.0.0.1'
    || host.indexOf('deploy-preview') >= 0;

  var homologBackendConfigurado = !!API_HOMOLOG;
  var api = API_PRODUCAO;
  if (ehHomolog) {
    api = homologBackendConfigurado ? API_HOMOLOG : API_HOMOLOG_BLOQUEADA;
    if (!homologBackendConfigurado) {
      console.error('[CRM] HOMOLOGACAO BLOQUEADA: API_HOMOLOG nao configurada. Nenhuma chamada sera enviada ao backend de producao.');
    }
  }

  window.CRM_AMBIENTE = ehHomolog ? 'homologacao' : 'producao';
  window.CRM_APP_CONFIG = Object.freeze({
    apiUrl: api,
    ambiente: window.CRM_AMBIENTE,
    homologBackendConfigurado: !ehHomolog || homologBackendConfigurado,
    defaultView: 'home',
    weekStartsOn: 1,
    requestTimeoutMs: 60000,
    bootstrapTimeoutMs: 90000,
    legacyTimeoutMs: 150000
  });

  // Fase 1 da Agenda: modulos isolados, carregados antes do app principal.
  // A ordem e deterministica e permite observar o mesmo boot do core sem
  // duplicar os dados de Cliente/Prospect.
  if (document.readyState === 'loading') {
    document.write('<script src="/crm/agenda-avulsa-fase1.js?v=1"><\/script>');
    document.write('<script src="/crm/agenda-dias-uteis-fase1.js?v=1"><\/script>');
    document.write('<script src="/crm/agenda-filtros-vencidas-fase1.js?v=1"><\/script>');
  }

  // Faixa visual: deixa impossivel confundir a tela de teste com a real.
  if (ehHomolog) {
    document.addEventListener('DOMContentLoaded', function () {
      var b = document.createElement('div');
      b.textContent = homologBackendConfigurado
        ? 'HOMOLOGACAO - dados de teste'
        : 'HOMOLOGACAO BLOQUEADA - backend de teste nao configurado';
      b.style.cssText = 'position:fixed;left:0;right:0;bottom:0;z-index:99999;'
        + 'background:' + (homologBackendConfigurado ? '#B45309' : '#B91C1C') + ';color:#fff;'
        + 'font:600 12px/1.6 Inter,system-ui,sans-serif;text-align:center;letter-spacing:.04em;padding:4px 8px;';
      document.body.appendChild(b);
    });
  }
})();
