/***************************************
 * DASHBOARD GERENCIAL - V10.4
 * Ações: MANTER FIDELIZAR CONVERTER
 *        RESGATAR CANCELAR
 * VISITAR agora é canal/próxima ação, não ação principal
 *
 * Changelog v10.4 (2026-04-14)
 * - FIX: "Argumento grande demais: key" — chaves de
 *   cache agora usam hash MD5 (39 chars total) em
 *   vez de concatenação bruta dos filtros.
 *   Eram estouradas quando o usuário selecionava
 *   múltiplos valores nos filtros.
 * - buildMatrixFromMaster_ agora propaga isNovo e pr
 *   do masterMap para cada row do Raio-X, permitindo
 *   chip NOVO e filtro de prioridade na aba Clientes.
 * - Cache keys: d10v4 → d10v5_<hash>, ds10v4 → ds10v5_<hash>.
 *
 * Changelog v10.3 (2026-04-14)
 * - NOVO_CLIENTE recalculado no dashboard com janela
 *   de 2 meses (mês atual + mês anterior do CRM).
 * - readMasterDash_ passa a ler
 *   DATA_PRIMEIRA_VALIDA_NAO_REVERSO (cache v4).
 *
 * Changelog v10.2 (2026-04-14)
 * - Limites aumentados (CLIENTS_TOP, MATRIX, TOP_OPPS)
 *   para suportar base completa sem truncar Raio-X/Carteira.
 * - readMasterDash_ agora lê INTERMEDIADOR_PREDOMINANTE.
 * - buildCliFromMaster_ injeta faturamento/qtd do PERÍODO
 *   (janela filtrada) via mapa winByCk.
 ***************************************/
var CFG={FILES:{MOVIMENTOS_ID:'1zJUYkvWzcTdHrgqdIMWOY2pm3qDoJoRlu9u43lV7QDA',METAS_ID:'1KZefoI3erzjwV8x3KbxdDOuXMhGu47eP4c9_81H5ck0'},SHEETS:{MOVIMENTOS:'BASE_TOTAL',METAS:'DIAS_UTEIS',MASTER:'CLIENTES_MASTER'},RULES:{MIN_START:'2025-11-01',INATIVO_THRESHOLD:30,REC_MIN_DIAS:3,REC_MIN_QTD:5,CONV_MIN_TOTAL:10},CACHE:{BASE_SEC:3600,DASH_SEC:1800,FILTERS_SEC:21600,MAX_CHUNK:90000},LIMITS:{CLIENTS_TOP:5000,ACTION_BOARD:30,TOP_GEN:15,TOP_OPPS:5000,MATRIX:5000},INTERNAL_KEYS:['VR GERENCIADORA DE RISCOS LTDA EPP','SEM REGISTRO','PRODUTO ECT']};

