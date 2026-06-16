import { Store } from '../../state/store.js';
import { Router } from '../router.js';
import { Api } from '../../services/api.js';
import { UI } from '../ui.js';

let etiquetaScanner = null;

function parseEtiquetaFromQr(rawValue) {
  const raw = String(rawValue || '').trim();
  if (!raw) return '';
  try {
    const url = new URL(raw, location.origin);
    return url.searchParams.get('etiqueta') || url.searchParams.get('codigo_etiqueta') || url.searchParams.get('codigo') || raw;
  } catch (_) {
    const match = raw.match(/[?&](?:etiqueta|codigo_etiqueta|codigo)=([^&#]+)/i);
    return match ? decodeURIComponent(match[1]) : raw;
  }
}

function stopEtiquetaScanner() {
  if (!etiquetaScanner) return;
  if (etiquetaScanner.timer) cancelAnimationFrame(etiquetaScanner.timer);
  etiquetaScanner.stream?.getTracks?.().forEach((track) => track.stop());
  etiquetaScanner = null;
}

function closeEtiquetaScanner() {
  stopEtiquetaScanner();
  document.getElementById('etiquetaScannerModal')?.remove();
}

function submitEtiquetaCode(codigo) {
  const value = parseEtiquetaFromQr(codigo);
  if (!value) return;
  const form = document.getElementById('etiquetaManualForm');
  const input = document.getElementById('manualEtiquetaInput');
  form?.classList.remove('hidden');
  if (input) input.value = value;
  closeEtiquetaScanner();
  setTimeout(() => form?.requestSubmit(), 100);
}

function renderEtiquetaScannerModal() {
  document.getElementById('etiquetaScannerModal')?.remove();
  document.body.insertAdjacentHTML('beforeend', `
    <div class="scan-modal-backdrop" id="etiquetaScannerModal">
      <section class="scan-modal-card" role="dialog" aria-modal="true" aria-labelledby="etiquetaScannerTitle">
        <header class="scan-modal-head">
          <div>
            <h2 id="etiquetaScannerTitle">Ler etiqueta</h2>
            <p>Centralize o QR Code inteiro dentro da área marcada.</p>
          </div>
          <button class="scan-close-btn" type="button" data-scan-close aria-label="Fechar"><span class="material-symbols-rounded">close</span></button>
        </header>
        <div class="scan-camera-box">
          <video id="etiquetaScannerVideo" playsinline muted></video>
          <div class="scan-corners" aria-hidden="true"></div>
          <div class="scan-line" aria-hidden="true"></div>
        </div>
        <p class="scan-status" id="etiquetaScannerStatus">Solicitando acesso à câmera...</p>
        <div class="scan-manual-panel">
          <label class="field"><span class="field-label">Código manual da etiqueta</span><input class="input" id="scanManualInput" placeholder="Ex.: EDM-000001"></label>
          <button class="btn btn-primary btn-block" type="button" id="scanManualSubmit"><span class="material-symbols-rounded">check_circle</span>Validar código</button>
        </div>
      </section>
    </div>`);
  document.querySelectorAll('[data-scan-close]').forEach((btn) => btn.addEventListener('click', closeEtiquetaScanner));
  document.getElementById('etiquetaScannerModal')?.addEventListener('click', (event) => {
    if (event.target.id === 'etiquetaScannerModal') closeEtiquetaScanner();
  });
  document.getElementById('scanManualSubmit')?.addEventListener('click', () => submitEtiquetaCode(document.getElementById('scanManualInput')?.value));
}

const JSQR_CDN = 'https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.min.js';
let jsQrLoadPromise = null;

function loadJsQr() {
  if (window.jsQR) return Promise.resolve(window.jsQR);
  if (jsQrLoadPromise) return jsQrLoadPromise;
  jsQrLoadPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = JSQR_CDN;
    script.async = true;
    script.onload = () => window.jsQR ? resolve(window.jsQR) : reject(new Error('Leitor QR não carregado.'));
    script.onerror = () => reject(new Error('Não foi possível carregar o leitor QR.'));
    document.head.appendChild(script);
  });
  return jsQrLoadPromise;
}

function setScannerStatus(message) {
  const status = document.getElementById('etiquetaScannerStatus');
  if (status) status.innerHTML = message;
}

async function applyCameraFocus(stream) {
  const track = stream.getVideoTracks?.()[0];
  if (!track?.getCapabilities || !track?.applyConstraints) return;
  try {
    const caps = track.getCapabilities() || {};
    const advanced = [];
    if (caps.focusMode?.includes?.('continuous')) advanced.push({ focusMode: 'continuous' });
    if (caps.exposureMode?.includes?.('continuous')) advanced.push({ exposureMode: 'continuous' });
    if (advanced.length) await track.applyConstraints({ advanced });
  } catch (_) { /* alguns navegadores não aceitam foco/exposição por script */ }
}

function detectQrWithJsQr(video, canvas, ctx) {
  if (!window.jsQR || !video?.videoWidth || !video?.videoHeight) return '';
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  const maxSide = 960;
  const scale = Math.min(maxSide / vw, maxSide / vh, 1);
  const cw = Math.max(1, Math.round(vw * scale));
  const ch = Math.max(1, Math.round(vh * scale));
  if (canvas.width !== cw) canvas.width = cw;
  if (canvas.height !== ch) canvas.height = ch;
  ctx.drawImage(video, 0, 0, cw, ch);
  const imageData = ctx.getImageData(0, 0, cw, ch);
  const result = window.jsQR(imageData.data, cw, ch, { inversionAttempts: 'attemptBoth' });
  return result?.data || '';
}

async function openEtiquetaScanner() {
  renderEtiquetaScannerModal();
  const video = document.getElementById('etiquetaScannerVideo');

  if (!window.isSecureContext) {
    setScannerStatus('A câmera só funciona em ambiente seguro HTTPS.<br>Digite o código manual impresso na etiqueta.');
    document.getElementById('scanManualInput')?.focus();
    return;
  }

  if (!navigator.mediaDevices?.getUserMedia) {
    setScannerStatus('Este navegador não permite abrir a câmera.<br>Digite o código manual impresso na etiqueta.');
    document.getElementById('scanManualInput')?.focus();
    return;
  }

  try {
    setScannerStatus('Solicitando acesso à câmera...');
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: 'environment' },
        width: { ideal: 1920, min: 640 },
        height: { ideal: 1080, min: 480 },
        frameRate: { ideal: 30, max: 30 }
      },
      audio: false
    });

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    let nativeDetector = null;
    try {
      nativeDetector = 'BarcodeDetector' in window ? new BarcodeDetector({ formats: ['qr_code'] }) : null;
    } catch (_) { nativeDetector = null; }

    etiquetaScanner = {
      stream,
      timer: null,
      busy: false,
      canvas,
      ctx,
      nativeDetector,
      lastJsQrTry: 0,
      startedAt: Date.now()
    };

    video.srcObject = stream;
    await applyCameraFocus(stream);
    await video.play();

    setScannerStatus('Câmera ativa. Aproxime a etiqueta e mantenha o QR Code inteiro visível dentro da área marcada.');

    loadJsQr()
      .then(() => {
        if (etiquetaScanner?.stream) setScannerStatus('Câmera ativa. Centralize o QR Code inteiro e mantenha a etiqueta parada por alguns segundos.');
      })
      .catch(() => {
        if (!nativeDetector && etiquetaScanner?.stream) setScannerStatus('A câmera abriu, mas este navegador não carregou o leitor automático.<br>Digite o código manual impresso na etiqueta.');
      });

    const loop = async (ts = 0) => {
      if (!etiquetaScanner?.stream) return;
      try {
        if (!etiquetaScanner.busy && video.readyState >= 2) {
          etiquetaScanner.busy = true;
          let rawValue = '';

          if (etiquetaScanner.nativeDetector) {
            try {
              const codes = await etiquetaScanner.nativeDetector.detect(video);
              rawValue = codes?.[0]?.rawValue || '';
            } catch (_) { /* mantém fallback por canvas */ }
          }

          if (!rawValue && window.jsQR && ts - etiquetaScanner.lastJsQrTry > 140) {
            etiquetaScanner.lastJsQrTry = ts;
            rawValue = detectQrWithJsQr(video, etiquetaScanner.canvas, etiquetaScanner.ctx);
          }

          if (rawValue) {
            setScannerStatus('Etiqueta lida. Validando...');
            submitEtiquetaCode(rawValue);
            return;
          }

          if (Date.now() - etiquetaScanner.startedAt > 5000) {
            setScannerStatus('Ainda não consegui ler. Afaste um pouco o celular, deixe o QR inteiro visível e evite reflexos. Você também pode digitar o código manual.');
          }
        }
      } finally {
        if (etiquetaScanner) etiquetaScanner.busy = false;
      }
      if (etiquetaScanner?.stream) etiquetaScanner.timer = requestAnimationFrame(loop);
    };
    etiquetaScanner.timer = requestAnimationFrame(loop);
  } catch (err) {
    const msg = err?.name === 'NotAllowedError'
      ? 'A câmera não foi autorizada. Permita o acesso ou use a digitação manual.'
      : 'Não foi possível abrir a câmera. Digite o código manual impresso na etiqueta.';
    setScannerStatus(msg);
    document.getElementById('scanManualInput')?.focus();
  }
}

