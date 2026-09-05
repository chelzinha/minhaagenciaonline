let deferredInstallPrompt=null;
const installButton=document.getElementById('installButton');
const installModal=document.getElementById('installModal');
const installSteps=document.getElementById('installSteps');
const closeInstallModal=document.getElementById('closeInstallModal');
const toast=document.getElementById('toast');
function showToast(message){toast.textContent=message;toast.classList.add('show');window.setTimeout(()=>toast.classList.remove('show'),2800)}
function openInstallInstructions(){const ua=navigator.userAgent||'';const isIOS=/iPhone|iPad|iPod/i.test(ua);const isAndroid=/Android/i.test(ua);const steps=isIOS?['Abra esta página no Safari.','Toque no botão Compartilhar.','Role as opções e escolha Adicionar à Tela de Início.','Confirme em Adicionar.']:isAndroid?['Abra o menu do navegador.','Escolha Adicionar à tela inicial ou Instalar aplicativo.','Confirme a instalação.']:['Abra o menu do navegador.','Procure a opção Instalar aplicativo ou Adicionar à tela inicial.','Confirme a instalação.'];installSteps.innerHTML=steps.map(step=>`<li>${step}</li>`).join('');installModal.classList.add('open')}
window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();deferredInstallPrompt=event});
window.addEventListener('appinstalled',()=>{deferredInstallPrompt=null;showToast('Página adicionada à tela inicial.')});
installButton.addEventListener('click',async()=>{if(deferredInstallPrompt){deferredInstallPrompt.prompt();await deferredInstallPrompt.userChoice;deferredInstallPrompt=null;return}openInstallInstructions()});
closeInstallModal.addEventListener('click',()=>installModal.classList.remove('open'));
installModal.addEventListener('click',event=>{if(event.target===installModal)installModal.classList.remove('open')});
if('serviceWorker'in navigator){window.addEventListener('load',()=>navigator.serviceWorker.register('/service-worker.js').catch(()=>{}))}
