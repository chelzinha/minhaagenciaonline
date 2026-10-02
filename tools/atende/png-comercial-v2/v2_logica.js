(function(){
'use strict';

/* ============================================================
 * ATENDE - PNG COMERCIAL V2 (aba Comercial)
 *
 * Gera as artes 1080x1080 de Balcão AGF, Encomendas e Metrô
 * a partir dos moldes aprovados (Método de Artes AGF).
 *
 * Fluxo: dados da aba Comercial -> molde HTML -> Apps Script
 *        (ATENDE_renderCommercialPngV1) -> Worker -> Browser Run
 *
 * O gerador antigo (DashboardCommercialPngV1) passou para a
 * aba Gestão e continua intacto.
 * ============================================================ */

var TOOLS_ID = 'commercialPngToolsV2';
var TAMANHO = 1080;
var MOLDES = __MOLDES__;

var MESES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
var NOMES = { balcao: 'Balcão AGF', encomendas: 'Encomendas', metro: 'Metrô' };

function n(v){ v = Number(v || 0); return Number.isFinite(v) ? v : 0; }
function clean(v){ return String(v == null ? '' : v).trim(); }
function titleName(v){ v = clean(v).toLowerCase(); return v ? v.charAt(0).toUpperCase() + v.slice(1) : ''; }

function dashboardData(){
  try {
    if (typeof window.ATENDE_getDashboardDataV4 === 'function') return window.ATENDE_getDashboardDataV4() || {};
  } catch (_) {}
  return {};
}

function readEndDate(data){
  var input = document.getElementById('dataFim');
  var value = clean(input && input.value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  var rk = data && data.rankingBalcao;
  value = clean(rk && rk.periodo && rk.periodo.fim);
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : '';
}

function dateBr(iso){
  var m = clean(iso).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? m[3] + '/' + m[2] + '/' + m[1] : '';
}

function mesReferencia(competencia, iso){
  var m = clean(competencia).match(/^(\d{4})-(\d{2})/) || clean(iso).match(/^(\d{4})-(\d{2})/);
  return m ? MESES[Number(m[2]) - 1] + ' ' + m[1] : '';
}

function metasDe(config, prefixo){
  return [['Bronze', 'Bronze'], ['Prata', 'Prata'], ['Ouro', 'Ouro']]
    .map(function(par){ return { nivel: par[0], valor: n(config[prefixo + par[1]]) }; })
    .filter(function(m){ return m.valor > 0; });
}

/* Monta o JSON que o molde espera, com os mesmos números da tela */
function montarDados(scope){
  var data = dashboardData();
  var metas = data.metas || {};
  var config = metas.config || {};
  var realizado = metas.realizado || {};
  var fim = readEndDate(data);

  var base = {
    titulo: NOMES[scope],
    mesRef: mesReferencia(metas.competencia, fim),
    dataRef: dateBr(fim),
    realizado: n(realizado[scope]),
    metas: metasDe(config, scope)
  };

  var diasMes = n(config.diasUteisMes);
  var diasFeitos = n(config.diasUteisRealizados);

  if (!base.metas.length || base.metas[0].nivel !== 'Bronze') {
    throw new Error('A meta Bronze de ' + NOMES[scope] + ' não está configurada nas metas do mês.');
  }
  if (!diasMes) {
    throw new Error('Os dias úteis do mês não estão configurados nas metas do mês.');
  }
  if (!base.dataRef || !base.mesRef) {
    throw new Error('Período do painel não identificado. Selecione as datas e tente de novo.');
  }

  if (scope === 'encomendas') {
    base.diaAtual = diasFeitos;
    base.diasMes = diasMes;
    base.diasUteisRealizados = diasFeitos;
    base.diasUteisRestantes = Math.max(diasMes - diasFeitos, 0);
    return base;
  }

  base.diasUteis = diasMes;
  base.diasRealizados = diasFeitos;
  base.ranking = [];

  if (scope === 'balcao') {
    /* Mesma regra do Worker (ranking-balcao-wrapper): ELEN pelo atendente, demais pela escala semanal.
       Os 3 colaboradores entram sempre, inclusive com zero; percentual vem pronto do servidor. */
    var rk = data.rankingBalcao || {};
    base.ranking = (Array.isArray(rk.linhas) ? rk.linhas : [])
      .map(function(row){
        return {
          nome: titleName(row.nome),
          valor: n(row.realizado),
          pct: row.percentualDoBalcao == null ? null : n(row.percentualDoBalcao)
        };
      })
      .filter(function(row){ return row.nome; });
    base.totalBalcao = n(rk.totalBalcao);
    base.naoAtribuido = n(rk.naoAtribuido);
    if (rk.suspensoPorFiltroAtendente) {
      base.rankingAviso = 'Percentuais suspensos: há filtro de atendente ativo no painel.';
    } else if (rk.erro) {
      base.rankingAviso = 'Percentuais indisponíveis no momento.';
    }
  }
  return base;
}

function montarHtml(scope){
  var molde = MOLDES[scope];
  if (!molde) throw new Error('Molde não encontrado: ' + scope);
  var json = JSON.stringify(montarDados(scope)).replace(/</g, '\\u003c');
  return molde
    .replace('__FONTES__', function(){ return MOLDES.fontes; })
    .replace('__DADOS__', function(){ return json; });
}

function base64ToBlob(b64, tipo){
  var bin = atob(b64), bytes = new Uint8Array(bin.length);
  for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: tipo || 'image/png' });
}

function baixar(resp){
  if (!resp || resp.ok !== true || !resp.base64) throw new Error('Resposta PNG inválida.');
  var url = URL.createObjectURL(base64ToBlob(resp.base64, resp.mimeType));
  var a = document.createElement('a');
  a.download = resp.filename || 'resultado-comercial.png';
  a.href = url;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(function(){ URL.revokeObjectURL(url); }, 1500);
}

function estadoBotao(button, ocupado){
  if (!button) return;
  button.disabled = ocupado;
  var rotulo = button.querySelector('.rotulo');
  if (rotulo) rotulo.textContent = ocupado ? 'Gerando...' : 'Salvar PNG';
}

function exportar(scope, button){
  estadoBotao(button, true);
  var html, nome;
  try {
    html = montarHtml(scope);
    var dados = montarDados(scope);
    nome = 'resultado-' + scope + '-' + dados.dataRef.replace(/\//g, '-') + '.png';
  } catch (err) {
    console.error('[ATENDE PNG V2] preparo:', err);
    alert('Não foi possível preparar o PNG: ' + (err && err.message ? err.message : String(err)));
    estadoBotao(button, false);
    return;
  }

  google.script.run
    .withSuccessHandler(function(resp){
      try { baixar(resp); }
      catch (err) {
        console.error('[ATENDE PNG V2] download:', err);
        alert('Não foi possível baixar o PNG: ' + (err && err.message ? err.message : String(err)));
      }
      finally { estadoBotao(button, false); }
    })
    .withFailureHandler(function(err){
      console.error('[ATENDE PNG V2] servidor:', err);
      alert('Não foi possível gerar o PNG: ' + (err && err.message ? err.message : String(err)));
      estadoBotao(button, false);
    })
    .ATENDE_renderCommercialPngV1({ html: html, filename: nome, width: TAMANHO, height: TAMANHO });
}

function tituloComercial(){
  var t = document.querySelector('#dashboardView .v4-title');
  if (!t) return null;
  return clean(t.textContent).toLowerCase().indexOf('comercial') === 0 ? t : null;
}

function mount(){
  var titulo = tituloComercial();
  var atual = document.getElementById(TOOLS_ID);
  if (!titulo) { if (atual) atual.remove(); return; }
  if (atual) return;
  var box = document.createElement('div');
  box.id = TOOLS_ID;
  /* mesma classe do gerador antigo: reaproveita o posicionamento já aprovado no Index */
  box.className = 'commercial-png-tools-v1';
  box.innerHTML =
    '<select id="commercialPngScopeV2" aria-label="Arte do PNG">' +
      '<option value="balcao">Balcão AGF</option>' +
      '<option value="encomendas">Encomendas</option>' +
      '<option value="metro">Metrô</option>' +
    '</select>' +
    '<button type="button" id="commercialPngSaveV2">' +
      '<span class="material-symbols-rounded">download</span><span class="rotulo">Salvar PNG</span>' +
    '</button>';
  titulo.insertAdjacentElement('afterend', box);
  var select = document.getElementById('commercialPngScopeV2');
  var button = document.getElementById('commercialPngSaveV2');
  button.addEventListener('click', function(){ exportar(select.value, button); });
}

function iniciar(){
  var alvo = document.getElementById('dashboardView');
  if (!alvo) { setTimeout(iniciar, 250); return; }
  new MutationObserver(function(){ setTimeout(mount, 0); }).observe(alvo, { childList: true, subtree: true });
  mount();
}

window.ATENDE_exportCommercialPngV2 = function(scope){ exportar(scope || 'balcao', null); };
window.ATENDE_buildCommercialPngHtmlV2 = montarHtml;
iniciar();
})();
