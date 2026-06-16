import { Api } from '../../services/api.js';
import { UI } from '../ui.js';
export function mount(){
  const unidadeId=document.getElementById('coletorUnidadeId');
  const coletaId=document.getElementById('coletorColetaId');
  const coletadorId=document.getElementById('coletorId');
  const etiquetaCode=document.getElementById('coletorEtiquetaCode');
  const resultBox=document.getElementById('coletorResult');
  document.getElementById('btnOpenColetaManual')?.addEventListener('click', async()=>{ try{ UI.showLoading('Abrindo coleta...'); const data=await Api.openColeta({unidade_id:unidadeId.value.trim(), coletador_id:coletadorId.value.trim() || 'COLAB-01'}); coletaId.value=data.coleta_id; resultBox.innerHTML=`<div class="result-card"><strong>Coleta aberta:</strong> ${data.coleta_id}</div>`; } catch(err){ UI.toast(err.message || 'Falha ao abrir coleta.','error'); } finally{ UI.hideLoading(); } });
  document.getElementById('btnScanEtiquetaManual')?.addEventListener('click', async()=>{ try{ UI.showLoading('Lendo etiqueta...'); const data=await Api.scanEtiquetaColeta({coleta_id:coletaId.value.trim(), codigo_etiqueta:etiquetaCode.value.trim(), coletador_id:coletadorId.value.trim() || 'COLAB-01'}); resultBox.innerHTML=`<div class="result-card"><strong>Etiqueta lida com sucesso.</strong><br>Reversa: ${data.reversa_id}</div>`; } catch(err){ UI.toast(err.message || 'Falha ao ler a etiqueta.','error'); } finally{ UI.hideLoading(); } });
  document.getElementById('btnCloseColetaManual')?.addEventListener('click', async()=>{ try{ UI.showLoading('Fechando coleta...'); const data=await Api.closeColeta({coleta_id:coletaId.value.trim(), coletador_id:coletadorId.value.trim() || 'COLAB-01'}); resultBox.innerHTML=`<div class="result-card"><strong>Coleta encerrada:</strong> ${data.status_coleta}</div>`; } catch(err){ UI.toast(err.message || 'Falha ao fechar coleta.','error'); } finally{ UI.hideLoading(); } });
}