export function mount(){
  const state=Store.getState(); if(!state.unit || !state.user) return Router.go('/auth');

  const pending = sessionStorage.getItem('reverso_pending_etiqueta');
  if (pending) {
    const input = document.getElementById('manualEtiquetaInput');
    document.getElementById('etiquetaManualForm')?.classList.remove('hidden');
    if (input) input.value = pending;
    setTimeout(() => document.getElementById('etiquetaManualForm')?.requestSubmit(), 250);
  }

  document.getElementById('btnScanEtiqueta')?.addEventListener('click', openEtiquetaScanner);
  document.getElementById('btnManualEtiqueta')?.addEventListener('click',()=>{ document.getElementById('etiquetaManualForm')?.classList.remove('hidden'); document.getElementById('manualEtiquetaInput')?.focus(); });
  document.getElementById('etiquetaManualForm')?.addEventListener('submit', async e=>{
    e.preventDefault(); const codigo=document.getElementById('manualEtiquetaInput').value.trim(); if(!codigo) return UI.toast('Digite o código da etiqueta.','error');
    try{ UI.showLoading('Validando a etiqueta...'); const data=await Api.readEtiqueta({usuario_id:state.user.usuario_id,codigo_etiqueta:codigo}); Store.setEtiqueta(data.etiqueta); sessionStorage.removeItem('reverso_pending_etiqueta'); const res=document.getElementById('etiquetaResult'); res.classList.remove('hidden'); res.innerHTML=`<div class="result-card stack-sm"><div><strong>Etiqueta reconhecida</strong></div><div class="history-meta">${data.etiqueta.codigo_etiqueta}</div><button class="btn btn-primary btn-block" id="btnUseEtiqueta">Continuar com esta etiqueta</button></div>`; document.getElementById('btnUseEtiqueta')?.addEventListener('click',()=>Router.go('/form-reversa')); }
    catch(err){ UI.toast(err.message || 'Não foi possível validar a etiqueta. Confira o código e tente novamente.','error'); }
    finally{ UI.hideLoading(); }
  });
}

