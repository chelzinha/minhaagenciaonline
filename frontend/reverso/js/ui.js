const loadingEl=()=>document.getElementById('loading');
const loadingTextEl=()=>document.getElementById('loadingText');
const toastEl=()=>document.getElementById('toast');
export const UI = {
  showLoading(text='Processando...'){ const el=loadingEl(); if(!el) return; loadingTextEl().textContent=text; el.classList.add('show'); el.setAttribute('aria-hidden','false'); },
  hideLoading(){ const el=loadingEl(); if(!el) return; el.classList.remove('show'); el.setAttribute('aria-hidden','true'); },
  toast(message,type='info'){ const el=toastEl(); if(!el) return; el.textContent=message; el.className='toast show'; el.style.background= type==='error' ? '#B91C1C' : type==='success' ? '#15803D' : '#1F2937'; clearTimeout(UI._toastTimer); UI._toastTimer=setTimeout(()=>el.classList.remove('show'),3200); },
  markReady(){ document.body.classList.remove('app-booting'); document.body.classList.add('app-ready'); },
  datetime(v){ if(!v) return '-'; const d=new Date(v); return isNaN(d.getTime()) ? String(v) : d.toLocaleString('pt-BR'); },
  qs(sel,root=document){ return root.querySelector(sel); },
  qsa(sel,root=document){ return Array.from(root.querySelectorAll(sel)); }
};
