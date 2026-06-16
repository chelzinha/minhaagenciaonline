import { APP_CONFIG } from '../js/config.js';
async function request(action,payload={}){
  if(!APP_CONFIG.API_BASE_URL) throw new Error('URL da API não configurada.');
  const authToken=window.AgfAuth?.getToken?.()||'';
  const controller=new AbortController(); const timer=setTimeout(()=>controller.abort(),APP_CONFIG.API_TIMEOUT_MS||60000);
  try{
    const response=await fetch(APP_CONFIG.API_BASE_URL,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({action,auth_token:authToken,...payload}),redirect:'follow',signal:controller.signal});
    const raw=await response.text(); let data; try{data=JSON.parse(raw);}catch(_){throw new Error('Resposta inválida do servidor.');}
    if(!response.ok||data?.ok===false) throw new Error(data?.error?.message||data?.message||'Erro ao processar requisição.'); return data.data;
  }catch(err){if(err?.name==='AbortError')throw new Error('A solicitação demorou mais do que o esperado. Tente novamente.');throw err;}finally{clearTimeout(timer);}
}
export const Api={
  getCollectorHome(payload={}){return request('getCollectorHome',payload);},
  getCollectorHistory(payload={}){return request('getCollectorHistory',payload);},
  getColetaDetail(coleta_id){return request('getColetaDetail',{coleta_id});},
  startColetaExecution(payload){return request('startColetaExecution',payload);},
  scanEtiquetaColeta(payload){return request('scanEtiquetaColeta',payload);},
  getColetaSummary(coleta_id){return request('getColetaSummary',{coleta_id});},
  closeColeta(payload){return request('closeColeta',payload);},
  registerCollectorDivergence(payload){return request('registerCollectorDivergence',payload);}
};