function doGet(e){
  try{
    var p=(e&&e.parameter)?e.parameter:{};

    // Rotas da Operação convivendo no mesmo projeto
    if(p.action){
      return op_doGet(e);
    }

    var r=ct_(p.route||'');
    if(!r){
      return HtmlService.createHtmlOutputFromFile('Index')
        .setTitle('Dashboard Gerencial')
        .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
    }

    var pl;
    switch(r.toLowerCase()){
      case 'dashboard': pl=getDash_(p); break;
      case 'dashboard_summary': pl=getDashSummary_(p); break;
      case 'health': pl=getHealth_(); break;
      case 'filters': pl=getFilters_(); break;
      default: pl={ok:false,error:'Rota inválida: '+r};
    }

    return ContentService.createTextOutput(JSON.stringify(pl))
      .setMimeType(ContentService.MimeType.JSON);

  }catch(err){
    return ContentService.createTextOutput(JSON.stringify({ok:false,error:err.message||String(err)}))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function doPost(e){
  try{
    var p=(e&&e.parameter)?e.parameter:{};

    // POST usado apenas pela Operação
    if(p.action){
      return op_doPost(e);
    }

    return ContentService.createTextOutput(JSON.stringify({ok:false,error:'POST sem action válida.'}))
      .setMimeType(ContentService.MimeType.JSON);

  }catch(err){
    return ContentService.createTextOutput(JSON.stringify({ok:false,error:err.message||String(err)}))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

/* === HELPERS === */
function ct_(v){if(v==null)return'';return String(v).replace(/\s+/g,' ').trim()}
function sa_(s){s=ct_(s);try{return s.normalize('NFD').replace(/[\u0300-\u036f]/g,'')}catch(e){return s}}
function nh_(s){return sa_(s).toUpperCase().replace(/[%]/g,' PERCENT ').replace(/[^\w]+/g,'_').replace(/^_+|_+$/g,'')}
function bhm_(hr){var m={};for(var i=0;i<hr.length;i++){var k=nh_(hr[i]);if(k&&m[k]===undefined)m[k]=i}return m}
function fhi_(h,ns){for(var i=0;i<ns.length;i++){var k=nh_(ns[i]);if(h[k]!==undefined)return h[k]}return-1}
function cl_(r,h,n){var ns=Array.isArray(n)?n:[n];var i=fhi_(h,ns);return i<0?'':r[i]}
function ns_(v){if(typeof v==='number')return isNaN(v)?0:v;var s=ct_(v);if(!s)return 0;if(s.indexOf(',')>=0)s=s.replace(/\./g,'').replace(',','.');var n=Number(s);return isNaN(n)?0:n}
function bl_(v){var s=sa_(v).toUpperCase();return s==='TRUE'||s==='SIM'||s==='1'||s==='YES'}
function pds_(v){if(!v&&v!==0)return null;if(Object.prototype.toString.call(v)==='[object Date]'&&!isNaN(v.getTime()))return Utilities.formatDate(v,Session.getScriptTimeZone(),'yyyy-MM-dd');var s=ct_(v);if(!s)return null;var b=s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);if(b){var d=new Date(+b[3],+b[2]-1,+b[1]);return isNaN(d)?null:Utilities.formatDate(d,Session.getScriptTimeZone(),'yyyy-MM-dd')}var iso=s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);if(iso){var d2=new Date(+iso[1],+iso[2]-1,+iso[3]);return isNaN(d2)?null:Utilities.formatDate(d2,Session.getScriptTimeZone(),'yyyy-MM-dd')}var d3=new Date(s);return isNaN(d3)?null:Utilities.formatDate(d3,Session.getScriptTimeZone(),'yyyy-MM-dd')}
function itd_(iso){var m=ct_(iso).match(/^(\d{4})-(\d{2})-(\d{2})$/);return m?new Date(+m[1],+m[2]-1,+m[3]):null}
function ymd_(d){return Utilities.formatDate(d,Session.getScriptTimeZone(),'yyyy-MM-dd')}
function ym_(iso){return ct_(iso).slice(0,7)}
function addD_(iso,n){var d=itd_(iso);d.setDate(d.getDate()+n);return ymd_(d)}
function diffD_(a,b){return Math.floor((itd_(a)-itd_(b))/864e5)}
function prevYm_(ym){var m=ct_(ym).match(/^(\d{4})-(\d{2})$/);if(!m)return ym;var y=+m[1],mo=+m[2]-1;if(mo<=0){mo=12;y--}return Utilities.formatString('%04d-%02d',y,mo)}
function msYm_(ym){var m=ct_(ym).match(/^(\d{4})-(\d{2})$/);return m?Utilities.formatString('%04d-%02d-01',+m[1],+m[2]):''}
function meYm_(ym){var s=itd_(msYm_(ym));return ymd_(new Date(s.getFullYear(),s.getMonth()+1,0))}
function uniq_(a){var s={},o=[];for(var i=0;i<a.length;i++){var k=ct_(a[i]);if(k&&!s[k]){s[k]=1;o.push(k)}}return o.sort()}
function csvA_(v){if(Array.isArray(v))return uniq_(v.map(ct_).filter(Boolean));var s=ct_(v);if(!s)return[];return uniq_(s.split(',').map(function(x){return ct_(x)}).filter(Boolean))}
function csvS_(v){return csvA_(v).join(',')}
function bck_(n){return sa_(n).toUpperCase().replace(/[^\w]+/g,' ').replace(/\s+/g,' ').trim()}
function isInt_(ck){for(var i=0;i<CFG.INTERNAL_KEYS.length;i++)if(ck===bck_(CFG.INTERNAL_KEYS[i]))return true;return false}
function topK_(o){var bk='',bv=-1;var ks=Object.keys(o||{});for(var i=0;i<ks.length;i++)if((o[ks[i]]||0)>bv){bv=o[ks[i]];bk=ks[i]}return bk}
function oSA_(o){return Object.keys(o||{}).map(function(k){return{label:k,value:o[k]||0}}).sort(function(a,b){return b.value-a.value})}
function sumR_(rows,f){var t=0;for(var i=0;i<rows.length;i++)t+=ns_(rows[i][f]);return t}
function pctD_(c,p){if(p<=0&&c>0)return null;if(p<=0)return 0;return((c-p)/p)*100}
function trend_(c,p){if(p<=0&&c>0)return{label:'CRESCENDO',d:null};if(p<=0)return{label:'ESTAVEL',d:0};var pct=((c-p)/p)*100;if(pct>=10)return{label:'CRESCENDO',d:pct};if(pct<=-10)return{label:'CAINDO',d:pct};return{label:'ESTAVEL',d:pct}}
function stDays_(d){return d<=30?'ATIVO_30D':d<=59?'INATIVO_30_59D':'INATIVO_60D_PLUS'}

/* === FIX: cBD_ otimizado com cálculo matemático em vez de loop O(n) === */
function cBD_(s,e){
  if(!s||!e||s>e)return 0;
  var sd=itd_(s),ed=itd_(e);
  var totalDays=Math.floor((ed-sd)/864e5)+1;
  var fullWeeks=Math.floor(totalDays/7);
  var remainder=totalDays%7;
  var bizDays=fullWeeks*5;
  var dayOfWeek=sd.getDay();
  for(var i=0;i<remainder;i++){
    var dow=(dayOfWeek+i)%7;
    if(dow!==0&&dow!==6)bizDays++;
  }
  return bizDays;
}

function bucket_(r){if(!r||!r.interUp)return'BALCAO';if(r.interUp==='VR')return'VR';if(r.interUp==='SEM CONTRATO'||r.interUp==='APP')return'BALCAO';if(r.interUp==='CONTRATO ECT'||r.interUp==='PORTAL POSTAL')return'CONTRATO';return'INTERMEDIADORES'}
function isBal_(r){return bucket_(r)==='BALCAO'||r.tipoUp==='APP'||r.tipoUp==='BALCAO'||r.tipoUp==='BALCÃO'}
function isCon_(r){return bucket_(r)==='CONTRATO'||r.tipoUp==='REVERSO'}

var _ss_mov_=null,_ss_met_=null;
function getSsMov_(){return _ss_mov_||(_ss_mov_=SpreadsheetApp.openById(CFG.FILES.MOVIMENTOS_ID))}
function getSsMet_(){return _ss_met_||(_ss_met_=SpreadsheetApp.openById(CFG.FILES.METAS_ID))}

/* === CACHE === */
function gc_(){return CacheService.getScriptCache()}
/* v10.4: helper para normalizar chaves longas (CacheService tem limite de 250 chars).
   Usa MD5 em hex (32 chars) + prefixo curto para manter legibilidade nos logs. */
function hashKey_(s){
  try{
    var b=Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, String(s||''));
    var hex='';
    for(var i=0;i<b.length;i++){
      var v=(b[i]<0?b[i]+256:b[i]).toString(16);
      if(v.length<2)v='0'+v;
      hex+=v;
    }
    return hex;
  }catch(e){
    /* fallback: trunca + tamanho para reduzir colisão */
    var str=String(s||'');
    return str.length+'_'+str.slice(0,200);
  }
}
function gcj_(k){var c=gc_(),r=c.get(k);if(!r)return null;try{var m=JSON.parse(r);if(m&&m._chunks){var p=[];for(var i=0;i<m._chunks;i++){var ch=c.get(k+'_c'+i);if(!ch)return null;p.push(ch)}return JSON.parse(p.join(''))}return m}catch(e){return null}}
function pcj_(k,o,s){var c=gc_(),j=JSON.stringify(o);if(j.length<=CFG.CACHE.MAX_CHUNK){c.put(k,j,s);return}var chs=[],ps={};for(var i=0;i<j.length;i+=CFG.CACHE.MAX_CHUNK)chs.push(j.substring(i,i+CFG.CACHE.MAX_CHUNK));for(var x=0;x<chs.length;x++)ps[k+'_c'+x]=chs[x];ps[k]=JSON.stringify({_chunks:chs.length});c.putAll(ps,s)}
function rmc_(k){try{gc_().remove(k)}catch(e){}}
function clearDashboardCaches_(){
  [
    'bb_v10_1',
    'bb_v10_2_dupass',
    'filters_v10_2',
    'filters_v10_3',
    'master_dash_v2',
    'master_dash_v3',
    'master_dash_v4'
  ].forEach(function(k){rmc_(k)});
  return{ok:true,msg:'Caches principais limpos.'};
}

/* === LEITURA === */
function getBundle_(){
  var c=gcj_('bb_v10_2_dupass');
  if(c)return c;
  var mv=readMov_(),mt=readMet_();
  var metaMap={},monthsMap={},unitsMap={},typesMap={},intersMap={},segsMap={},lat='';
  for(var i=0;i<mt.length;i++){metaMap[mt[i].ym]=mt[i];monthsMap[mt[i].ym]=1}
  for(var j=0;j<mv.length;j++){
    var r=mv[j];
    if(!lat||r.ymd>lat)lat=r.ymd;
    if(r.unidade)unitsMap[r.unidade]=1;
    if(r.tipoServico)typesMap[r.tipoServico]=1;
    if(r.intermediador)intersMap[r.intermediador]=1;
    if(r.segmento)segsMap[r.segmento]=1;
  }
  if(!lat)lat=ymd_(new Date());
  var b={
    rows:mv,
    metas:mt,
    metaMap:metaMap,
    latest:lat,
    minStart:CFG.RULES.MIN_START,
    months:Object.keys(monthsMap).sort(),
    units:Object.keys(unitsMap).sort(),
    types:Object.keys(typesMap).sort(),
    intermediadores:Object.keys(intersMap).sort(),
    segmentos:Object.keys(segsMap).sort()
  };
  pcj_('bb_v10_2_dupass',b,CFG.CACHE.BASE_SEC);
  return b;
}

function readMov_(){var ss=getSsMov_(),sh=ss.getSheetByName(CFG.SHEETS.MOVIMENTOS);if(!sh)throw new Error('Aba BASE_TOTAL não encontrada.');var lr=sh.getLastRow(),lc=sh.getLastColumn();if(lr<2||lc<1)return[];var v=sh.getRange(1,1,lr,lc).getValues(),h=bhm_(v[0]),o=[];for(var i=1;i<v.length;i++){var r=v[i],ymd=pds_(cl_(r,h,['DATA FORMAT','DATA']));if(!ymd)continue;var nm=ct_(cl_(r,h,['NOME_REMETENTE','REMETENTE']))||'SEM NOME',tp=ct_(cl_(r,h,['TIPO_SERVICO','TIPO']))||'SEM TIPO',it=ct_(cl_(r,h,['INTERMEDIADOR']))||'SEM INTERMEDIADOR',un=ct_(cl_(r,h,['LOCAL','UNIDADE']))||'SEM UNIDADE',sg=ct_(cl_(r,h,['SEGMENTO']))||'',ct2=ct_(cl_(r,h,['CATEGORIA']))||'',eq=sa_(cl_(r,h,['ETIQUETA_CONTRATO'])).toUpperCase(),ie=cl_(r,h,['IF ETIQUETA','IF_ETIQUETA']);o.push({ymd:ymd,ym:ym_(ymd),nomeRemetente:nm,clienteKey:bck_(nm),unidade:un,tipoServico:tp,tipoUp:sa_(tp).toUpperCase(),intermediador:it,interUp:sa_(it).toUpperCase(),segmento:sg,categoria:ct2,qtd:ns_(cl_(r,h,['QTD','QUANTIDADE'])),valor:ns_(cl_(r,h,['VALOR','FATURAMENTO'])),etqCom:eq==='COM'?'COM':'SEM',hasEtq:eq==='COM'||bl_(ie)})}return o}

function readMet_(){var ss=getSsMet_(),sh=ss.getSheetByName(CFG.SHEETS.METAS);if(!sh)throw new Error('Aba DIAS_UTEIS não encontrada.');var lr=sh.getLastRow(),lc=sh.getLastColumn();if(lr<2||lc<1)return[];var v=sh.getRange(1,1,lr,lc).getValues(),h=bhm_(v[0]),o=[];for(var i=1;i<v.length;i++){var r=v[i],a=+cl_(r,h,['ANO'])||0,m=+cl_(r,h,['MES'])||0;if(!a||!m)continue;o.push({ym:Utilities.formatString('%04d-%02d',a,m),nomeMes:ct_(cl_(r,h,['NOME MES','NOME_MES']))||'',metaFat:ns_(cl_(r,h,['META FAT','META_FAT'])),metaDia:ns_(cl_(r,h,['META DIA','META_DIA'])),duMes:ns_(cl_(r,h,['DIAS_UTEIS_MES'])),duPass:ns_(cl_(r,h,['DIAS_UTEIS_PASSADOS'])),duRest:ns_(cl_(r,h,['DIAS_UTEIS_REST']))})}return o}




/* === FILTROS === */
function normF_(p,lat){var ym=ct_(p.monthYm||ym_(lat)),ms=msYm_(ym),rme=meYm_(ym),me=rme>lat?lat:rme;var gMin=CFG.RULES.MIN_START,gMax=lat;var rs=ct_(p.startDate||ms),re=ct_(p.endDate||me);var sd=rs<gMin?gMin:(rs>gMax?gMax:rs);var ed=re<sd?sd:(re>gMax?gMax:re);var dy=ct_(p.day||ed);if(dy<sd)dy=sd;if(dy>ed)dy=ed;var units=csvA_(p.units||p.unit||''),types=csvA_(p.types||p.type||''),inters=csvA_(p.inters||p.inter||''),segs=csvA_(p.segs||p.seg||'');return{monthYm:ym,monthStart:ms,monthEnd:me,startDate:sd,endDate:ed,day:dy,unit:units.join(','),units:units,type:types.join(','),types:types,inter:inters.join(','),inters:inters,seg:segs.join(','),segs:segs,q:ct_(p.q||'')}}
function fltND_(rows,f){return rows.filter(function(r){if(f.units&&f.units.length&&f.units.indexOf(r.unidade)<0)return false;if(f.types&&f.types.length&&f.types.indexOf(r.tipoServico)<0)return false;if(f.inters&&f.inters.length&&f.inters.indexOf(r.intermediador)<0)return false;if(f.segs&&f.segs.length&&f.segs.indexOf(r.segmento)<0)return false;if(f.q&&r.clienteKey.indexOf(bck_(f.q))<0)return false;return true})}

function fltW_(rows,f){return rows.filter(function(r){if(r.ymd<f.startDate||r.ymd>f.endDate)return false;if(f.units&&f.units.length&&f.units.indexOf(r.unidade)<0)return false;if(f.types&&f.types.length&&f.types.indexOf(r.tipoServico)<0)return false;if(f.inters&&f.inters.length&&f.inters.indexOf(r.intermediador)<0)return false;if(f.segs&&f.segs.length&&f.segs.indexOf(r.segmento)<0)return false;if(f.q&&r.clienteKey.indexOf(bck_(f.q))<0)return false;return true})}

/* === AGREGAÇÕES === */
function mAgg_(rows){var a={};for(var i=0;i<rows.length;i++){var r=rows[i];if(!a[r.ym])a[r.ym]={v:0,q:0,c:{}};a[r.ym].v+=r.valor;a[r.ym].q+=r.qtd;a[r.ym].c[r.clienteKey]=1}return Object.keys(a).sort().map(function(ym){return{ym:ym,faturamento:a[ym].v,objetos:a[ym].q,clientes:Object.keys(a[ym].c).length,ticket:a[ym].q>0?a[ym].v/a[ym].q:0}})}

function mctx_(metaMap,monthYm,lat,cut){var mt=metaMap[monthYm]||null,ms=msYm_(monthYm),rme=meYm_(monthYm),me=rme>lat?lat:rme;var cf=cut>me?me:cut;var duT=mt&&mt.duMes>0?mt.duMes:cBD_(ms,rme);var useSheetPassed=!!(mt&&monthYm===ym_(lat)&&mt.duPass>=0);var duD=useSheetPassed?mt.duPass:cBD_(ms,cf);duD=Math.min(duD,duT);var duR=useSheetPassed&&mt.duRest>=0?mt.duRest:Math.max(0,duT-duD);var pct=duT>0?(duD/duT)*100:0;var mD=mt&&mt.metaDia>0?mt.metaDia:0;if(!mD&&mt&&mt.metaFat>0&&duT>0)mD=mt.metaFat/duT;return{monthYm:monthYm,nomeMes:mt?mt.nomeMes:'',monthStart:ms,monthEnd:me,metaFat:mt?mt.metaFat:0,metaDia:mD,duTotal:duT,duDecorridos:duD,duRest:duR,pctTempo:pct}}

/* === CLIENT METRICS === */
function buildCM_(base,win,refDate,selYm,curYm){var map={};for(var i=0;i<base.length;i++){var r=base[i];if(!map[r.clienteKey])map[r.clienteKey]={nome:r.nomeRemetente,last:r.ymd,first:r.ymd,hist:[],win:[],bkRev:{CONTRATO:0,VR:0,BALCAO:0,INTERMEDIADORES:0},tvW:{},ivW:{},eqCom:false,eqBase:false,tQ:0,tV:0,hasNonRevFirst:false};var c=map[r.clienteKey];if(r.ymd>c.last)c.last=r.ymd;if(r.ymd<c.first)c.first=r.ymd;c.hist.push(r);c.tQ+=r.qtd;c.tV+=r.valor;if(r.tipoUp!=='REVERSO'&&ym_(r.ymd)===ym_(c.first)&&r.ymd===c.first)c.hasNonRevFirst=true}
for(var i2=0;i2<base.length;i2++){var r2=base[i2];if(!map[r2.clienteKey])continue;if(r2.tipoUp!=='REVERSO'&&r2.ymd===map[r2.clienteKey].first)map[r2.clienteKey].hasNonRevFirst=true}
for(var j=0;j<win.length;j++){var rw=win[j];if(!map[rw.clienteKey])continue;var cw=map[rw.clienteKey];cw.win.push(rw);cw.bkRev[bucket_(rw)]+=rw.valor;cw.tvW[rw.tipoServico]=(cw.tvW[rw.tipoServico]||0)+rw.valor;cw.ivW[rw.intermediador]=(cw.ivW[rw.intermediador]||0)+rw.valor;if(!isBal_(rw)){cw.eqBase=true;if(rw.hasEtq)cw.eqCom=true}}
var out=[],ks=Object.keys(map),l30=addD_(refDate,-29),p30s=addD_(refDate,-59),p30e=addD_(refDate,-30);
for(var k=0;k<ks.length;k++){var ck=ks[k],c3=map[ck];var f30=0,fp30=0,q30=0,qp30=0,fW=0,qW=0,d30={},dW={},mH={};
for(var h=0;h<c3.hist.length;h++){var r3=c3.hist[h];mH[r3.ym]=(mH[r3.ym]||0)+r3.valor;if(r3.ymd>=l30&&r3.ymd<=refDate){f30+=r3.valor;q30+=r3.qtd;d30[r3.ymd]=1}if(r3.ymd>=p30s&&r3.ymd<=p30e){fp30+=r3.valor;qp30+=r3.qtd}}
for(var w=0;w<c3.win.length;w++){fW+=c3.win[w].valor;qW+=c3.win[w].qtd;dW[c3.win[w].ymd]=1}
var mKs=Object.keys(mH),aHM=0;for(var m2=0;m2<mKs.length;m2++)aHM+=mH[mKs[m2]];aHM=mKs.length?aHM/mKs.length:0;
var dsm=diffD_(refDate,c3.last),dias30=Object.keys(d30).length,tr=trend_(f30,fp30);
var isNovo=ym_(c3.first)===selYm;
var firstYmRows=c3.hist.filter(function(r){return ym_(r.ymd)===ym_(c3.first)});
var hasNonRev=firstYmRows.some(function(r){return r.tipoUp!=='REVERSO'});
if(!hasNonRev)isNovo=false;
var isRec=dias30>=CFG.RULES.REC_MIN_DIAS||q30>=CFG.RULES.REC_MIN_QTD;
var mb=topK_(c3.bkRev);
var needsC=!(c3.eqBase&&c3.eqCom)||mb==='VR';
out.push({ck:ck,nome:c3.nome,last:c3.last,first:c3.first,dsm:dsm,st:stDays_(dsm),isInt:isInt_(ck),isNovo:isNovo,isRec:isRec,needsC:needsC,fW:fW,qW:qW,dW:Object.keys(dW).length,f30:f30,fp30:fp30,q30:q30,qp30:qp30,d30:dias30,tkW:qW>0?fW/qW:0,tkG:c3.tQ>0?c3.tV/c3.tQ:0,aHM:aHM,tQ:c3.tQ,tV:c3.tV,tend:tr.label,tendD:tr.d,fdPct:pctD_(f30,fp30),qdPct:pctD_(q30,qp30),bk:mb,tipP:topK_(c3.tvW),intP:topK_(c3.ivW),etq:c3.eqBase?c3.eqCom:false,etqB:c3.eqBase,temW:fW>0||qW>0})}
return out}

/* === ACTION ENGINE v3.1 (alinhada com regras.txt) === */
function buildAP_(clients){
  var ni=clients.filter(function(c){return!c.isInt});
  var vs=ni.map(function(c){return c.aHM}).filter(function(v){return v>0}).sort(function(a,b){return a-b});
  var p50=vs.length?vs[Math.max(0,Math.floor(vs.length*.5)-1)]:0;
  var tvs=ni.map(function(c){return c.tkG}).filter(function(v){return v>0}).sort(function(a,b){return a-b});
  var tp50=tvs.length?tvs[Math.max(0,Math.floor(tvs.length*.5)-1)]:0;

  var out=[];
  for(var i=0;i<ni.length;i++){
    var c=ni[i],ac='MANTER',pr='BAIXA',mt='Carteira estável',sc=10;
    var gp=Math.max(c.aHM,c.f30,c.fW);
    var hv=c.aHM>=p50||c.tkG>=tp50;
    var in60=c.dsm>=CFG.RULES.INATIVO_THRESHOLD;
    var isVR=c.bk==='VR';
    var isBal=c.bk==='BALCAO';

    if(isVR&&in60&&c.tQ<CFG.RULES.CONV_MIN_TOTAL){
      ac='CANCELAR';pr='BAIXA';mt='VR inativo, baixo volume, '+c.dsm+'d sem postar';sc=5;
    }
    else if(isVR&&c.st==='INATIVO_30_59D'&&!c.isRec&&!hv){
      ac='CANCELAR';pr='BAIXA';mt='VR esfriando '+c.dsm+'d, sem recorrência';sc=8;
    }
    else if(in60&&hv){
      ac='RESGATAR';pr='ALTA';mt='Cliente valioso inativo há '+c.dsm+'d';sc=100;
    }
    else if(in60&&!isVR){
      ac='RESGATAR';pr='MÉDIA';mt='Inativo há '+c.dsm+'d';sc=70;
    }
    else if(in60&&isVR){
      ac='CANCELAR';pr='BAIXA';mt='VR inativo '+c.dsm+'d';sc=5;
    }
    else if(isVR&&c.isRec&&hv){
      ac='CONVERTER';pr='ALTA';mt='VR forte, migrar para contrato';sc=92;
    }
    else if(isVR&&!in60&&c.tQ>=CFG.RULES.CONV_MIN_TOTAL){
      ac='CONVERTER';pr='MÉDIA';mt='VR ativo, '+c.tQ+' obj, potencial contrato';sc=80;
    }
    else if(isVR){
      ac='CANCELAR';pr='BAIXA';mt='VR baixo retorno';sc=5;
    }
    else if(c.needsC&&isBal&&c.isRec&&c.tQ>=CFG.RULES.CONV_MIN_TOTAL&&hv){
      ac='CONVERTER';pr='ALTA';mt='Balcão recorrente sem contrato, '+c.tQ+' obj';sc=92;
    }
    else if(c.needsC&&c.tQ>=CFG.RULES.CONV_MIN_TOTAL){
      var cv=c.isRec&&hv;
      ac='CONVERTER';pr=cv?'ALTA':'MÉDIA';mt='Sem contrato, '+c.tQ+' obj'+(c.isRec?', recorrente':'');sc=cv?92:80;
    }
    else if(c.needsC&&c.tQ<CFG.RULES.CONV_MIN_TOTAL&&c.st!=='ATIVO_30D'){
      ac='CANCELAR';pr='BAIXA';mt='Sem contrato, baixo volume, esfriando';sc=5;
    }
    else if(isBal&&!c.needsC&&c.isRec&&hv){
      ac='FIDELIZAR';pr='MÉDIA';mt='Balcão c/ contrato, recorrente e valioso';sc=75;
    }
    else if(!c.needsC&&c.tend==='CAINDO'&&hv){
      ac='FIDELIZAR';pr='ALTA';mt='Com contrato, queda '+(c.fdPct!=null?Math.round(c.fdPct)+'%':'');sc=88;
    }
    else if(!c.needsC&&c.tend==='CAINDO'){
      ac='FIDELIZAR';pr='MÉDIA';mt='Em queda, acompanhar de perto';sc=72;
    }
    else if(c.isNovo&&c.isRec&&!c.needsC){
      ac='FIDELIZAR';pr='MÉDIA';mt='Cliente novo e recorrente, fortalecer vínculo';sc=65;
    }
    else if(c.tend==='CRESCENDO'&&!c.needsC){
      ac='FIDELIZAR';pr='MÉDIA';mt='Crescendo, proteger cliente';sc=60;
    }
    else if(!c.needsC&&c.d30>=4&&hv){
      ac='FIDELIZAR';pr='MÉDIA';mt='Frequente e valioso, manter próximo';sc=55;
    }

    out.push({nome:c.nome,ck:c.ck,ac:ac,pr:pr,mt:mt,gp:gp,sc:sc,last:c.last,dsm:c.dsm,st:c.st,isNovo:c.isNovo,isRec:c.isRec,bk:c.bk,needsC:c.needsC,etq:c.etq,fW:c.fW,qW:c.qW,tkW:c.tkW,tkG:c.tkG,tQ:c.tQ,f30:c.f30,fp30:c.fp30,q30:c.q30,fdPct:c.fdPct,qdPct:c.qdPct,aHM:c.aHM,tend:c.tend,tipP:c.tipP,intP:c.intP});
  }
  out.sort(function(a,b){return b.sc!==a.sc?b.sc-a.sc:b.gp!==a.gp?b.gp-a.gp:a.dsm-b.dsm});
  return out;
}

function normAcDash_(acao){
  var a=sa_(acao||'').toUpperCase();
  // VISITAR deixou de ser ação principal. Mantemos compatibilidade com dados antigos.
  if(a==='VISITAR') return 'FIDELIZAR';
  return a || 'MANTER';
}
function normPrDash_(pr){
  var p=sa_(pr||'').toUpperCase();
  if(p==='CRITICA') return 'CRITICA';
  if(p==='ALTA') return 'ALTA';
  if(p==='MEDIA') return 'MEDIA';
  return 'BAIXA';
}
function acSum_(rows){var s={RESGATAR:0,CONVERTER:0,FIDELIZAR:0,CANCELAR:0,MANTER:0};for(var i=0;i<rows.length;i++){var a=normAcDash_(rows[i].ac);s[a]=(s[a]||0)+1;}return oSA_(s)}
function trSum_(cls){var o={CRESCENDO:0,ESTAVEL:0,CAINDO:0};for(var i=0;i<cls.length;i++)if(!cls[i].isInt)o[cls[i].tend]=(o[cls[i].tend]||0)+1;return oSA_(o)}

/* === DICAS BANK === */
function buildDicas_(desvio,percMeta,duRest,fatDia,metaDiaBase,cliDia,tkDia,nConv,nResg,nNovos,duDec){
var d=[];
if(desvio<-20){
d.push('📞 Ligue agora para os 5 maiores clientes que pararam de postar. Pergunte: "Oi [nome], tudo bem? Notamos que faz tempo que não recebemos suas encomendas. Aconteceu algo? Como podemos ajudar?"');
d.push('🎯 No balcão, ofereça produtos extras (embalagem, AR, seguro, Mão Própria) logo no início do atendimento. Cada real a mais no ticket ajuda a recuperar o mês.');
d.push('📋 Abra a aba Ações, filtre por RESGATAR e escolha 3 clientes. Mande agora: "Oi [nome], aqui é da agência Correios. Temos condições especiais para envios frequentes. Posso te explicar?"');
d.push('🔍 Verifique se algum cliente grande migrou para outra agência ou transportadora. Descubra o motivo e tente reverter com uma proposta de contrato.');
d.push('🏪 Passe em 2 comércios vizinhos hoje e pergunte: "Vocês enviam encomendas? Podemos orientar a melhor forma de agilizar suas postagens e reduzir filas."');
}else if(desvio<-10){
d.push('🏪 Tem cliente recorrente no balcão sem contrato? Aborde: "Você sempre posta com a gente, que tal eu te mostrar como funciona o contrato dos Correios? Fica mais rápido e mais barato."');
d.push('💡 Peça indicações aos seus melhores remetentes. Quem posta muito conhece quem precisa postar. Pergunte: "Conhece alguém que envia bastante e poderia se beneficiar do nosso serviço?"');
d.push('📲 Mande mensagem para os 3 maiores clientes do mês passado que ainda não postaram: "Oi [nome], tudo bem? Estamos com ótimas condições este mês. Tem encomendas para enviar?"');
d.push('🏷️ Logo no início do atendimento, pergunte se o cliente precisa de embalagem: "Temos caixa, envelope, plástico bolha." Venda de produtos aumenta o ticket médio.');
d.push('📝 Atualize o WhatsApp de todo cliente que passar no balcão hoje. Esse contato será essencial para ações futuras.');
}else if(desvio<0){
d.push('📊 Quase no ritmo! Escolha 2 clientes sem contrato da aba Clientes e ofereça hoje: "Vi que você envia bastante. Com contrato, o preço fica melhor e a gente pode buscar na sua loja."');
d.push('💬 No atendimento, pergunte: "Você sempre posta com a gente, que tal eu te mostrar como funciona o contrato dos Correios? Você economiza tempo e dinheiro."');
d.push('🤝 Identifique 1 cliente que cresceu este mês e mande: "Oi [nome], notamos que está enviando mais. Obrigado pela confiança! Se precisar, temos condições especiais para quem envia em volume."');
d.push('📦 Para clientes de balcão com alto volume, ofereça apoio operacional: "Para o volume que você envia, podemos organizar uma rotina mais prática. Quer que eu explique?"');
}else if(desvio<10){
d.push('✅ Bom ritmo! Aproveite para prospectar: visite 2 comércios ou lojistas online da região que ainda não são clientes.');
d.push('🤝 Mande uma mensagem de agradecimento para seus 3 maiores clientes: "Oi [nome], obrigado pela parceria! Qualquer coisa que precisar, conta com a gente."');
d.push('📈 Momento ideal para converter clientes sem contrato. O mês está positivo — use como argumento: "Este mês está indo bem, aproveita para fechar o contrato com condições especiais."');
d.push('🆕 Procure lojistas que vendem no Instagram, Shopee ou Mercado Livre na região. Marketplace = volume constante de postagens.');
}else{
d.push('🏆 Mês acima do esperado! Ligue para os top 5 clientes e reforce: "Oi [nome], só para agradecer. Sua parceria é muito importante para a gente."');
d.push('🔒 Proteja seus top clientes. Uma mensagem de agradecimento custa zero e vale muito: "Obrigado pela confiança, [nome]! Estamos sempre à disposição."');
d.push('🌟 Aproveite o bom momento para abordar novos prospects sem pressão. Quem prospecta no mês bom, colhe no mês difícil.');
d.push('📦 Ofereça upgrade para quem posta PAC: "Por mais R$X, o Sedex entrega em metade do tempo. Vale a pena para seu cliente receber mais rápido."');
}

if(duRest<=3&&percMeta<100)d.push('⏰ Últimos '+duRest+' dias úteis! Foque em ligações agora: clientes que você abordar hoje ainda podem postar antes do fim do mês.');
else if(duRest<=5&&desvio<0)d.push('📅 Reta final do mês. Revise a aba Ações: clientes marcados CONVERTER e RESGATAR são sua melhor chance de bater a meta.');
else if(duDec<=5)d.push('🗓️ Início de mês. Dedique 30 minutos por dia para prospectar. Defina 10 clientes-alvo e acompanhe semanalmente na Carteira Inteligente.');
if(fatDia>=metaDiaBase*1.5&&metaDiaBase>0)d.push('🔥 Dia acima da meta diária! Identifique o que gerou esse resultado e tente replicar amanhã.');
else if(fatDia>0&&fatDia<metaDiaBase*0.5&&metaDiaBase>0)d.push('📉 Dia abaixo da meta. Amanhã, comece ligando para 3 clientes que costumam postar em volume. Não espere eles virem — vá atrás.');
if(cliDia>=10)d.push('👥 Bom fluxo hoje! Em cada atendimento, pergunte: "Precisa de embalagem? E de Aviso de Recebimento?" Serviços extras aumentam o ticket.');
else if(cliDia>0&&cliDia<=3)d.push('🔍 Poucos clientes no balcão hoje. Use o tempo livre para ligar e prospectar. Tempo parado = oportunidade perdida.');
if(tkDia>metaDiaBase/3&&metaDiaBase>0)d.push('💰 Ticket médio alto hoje! Lembre: sempre ofereça AR, Mão Própria, seguro e embalagem. Quem pergunta, vende.');
if(nConv>5)d.push('🏷️ Tem '+nConv+' clientes prontos para migrar para contrato. Reserve 15 min após o almoço e mande mensagem para os top 3: "Oi, posso te mostrar as vantagens do contrato?"');
if(nResg>10)d.push('📞 '+nResg+' clientes inativos na base. Divida com a equipe: cada um liga para 3 por dia. Em uma semana, cobrem todos.');
if(nNovos>0)d.push('🆕 '+nNovos+' clientes novos este mês! Cadastre o WhatsApp de cada um e mande: "Bem-vindo! Sou da agência Correios. Qualquer dúvida sobre envios, é só chamar."');
else if(nNovos===0&&duDec>5)d.push('🔎 Nenhum cliente novo no mês ainda. Peça a cada atendente que indique a agência para pelo menos 1 pessoa hoje.');
var fixas=['💬 No balcão, sempre pergunte: "Você envia com frequência?" Se sim, apresente o contrato na hora. Essa pergunta simples converte.','📦 Sempre ofereça embalagem antes do cliente perguntar. Mostre: "Temos caixa, envelope, plástico bolha." Muitos compram se você mostrar.','⭐ Vale a pena conhecer seus clientes pelo nome. Após o atendimento, confira ou atualize o cadastro do WhatsApp. Esse contato vale ouro.','🎯 Ofereça serviços extras em todo atendimento: AR, Mão Própria, Seguro, Embalagem. Não espere o cliente pedir — ofereça.','📲 Mande 1 mensagem por dia para um cliente diferente. Em 30 dias, você conversou com 30 clientes. Relacionamento se constrói no dia a dia.','🏪 Passe em frente a 1 comércio novo por dia e deixe um cartão da agência. Prospectar é rotina, não evento.','🤝 Quando um cliente elogiar o atendimento, peça uma indicação na hora: "Conhece alguém que envia bastante? Posso apresentar nossas condições."','📋 Antes de fechar o dia, olhe os números no Dashboard. 2 minutos de análise evitam surpresas no final do mês.','💡 Cliente que vende online precisa de agilidade. Ofereça: "Com contrato, a gente busca na sua loja todo dia. Sem fila, sem deslocamento."','📦 Quando o cliente trouxer produto mal embalado, ofereça a embalagem da agência: "Temos embalagem própria, protege melhor e evita avaria."','💰 Cliente perguntou quanto custa? Sempre apresente Sedex E PAC. Dê opção: "PAC chega em X dias por R$Y, Sedex em Z dias por R$W."','📝 Cada cliente que sai sem contrato é uma oportunidade adiada. Anote o nome no celular e aborde na próxima visita.','🏷️ Cliente VR paga mais caro sem saber. Ofereça: "Posso migrar para contrato direto? Você economiza no frete e tem prazo menor."','🔍 Olhe as lojas de roupas, cosméticos e acessórios da região. Todas vendem online e precisam de Correios. Visite 1 por semana.','💬 Quando o cliente disser "tá caro", explique o valor: rastreio completo, seguro, entrega em todo o Brasil. Mostre que é investimento, não custo.','📊 Confira no Raio-X quais clientes não postaram este mês. Mande mensagem antes que eles esqueçam da agência.','🤝 Um cliente satisfeito indica 3. Um insatisfeito afasta 10. Resolva qualquer problema no mesmo dia, sem deixar para amanhã.','🆕 Busque influenciadores e lojistas do Instagram na região. Eles enviam bastante e valorizam parceria com agência local.','📱 Crie uma lista de transmissão no WhatsApp com os clientes mais frequentes. Use para avisar sobre novidades e condições especiais.','🎁 Sexta-feira? Lembre clientes de e-commerce: "Poste hoje para garantir entrega na semana que vem. Não deixe seu cliente esperando."'];
var diaIdx=(new Date().getDate()-1)%fixas.length;
d.push(fixas[diaIdx]);
return d.slice(0,5);
}

/* === FOCO DE NEGÓCIO === */
function buildFoco_(ap,nConv,nResg,nVisit,nCanc,pctBalcao,pctContrato){
var f=[];
var nFidCrit=ap.filter(function(x){return normAcDash_(x.ac)==='FIDELIZAR'&&normPrDash_(x.pr)==='CRITICA'}).length;
if(nResg>20)f.push('🔴 '+nResg+' clientes para resgatar. Crie um mutirão de ligações: 10 por dia. Em 2 semanas a lista está limpa.');
if(nConv>10)f.push('🟡 '+nConv+' clientes prontos para converter em contrato. Foque nos que têm maior ticket médio.');
if(nFidCrit>0)f.push('🟠 '+nFidCrit+' clientes estratégicos em fidelização crítica. Priorize visita ou contato consultivo esta semana.');
if(pctBalcao>40)f.push('🏪 '+Math.round(pctBalcao)+'% da base é balcão. Migre pelo menos 20% desses para contrato — é receita recorrente garantida.');
if(nCanc>50)f.push('⚪ '+nCanc+' clientes VR para cancelar. Não gaste energia com eles — foque nos que dão retorno.');
if(f.length===0)f.push('✅ Carteira equilibrada. Mantenha o acompanhamento semanal e foque em prospectar novos clientes.');
return f.slice(0,4);
}

/* === BUILDERS === */
function buildOv_(base,win,cAll,cWin,metaMap,f,lat,ap){
var mYm=f.monthYm,pYm=prevYm_(mYm);
var mR=base.filter(function(r){return r.ym===mYm}),pR=base.filter(function(r){return r.ym===pYm});
var fM=sumR_(mR,'valor'),oM=sumR_(mR,'qtd'),fP=sumR_(pR,'valor'),oP=sumR_(pR,'qtd');
var tM=oM>0?fM/oM:0,tP=oP>0?fP/oP:0;
var mc=mctx_(metaMap,mYm,lat,f.endDate);
var metaM=mc.metaFat,percM=metaM>0?fM/metaM*100:0;
var mRest=Math.max(0,metaM-fM),mNec=mc.duRest>0?mRest/mc.duRest:0,dvI=percM-mc.pctTempo;

var a30=0,i3059=0,i60=0,novos=0,niAll=cAll.filter(function(x){return!x.isInt});
for(var c=0;c<niAll.length;c++){var x=niAll[c];if(x.st==='ATIVO_30D')a30++;else if(x.st==='INATIVO_30_59D')i3059++;else i60++;if(x.isNovo)novos++}
var ctC=0,vrC=0,blC=0,intC=0,cEtq=0,sEtq=0,bEtq=0,niWin=cWin.filter(function(x){return!x.isInt}),topCl=[];
for(var c2=0;c2<niWin.length;c2++){var y=niWin[c2];if(y.bk==='CONTRATO')ctC++;else if(y.bk==='VR')vrC++;else if(y.bk==='BALCAO')blC++;else intC++;if(y.etqB){bEtq++;if(y.etq)cEtq++;else sEtq++}topCl.push({nome:y.nome,fat:y.fW,obj:y.qW,last:y.last,tkW:y.tkW})}

var byType={},byInter={},segV={},catQ={};
for(var i=0;i<win.length;i++){var r=win[i];byType[r.tipoServico]=(byType[r.tipoServico]||0)+r.valor;byInter[r.intermediador]=(byInter[r.intermediador]||0)+r.valor;segV[r.segmento||'OUTROS']=(segV[r.segmento||'OUTROS']||0)+r.valor;catQ[r.categoria||'OUTROS']=(catQ[r.categoria||'OUTROS']||0)+r.qtd}

topCl.sort(function(a,b){return b.fat-a.fat});
var tot=niWin.length,pB=function(n){return tot>0?n/tot*100:0};
var mSeries=mAgg_(base).slice(-6);

var dailyMap={};
for(var d=0;d<mR.length;d++){var dr=mR[d];dailyMap[dr.ymd]=(dailyMap[dr.ymd]||0)+dr.valor}
var dailySeries=Object.keys(dailyMap).sort().map(function(ymd){return{day:ymd.slice(8),ymd:ymd,valor:dailyMap[ymd]}});

var nConv=ap.filter(function(x){return x.ac==='CONVERTER'}).length;
var nResg=ap.filter(function(x){return x.ac==='RESGATAR'}).length;
var nVisit=0; // compatibilidade de payload legado; VISITAR não é recomendação estratégica.
var fW=sumR_(win,'valor'),oW=sumR_(win,'qtd');

return{fW:fW,oW:oW,cards:{fM:fM,fP:fP,fdPct:pctD_(fM,fP),metaM:metaM,percM:percM,mRest:mRest,mNec:mNec,dvI:dvI,tM:tM,tP:tP,tdPct:pctD_(tM,tP),oM:oM,oP:oP,odPct:pctD_(oM,oP),tot:tot,a30:a30,i3059:i3059,i60:i60,novos:novos,ctC:ctC,ctPct:pB(ctC),vrC:vrC,vrPct:pB(vrC),blC:blC,blPct:pB(blC),intC:intC,intPct:pB(intC),cEtq:cEtq,sEtq:sEtq,bEtq:bEtq},mc:mc,
insights:{alertaMeta:dvI>=0?'Mês em linha ou acima do ritmo.':'Abaixo do ritmo. Priorizar conversão e resgate.'},
topCl:topCl.slice(0,CFG.LIMITS.TOP_GEN),byType:oSA_(byType).slice(0,12),byInter:oSA_(byInter).slice(0,12),mSeries:mSeries,dailySeries:dailySeries,
seg:{seg:oSA_(segV),catQ:oSA_(catQ)},tendencia:trSum_(cWin),etqChart:[{label:'COM contrato',value:cEtq},{label:'SEM contrato',value:sEtq}]}}
function buildDaily_(base,metaMap,f,lat,nConv,nResg,nNovos){
var dy=f.day,dR=base.filter(function(r){return r.ymd===dy});
var mR=base.filter(function(r){return r.ym===f.monthYm&&r.ymd>=f.monthStart&&r.ymd<=dy});
var pDy=dy>f.monthStart?addD_(dy,-1):'',pDR=pDy?base.filter(function(r){return r.ymd===pDy}):[];
var fD=0,oD=0,fDP=0,oDP=0,dC={},bI={},tM={};
for(var i=0;i<dR.length;i++){var r=dR[i];fD+=r.valor;oD+=r.qtd;dC[r.clienteKey]=1;bI[r.intermediador]=(bI[r.intermediador]||0)+r.valor;if(!tM[r.clienteKey])tM[r.clienteKey]={nome:r.nomeRemetente,v:0,q:0};tM[r.clienteKey].v+=r.valor;tM[r.clienteKey].q+=r.qtd}
for(var p=0;p<pDR.length;p++){fDP+=pDR[p].valor;oDP+=pDR[p].qtd}
var fA=0,oA=0,mC={};for(var j=0;j<mR.length;j++){fA+=mR[j].valor;oA+=mR[j].qtd;mC[mR[j].clienteKey]=1}
var tkD=oD>0?fD/oD:0,mc=mctx_(metaMap,f.monthYm,lat,dy);
var pM=mc.metaFat>0?fA/mc.metaFat*100:0,dv=pM-mc.pctTempo;
var mRestD=Math.max(0,mc.metaFat-fA),mDN=mc.duRest>0?mRestD/mc.duRest:0;
var tC=Object.keys(tM).map(function(k){return tM[k]}).sort(function(a,b){return b.v-a.v}).slice(0,10);
var dicas=buildDicas_(dv,pM,mc.duRest,fD,mc.metaDia,Object.keys(dC).length,tkD,nConv,nResg,nNovos,mc.duDecorridos);
return{day:dy,nav:{cur:dy,prev:pDy,next:dy<f.monthEnd?addD_(dy,1):'',ms:f.monthStart,me:f.monthEnd},
cards:{fD:fD,fDP:fDP,fdPct:pctD_(fD,fDP),oD:oD,oDP:oDP,odPct:pctD_(oD,oDP),cD:Object.keys(dC).length,tkD:tkD,fA:fA,oA:oA,cA:Object.keys(mC).length,pM:pM,pT:mc.pctTempo,dv:dv,mRest:mRestD,mDB:mc.metaDia,mDN:mDN,duD:mc.duDecorridos,duT:mc.duTotal},
byInter:oSA_(bI).slice(0,8),topCl:tC,dicas:dicas,resumo:dv>=0?'O mês está em linha ou acima do ritmo.':'Atenção: mês abaixo do ritmo esperado.'}}

function buildCli_(cAll,cWin,ap){
  return{tot:ap.length,ct:ap.slice(0,CFG.LIMITS.CLIENTS_TOP),sum:{tot:ap.length,ac:acSum_(ap),tr:trSum_(cWin),nConv:ap.filter(function(x){return x.ac==='CONVERTER'}).length,nVisit:0,nResg:ap.filter(function(x){return x.ac==='RESGATAR'}).length,nCanc:ap.filter(function(x){return x.ac==='CANCELAR'}).length,nFid:ap.filter(function(x){return x.ac==='FIDELIZAR'}).length,nNovos:ap.filter(function(x){return x.isNovo}).length}}
}

function buildOp_(base,win){
function seg(wR,bMS){var bC={},bD={};for(var i=0;i<wR.length;i++){var r=wR[i];bD[r.ymd]=(bD[r.ymd]||0)+1;if(!bC[r.clienteKey])bC[r.clienteKey]={nome:r.nomeRemetente,v:0,q:0,fr:{},etq:false};bC[r.clienteKey].v+=r.valor;bC[r.clienteKey].q+=r.qtd;bC[r.clienteKey].fr[r.ymd]=1;if(r.hasEtq)bC[r.clienteKey].etq=true}
var cl=Object.keys(bC).filter(function(k){return!isInt_(k)}).map(function(k){return{nome:bC[k].nome,v:bC[k].v,q:bC[k].q,fr:Object.keys(bC[k].fr).length,etq:bC[k].etq}}).sort(function(a,b){return b.v-a.v});
var pot=cl.filter(function(c){return c.fr>=2&&!c.etq}).slice(0,30);
var fMM=bMS.length?bMS.reduce(function(s,x){return s+x.faturamento},0)/bMS.length:0;
var dk=Object.keys(bD),aMD=dk.length?dk.reduce(function(s,k){return s+bD[k]},0)/dk.length:0;
return{cards:{fMM:fMM,aMD:aMD,cli:cl.length,pot:pot.length},mS:bMS,topCl:cl.slice(0,25),pot:pot}}
function tBal(r){return r.tipoUp==='BALCAO'||r.tipoUp==='BALCÃO'||r.tipoUp==='APP'}
function tCon(r){return r.tipoUp==='CONTRATO'||r.tipoUp==='REVERSO'}
return{bal:seg(win.filter(tBal),mAgg_(base.filter(tBal)).slice(-6)),ctr:seg(win.filter(tCon),mAgg_(base.filter(tCon)).slice(-6))}}

function buildAcoes_(cWin,ap){
  var rank={ALTA:3,'MÉDIA':2,BAIXA:1};
  
  var opps=ap.filter(function(c){return c.ac!=='MANTER'&&c.ac!=='CANCELAR'}).map(function(c){return{nome:c.nome,tipo:c.ac,pr:c.pr,mt:c.mt,last:c.last,dsm:c.dsm,vRef:c.gp,tkG:c.tkG,isNovo:c.isNovo}}).sort(function(a,b){return(rank[b.pr]||0)!==(rank[a.pr]||0)?(rank[b.pr]||0)-(rank[a.pr]||0):b.vRef-a.vRef});
  var s=acSum_(ap);
  var nConv=ap.filter(function(x){return x.ac==='CONVERTER'}).length;
  var nResg=ap.filter(function(x){return x.ac==='RESGATAR'}).length;
  var nVisit=0; // compatibilidade de payload legado; VISITAR não é recomendação estratégica.
  var nCanc=ap.filter(function(x){return x.ac==='CANCELAR'}).length;
  var nFid=ap.filter(function(x){return x.ac==='FIDELIZAR'}).length;
  var blPct=0;var niWin=cWin.filter(function(x){return!x.isInt});
  if(niWin.length>0){var blC=niWin.filter(function(x){return x.bk==='BALCAO'}).length;blPct=(blC/niWin.length)*100}
  var foco=buildFoco_(ap,nConv,nResg,nVisit,nCanc,blPct,0);
  return{total:opps.length,rows:opps.slice(0,CFG.LIMITS.TOP_OPPS),sum:s,foco:foco,counts:{nConv:nConv,nResg:nResg,nVisit:nVisit,nCanc:nCanc,nFid:nFid}}
}

function buildMatrix_(base,months,lat){
var cM={},curYm=ym_(lat);
for(var i=0;i<base.length;i++){var r=base[i];if(isInt_(r.clienteKey))continue;if(!cM[r.clienteKey])cM[r.clienteKey]={nome:r.nomeRemetente,etq:'SEM',tQ:0,tV:0,ms:{},last:r.ymd,first:r.ymd};var c=cM[r.clienteKey];c.tQ+=r.qtd;c.tV+=r.valor;if(r.ymd>c.last)c.last=r.ymd;if(r.ymd<c.first)c.first=r.ymd;if(r.hasEtq)c.etq='COM';if(!c.ms[r.ym])c.ms[r.ym]={q:0,v:0};c.ms[r.ym].q+=r.qtd;c.ms[r.ym].v+=r.valor}
var sM=months.slice().sort(),rows=[];
Object.keys(cM).forEach(function(ck){var cl=cM[ck],md=[],pQ=0,mA=0,mS=0;
for(var m=0;m<sM.length;m++){var ym=sM[m],d=cl.ms[ym]||null,q=d?d.q:0,st='SEM_DADOS';
if(d){mA++;if(ym===curYm){st='ATUAL'}else if(pQ>0){var delta=((q-pQ)/pQ)*100;st=delta>=15?'ALTA':(delta<=-15?'QUEDA':'ESTAVEL')}else{st='ATIVO'}pQ=q}else if(ym<=curYm&&ym>=ym_(cl.first)){mS++;st='INATIVO'}
md.push({ym:ym,q:q,v:d?d.v:0,st:st})}
var dsm=diffD_(lat,cl.last),tk=cl.tQ>0?cl.tV/cl.tQ:0;
var ac='MANTER';
if(cl.etq==='SEM'&&cl.tQ<CFG.RULES.CONV_MIN_TOTAL&&dsm>60)ac='CANCELAR';
else if(dsm>60)ac='RESGATAR';
else if(cl.etq==='SEM'&&cl.tQ>=CFG.RULES.CONV_MIN_TOTAL)ac='CONVERTER';
else if(cl.etq==='COM'&&dsm>30&&mS>0)ac='FIDELIZAR';
else if(cl.etq==='COM'&&dsm<=30&&cl.tQ>20)ac='FIDELIZAR';
rows.push({nome:cl.nome,etq:cl.etq,tQ:cl.tQ,tV:cl.tV,tk:tk,last:cl.last,dsm:dsm,mA:mA,mS:mS,ac:ac,md:md})});
rows.sort(function(a,b){return b.tQ-a.tQ});
var st={conv:0,visit:0,resg:0,canc:0,fid:0,manter:0};
for(var s=0;s<rows.length;s++){var a=normAcDash_(rows[s].ac);if(a==='CONVERTER')st.conv++;else if(a==='RESGATAR')st.resg++;else if(a==='CANCELAR')st.canc++;else if(a==='FIDELIZAR')st.fid++;else st.manter++}
return{ms:sM,rows:rows.slice(0,CFG.LIMITS.MATRIX),totCli:rows.length,st:st}}


/**
 * readMasterDash_ — lê CLIENTES_MASTER para o dashboard.
 * v10.2: agora inclui INTERMEDIADOR_PREDOMINANTE.
 * v10.3: agora inclui DATA_PRIMEIRA_VALIDA_NAO_REVERSO (string yyyy-MM-dd ou '')
 *        para que getDash_ recalcule NOVO com regra de janela de 2 meses.
 */
function readMasterDash_(){
  var metaStamp=''; try{metaStamp=PropertiesService.getScriptProperties().getProperty('op_master_built_at')||'';}catch(e){} var key='master_dash_v7_'+hashKey_(metaStamp),cc=gcj_(key); if(cc) return cc;
  var ss=getSsMov_(), sh=ss.getSheetByName(CFG.SHEETS.MASTER);
  if(!sh||sh.getLastRow()<2) return [];
  var v=sh.getDataRange().getValues(), h=bhm_(v[0]), out=[];
  for(var i=1;i<v.length;i++){
    var r=v[i], nome=ct_(cl_(r,h,['CLIENTE','NOME_REMETENTE_BASE'])); if(!nome) continue;
    var acDash=normAcDash_(ct_(cl_(r,h,['ACAO','ACAO_ENGINE'])));
    var prDash=normPrDash_(ct_(cl_(r,h,['PRIORIDADE_FILA']))||'BAIXA');
    out.push({
      nome:nome, ck:bck_(nome), local:ct_(cl_(r,h,['LOCAL_PREDOMINANTE'])), ac:acDash, subAc:ct_(cl_(r,h,['SUB_ACAO'])),
      pr:prDash, sc:ns_(cl_(r,h,['SCORE_PRIORIDADE'])), perfil:ct_(cl_(r,h,['PERFIL_COMERCIAL'])),
      canal:ct_(cl_(r,h,['CANAL_SUGERIDO'])), conteudo:ct_(cl_(r,h,['CONTEUDO_SUGERIDO'])), motivo:ct_(cl_(r,h,['MOTIVO_REGRA'])),
      curva:ct_(cl_(r,h,['CURVA'])), etq:ct_(cl_(r,h,['TEM_CONTRATO']))==='SIM', isNovo:ct_(cl_(r,h,['NOVO_CLIENTE']))==='SIM',
      st:ct_(cl_(r,h,['STATUS_ATIVIDADE'])), last:pds_(cl_(r,h,['DATA_ULTIMA_POSTAGEM'])), dsm:ns_(cl_(r,h,['DIAS_SEM_POSTAR'])), tkG:ns_(cl_(r,h,['TICKET_30D'])),
      tQ:ns_(cl_(r,h,['QTD_TOTAL'])), f30:ns_(cl_(r,h,['FAT_30D'])), fdPct:ns_(cl_(r,h,['FD_PCT'])), qdPct:ns_(cl_(r,h,['QD_PCT'])),
      ddPct:ns_(cl_(r,h,['DD_PCT'])), tV:ns_(cl_(r,h,['VALOR_TOTAL'])), share:ns_(cl_(r,h,['SHARE_LOCAL_30D'])),
      porte:ct_(cl_(r,h,['PORTE_OPERACIONAL'])), alerta:ct_(cl_(r,h,['NIVEL_ALERTA'])), recNivel:ct_(cl_(r,h,['RECORRENCIA_NIVEL'])),
      intermediador:ct_(cl_(r,h,['INTERMEDIADOR_PREDOMINANTE'])),
      /* v10.3: data bruta para recálculo de NOVO no dashboard */
      primYm:pds_(cl_(r,h,['DATA_PRIMEIRA_VALIDA_NAO_REVERSO']))
    });
  }
  pcj_(key,out,CFG.CACHE.DASH_SEC); return out;
}
function fltMaster_(rows,f){
  return rows.filter(function(r){
    if(f.units && f.units.length && f.units.indexOf(r.local)<0) return false;
    if(f.q && r.ck.indexOf(bck_(f.q))<0) return false;
    return true;
  });
}

/**
 * buildCliFromMaster_ — v10.2
 * Aceita winByCk opcional ({ck: {fW, qW}}) para injetar faturamento/qtd
 * do período filtrado em cada cliente. Se não fornecido, fW/qW ficam 0
 * (compatibilidade 100% com chamadas antigas).
 */
function buildCliFromMaster_(rows, winByCk){
  winByCk = winByCk || {};
  var enriched = rows.map(function(r){
    var w = winByCk[r.ck] || null;
    // Retorna uma CÓPIA rasa com fW/qW injetados, sem mutar a entrada original.
    var out = {};
    for(var k in r) if(Object.prototype.hasOwnProperty.call(r,k)) out[k]=r[k];
    out.fW = w ? (w.fW || 0) : 0;
    out.qW = w ? (w.qW || 0) : 0;
    out.tkP = out.qW > 0 ? out.fW / out.qW : 0;
    out.ac = normAcDash_(out.ac);
    out.pr = normPrDash_(out.pr);
    return out;
  });
  var rank={CRITICA:4,ALTA:3,MEDIA:2,BAIXA:1};
  var ct=enriched.slice().sort(function(a,b){return (rank[b.pr]||0)!==(rank[a.pr]||0)?(rank[b.pr]||0)-(rank[a.pr]||0):(b.sc-a.sc)||(b.share-a.share)||(b.fW-a.fW)||(b.f30-a.f30)||(a.dsm-b.dsm)});
  return {tot:ct.length,ct:ct.slice(0,CFG.LIMITS.CLIENTS_TOP),sum:{tot:ct.length,ac:acSum_(ct),nConv:ct.filter(function(x){return x.ac==='CONVERTER'}).length,nVisit:0,nResg:ct.filter(function(x){return x.ac==='RESGATAR'}).length,nCanc:ct.filter(function(x){return x.ac==='CANCELAR'}).length,nFid:ct.filter(function(x){return x.ac==='FIDELIZAR'}).length,nNovos:ct.filter(function(x){return x.isNovo}).length}};
}
function buildAcoesFromMaster_(rows){
  var rank={CRITICA:4,ALTA:3,MEDIA:2,BAIXA:1};
  var normRows=rows.map(function(c){var o={}; for(var k in c) if(Object.prototype.hasOwnProperty.call(c,k)) o[k]=c[k]; o.ac=normAcDash_(o.ac); o.pr=normPrDash_(o.pr); return o;});
  var opps=normRows.filter(function(c){return c.ac!=='MANTER'&&c.ac!=='CANCELAR'}).map(function(c){
    var vPeriodo=(c.fW!=null)?c.fW:0;
    var qPeriodo=(c.qW!=null)?c.qW:0;
    var tkPeriodo=qPeriodo>0?vPeriodo/qPeriodo:0;
    return {nome:c.nome,tipo:c.ac,subAc:c.subAc,pr:c.pr,mt:c.motivo,canal:c.canal,perfil:c.perfil,porte:c.porte,alerta:c.alerta,last:c.last,dsm:c.dsm,vRef:vPeriodo||c.f30||c.tV,tkG:tkPeriodo||c.tkG,isNovo:c.isNovo,share:c.share};
  }).sort(function(a,b){return (rank[b.pr]||0)!==(rank[a.pr]||0)?(rank[b.pr]||0)-(rank[a.pr]||0):(b.vRef-a.vRef)});
  var s=acSum_(normRows);
  var nConv=normRows.filter(function(x){return x.ac==='CONVERTER'}).length;
  var nResg=normRows.filter(function(x){return x.ac==='RESGATAR'}).length;
  var nCanc=normRows.filter(function(x){return x.ac==='CANCELAR'}).length;
  var nFid=normRows.filter(function(x){return x.ac==='FIDELIZAR'}).length;
  return {total:opps.length,rows:opps.slice(0,CFG.LIMITS.TOP_OPPS),sum:s,foco:buildFoco_(normRows,nConv,nResg,0,nCanc,0,0),counts:{nConv:nConv,nResg:nResg,nVisit:0,nCanc:nCanc,nFid:nFid}};
}
function buildMatrixFromMaster_(base,months,lat,masterMap){
  var cM={},curYm=ym_(lat);
  for(var i=0;i<base.length;i++){var r=base[i];if(isInt_(r.clienteKey))continue;if(!cM[r.clienteKey])cM[r.clienteKey]={nome:r.nomeRemetente,etq:'SEM',tQ:0,tV:0,ms:{},last:r.ymd,first:r.ymd};var c=cM[r.clienteKey];c.tQ+=r.qtd;c.tV+=r.valor;if(r.ymd>c.last)c.last=r.ymd;if(r.ymd<c.first)c.first=r.ymd;if(r.hasEtq)c.etq='COM';if(!c.ms[r.ym])c.ms[r.ym]={q:0,v:0};c.ms[r.ym].q+=r.qtd;c.ms[r.ym].v+=r.valor}
  var sM=months.slice().sort(),rows=[];
  Object.keys(cM).forEach(function(ck){var cl=cM[ck], md=[], pQ=0, mA=0, mS=0; for(var m=0;m<sM.length;m++){var ym=sM[m],d=cl.ms[ym]||null,q=d?d.q:0,st='SEM_DADOS'; if(d){mA++; if(ym===curYm){st='ATUAL'} else if(pQ>0){var delta=((q-pQ)/pQ)*100; st=delta>=15?'ALTA':(delta<=-15?'QUEDA':'ESTAVEL')} else {st='ATIVO'} pQ=q}else if(ym<=curYm&&ym>=ym_(cl.first)){mS++;st='INATIVO'} md.push({ym:ym,q:q,v:d?d.v:0,st:st})} var dsm=diffD_(lat,cl.last), tk=cl.tQ>0?cl.tV/cl.tQ:0; var master=masterMap[ck]||null; var ac=master?normAcDash_(master.ac):(cl.etq==='COM'?'MANTER':'CONVERTER'); rows.push({nome:cl.nome,etq:cl.etq,tQ:cl.tQ,tV:cl.tV,tk:tk,last:cl.last,dsm:dsm,mA:mA,mS:mS,ac:ac,md:md,isNovo:master?!!master.isNovo:false,pr:master?normPrDash_(master.pr):'BAIXA',local:master?master.local:'',curva:master?master.curva:''})});
  rows.sort(function(a,b){return b.tQ-a.tQ}); var st={conv:0,visit:0,resg:0,canc:0,fid:0,manter:0}; for(var s=0;s<rows.length;s++){var a=normAcDash_(rows[s].ac);if(a==='CONVERTER')st.conv++;else if(a==='RESGATAR')st.resg++;else if(a==='CANCELAR')st.canc++;else if(a==='FIDELIZAR')st.fid++;else st.manter++} return{ms:sM,rows:rows.slice(0,CFG.LIMITS.MATRIX),totCli:rows.length,st:st};
}


function filterClientActionMaster_(rows,f,winByCk){
  var deep=!!((f.types&&f.types.length)||(f.inters&&f.inters.length)||(f.segs&&f.segs.length));
  if(!deep) return rows;
  return rows.filter(function(r){return !!winByCk[r.ck];});
}

/* === PAYLOAD === */

function getDash_(p){
  var unitKey=csvS_(p.units||p.unit||'');
  // v10.4: chave hasheada para evitar "Argumento grande demais: key".
  // CacheService do Apps Script tem limite de 250 chars por key.
  var rawKey='d10v10::'+ct_(p.periodMode||'')+'|'+ct_(p.monthYm||'')+'|'+ct_(p.startDate||'')+'|'+ct_(p.endDate||'')+'|'+unitKey+'|'+ct_(p.type||'')+'|'+ct_(p.inter||'')+'|'+ct_(p.seg||'')+'|'+ct_(p.q||'')+'|'+ct_(p.day||'');
  var ck='d10v10_'+hashKey_(rawKey);
  var cc=gcj_(ck);if(cc)return cc;
  try{ if(typeof op_ensureMasterFresh_==='function') op_ensureMasterFresh_({allowStale:true}); }catch(e){}
  var b=getBundle_(),f=normF_(p,b.latest);
  var base=fltND_(b.rows,f),win=fltW_(b.rows,f);
  var cAll=buildCM_(base,win,f.endDate,f.monthYm,ym_(b.latest));
  var cWin=cAll.filter(function(c){return c.temW});

  // v10.2: lookup ck → faturamento/qtd do período filtrado (cWin).
  var winByCk={};
  for(var iW=0;iW<cWin.length;iW++){winByCk[cWin[iW].ck]={fW:cWin[iW].fW,qW:cWin[iW].qW}}

  var masterRows=filterClientActionMaster_(fltMaster_(readMasterDash_(),f), f, winByCk);
  /* v10.5: recalcula NOVO somente no mês corrente da base.
     Mesmo com filtro em todo o período, NOVO = primeira postagem NÃO-REVERSO
     aconteceu no mês corrente. No mês seguinte, deixa de ser NOVO. */
  var latestYm=ym_(b.latest);
  for(var iN=0;iN<masterRows.length;iN++){
    var mr=masterRows[iN];
    var py=mr.primYm?ym_(mr.primYm):'';
    mr.isNovo=!!(py && py===latestYm);
  }
  var masterMap={}; for(var i=0;i<masterRows.length;i++) masterMap[masterRows[i].ck]=masterRows[i];
  var cli=buildCliFromMaster_(masterRows, winByCk);
  var acoes=buildAcoesFromMaster_(masterRows);
  var pl={ok:true,fl:{minStart:b.minStart,latest:b.latest,defYm:ym_(b.latest),months:b.months,units:b.units,types:b.types,inters:b.intermediadores,segs:b.segmentos},
  ctx:{periodMode:ct_(p.periodMode||'')||'month',monthYm:f.monthYm,ms:f.monthStart,me:f.monthEnd,sd:f.startDate,ed:f.endDate,day:f.day,unit:f.unit,units:f.units,type:f.type,inter:f.inter,seg:f.seg,q:f.q},
  ov:buildOv_(base,win,cAll,cWin,b.metaMap,f,b.latest,masterRows),
  dy:buildDaily_(base,b.metaMap,f,b.latest,cli.sum.nConv,cli.sum.nResg,cli.sum.nNovos),
  cli:cli,op:buildOp_(base,win),acoes:acoes,
  mx:buildMatrixFromMaster_(base,b.months,b.latest,masterMap)};
  pcj_(ck,pl,CFG.CACHE.DASH_SEC);return pl;
}



function getDashSummary_(p){
  var unitKey=csvS_(p.units||p.unit||'');
  var rawKey='ds10v8::'+ct_(p.periodMode||'')+'|'+ct_(p.monthYm||'')+'|'+ct_(p.startDate||'')+'|'+ct_(p.endDate||'')+'|'+unitKey+'|'+ct_(p.type||'')+'|'+ct_(p.inter||'')+'|'+ct_(p.seg||'')+'|'+ct_(p.q||'')+'|'+ct_(p.day||'');
  var ck='ds10v8_'+hashKey_(rawKey);
  var cc=gcj_(ck);if(cc)return cc;
  var pl=getDash_(p);
  var out={ok:true,fl:pl.fl,ctx:pl.ctx,ov:{cards:pl.ov.cards,mc:pl.ov.mc,insights:pl.ov.insights},dy:{cards:pl.dy.cards,resumo:pl.dy.resumo},acoes:{sum:pl.acoes.sum,counts:pl.acoes.counts,foco:pl.acoes.foco}};
  pcj_(ck,out,CFG.CACHE.DASH_SEC);return out;
}

function getFilters_(){var key='filters_v10_3',cc=gcj_(key);if(cc)return cc;var b=getBundle_();var out={ok:true,fl:{minStart:b.minStart,latest:b.latest,defYm:ym_(b.latest),months:b.months,units:b.units,types:b.types,inters:b.intermediadores,segs:b.segmentos}};pcj_(key,out,CFG.CACHE.FILTERS_SEC);return out}
function getHealth_(){var b=getBundle_();return{ok:true,rows:b.rows.length,metas:b.metas.length,latest:b.latest}}