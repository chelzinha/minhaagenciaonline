(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const state = { customers: [], pending: [], selected: null, customerPage: 0, reviewOffset: 0, resolving: null, customerRequest: 0, reviewRequest: 0 };
  const customerPageSize = 50;
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const debounce = (fn, ms = 250) => { let timer; return () => { clearTimeout(timer); timer = setTimeout(fn, ms); }; };
  function notice(message, error = false) { const el=$('notice'); el.textContent=message; el.classList.toggle('error', error); el.hidden=false; }
  async function api(path, options = {}) {
    const token = window.AgfAuth?.getToken();
    if (!token) throw new Error('Sua sessão expirou. Entre novamente.');
    const response = await fetch(window.AGF_CADASTROS_CONFIG.apiUrl + path, {
      ...options, headers: { Authorization: `Bearer ${token}`, ...(options.body ? {'Content-Type':'application/json'} : {}) }
    });
    const data = await response.json();
    if (!response.ok || data.ok === false) throw new Error(data.error || 'Não foi possível completar a operação.');
    return data;
  }
  const send = (path, data, method='POST') => api(path, { method, body: JSON.stringify(data) });
  async function assignAlias(kind, originalName, customerId) {
    const current = (await api(`/api/aliases/lookup?kind=${encodeURIComponent(kind)}&name=${encodeURIComponent(originalName)}`)).alias;
    if (current?.customer_id === customerId) return;
    if (current && !window.confirm(`Este nome está associado a ${current.canonical_name}. Transferir todas as postagens correspondentes para o cliente selecionado?`)) return false;
    await send('/api/aliases',{kind,originalName,customerId,expectedCustomerId:current?.customer_id});
    return true;
  }
  async function task(fn, button) {
    if (button) button.disabled = true;
    try { await fn(); } catch (err) { notice(err.message, true); }
    finally { if (button) button.disabled = false; }
  }
  async function refreshStatus() {
    const data = await api('/api/status');
    $('total').textContent = Number(data.postings?.total || 0).toLocaleString('pt-BR');
    $('customersTotal').textContent = Number(data.customers?.total || 0).toLocaleString('pt-BR');
    $('provisionalTotal').textContent = Number(data.customers?.provisional || 0).toLocaleString('pt-BR');
    $('pendingNames').textContent = Number(data.postings?.pending_names || 0).toLocaleString('pt-BR');
    $('pending').textContent = Number(data.postings?.pending || 0).toLocaleString('pt-BR');
    $('passes').textContent = Number(data.sync?.completed_passes || 0).toLocaleString('pt-BR');
    $('updated').textContent = data.sync?.updated_at || '—';
    const cursor = Number(data.sync?.cursor_id || 0);
    $('syncProgress').textContent = Number(data.sync?.completed_passes || 0) === 0
      ? `Primeira importação em andamento. Último registro de origem processado: ${cursor.toLocaleString('pt-BR')}. Os cadastros aparecem à medida que as postagens são importadas.`
      : `Base em atualização periódica. Último registro de origem processado nesta varredura: ${cursor.toLocaleString('pt-BR')}.`;
  }
  async function loadCustomers(reset = false) {
    if (reset) state.customerPage = 0;
    const request = ++state.customerRequest;
    const offset = state.customerPage * customerPageSize;
    const q = encodeURIComponent($('customerSearch').value.trim());
    const data = await api(`/api/customers?q=${q}&limit=${customerPageSize}&offset=${offset}`);
    if (request !== state.customerRequest) return;
    const total = Number(data.total || 0);
    if (offset >= total && state.customerPage > 0) { state.customerPage = Math.max(0,Math.ceil(total/customerPageSize)-1); return loadCustomers(); }
    state.customers = data.customers;
    $('customerList').innerHTML = state.customers.length ? state.customers.map(c => `<div class="row"><button type="button" data-customer="${esc(c.id)}"><strong>${esc(c.canonical_name)}</strong><small>${Number(c.posting_count).toLocaleString('pt-BR')} postagens · ${c.identity_quality === 'PROVISIONAL' ? 'Provisório' : 'Confirmado'} · ${esc(c.status)}</small></button></div>`).join('') : '<div class="empty">Nenhum cadastro encontrado nesta busca.</div>';
    $('customerPageInfo').textContent = total ? `Página ${state.customerPage+1} de ${Math.ceil(total/customerPageSize)} · ${total.toLocaleString('pt-BR')} clientes` : 'Nenhum cliente';
    $('previousCustomers').disabled = state.customerPage === 0;
    $('nextCustomers').disabled = offset + data.customers.length >= total;
  }
  async function loadReview(more = false) {
    if (!more) { state.reviewOffset = 0; state.pending = []; }
    const request = ++state.reviewRequest;
    const offset = state.reviewOffset;
    const q=encodeURIComponent($('reviewSearch').value.trim());
    const data=await api(`/api/review?q=${q}&limit=50&offset=${offset}`);
    if (request !== state.reviewRequest) return;
    state.pending.push(...data.pending);
    state.reviewOffset += data.pending.length;
    $('reviewList').innerHTML = state.pending.length ? state.pending.map((p,i)=>`<div class="row"><div><strong>${esc(p.sender_name || '(sem remetente)')}</strong><small>${esc(p.portal_names || '(sem Cliente Portal)')} · ${Number(p.postings).toLocaleString('pt-BR')} postagens · ${Number(p.local_count)} locais</small><small>Exemplo: ${esc(p.sample_local || 'LOCAL vazio')} · contrato ${esc(p.sample_contract || '—')} · cartão ${esc(p.sample_card || '—')}</small></div><button type="button" class="button secondary" data-review="${i}">Revisar</button></div>`).join('') : '<div class="empty">Nenhum nome pendente nesta busca.</div>';
    $('moreReview').hidden = data.pending.length < 50;
  }
  function renderDetail(data) {
    const c=data.customer; state.selected=c.id; $('detail').hidden=false;
    $('detailTitle').textContent=c.canonical_name;
    $('detailId').textContent=`${c.id} · ${c.identity_quality === 'PROVISIONAL' ? 'Provisório' : 'Confirmado'} · ${c.status}`;
    $('renameName').value=c.canonical_name;
    $('aliases').innerHTML = data.aliases.length ? data.aliases.map(a=>`<span class="chip"><b>${a.kind === 'SENDER' ? 'REMETENTE' : 'PORTAL'}</b> · ${esc(a.original_name)}</span>`).join('') : '<span class="small">Ainda sem nomes associados.</span>';
    $('observed').innerHTML = data.observedContracts.length ? data.observedContracts.map(v=>`<div class="row"><span>${esc(v.contract_number)} ${v.posting_card ? ' · '+esc(v.posting_card) : ''}<small>${Number(v.postings)} postagens</small></span></div>`).join('') : '<span class="small">Sem contratos observados.</span>';
    $('contracts').innerHTML = data.contracts.length ? data.contracts.map(v=>`<div class="row"><span>${esc(v.contract_number)} ${v.posting_card ? ' · '+esc(v.posting_card) : ''}<small>${esc(v.note)}</small></span></div>`).join('') : '<span class="small">Nenhum vínculo conferido.</span>';
    $('locals').innerHTML = data.locals.length ? data.locals.map(l=>`<span class="chip"><b>${esc(l.local_code || 'LOCAL vazio')}</b> · ${Number(l.postings).toLocaleString('pt-BR')} postagens</span>`).join('') : '<span class="small">Sem postagens associadas.</span>';
  }
  async function openCustomer(id) { renderDetail(await api(`/api/customers/${encodeURIComponent(id)}`)); $('detail').scrollIntoView({behavior:'smooth'}); }
  async function refresh() { await Promise.all([refreshStatus(),loadCustomers(),loadReview()]); if(state.selected) await openCustomer(state.selected); }
  function resolve(row) {
    state.resolving=row;
    $('resolveContext').textContent=`${row.sender_name || '(sem remetente)'} · ${row.portal_names || '(sem Cliente Portal)'} · ${Number(row.postings)} postagens`;
    $('resolveCustomer').innerHTML='<option value="">Selecione um cadastro</option>'+state.customers.map(c=>`<option value="${esc(c.id)}">${esc(c.canonical_name)}</option>`).join('');
    $('resolveDialog').showModal();
  }
  let started=false;
  async function start() {
    if(started)return; started=true;
    $('reviewList').textContent='Carregando pendências…'; $('customerList').textContent='Carregando cadastros…';
    await task(refresh);
    $('reviewSearch').addEventListener('input',debounce(()=>task(()=>loadReview())));
    $('customerSearch').addEventListener('input',debounce(()=>task(()=>loadCustomers(true))));
    $('resolveSearch').addEventListener('input',debounce(()=>task(async()=>{
      const data=await api(`/api/customers?q=${encodeURIComponent($('resolveSearch').value.trim())}&limit=100`);
      $('resolveCustomer').innerHTML='<option value="">Selecione um cadastro</option>'+data.customers.map(c=>`<option value="${esc(c.id)}">${esc(c.canonical_name)}</option>`).join('');
    })));
    $('moreReview').addEventListener('click',()=>task(()=>loadReview(true),$('moreReview')));
    $('previousCustomers').addEventListener('click',()=>task(async()=>{state.customerPage--;await loadCustomers();},$('previousCustomers')));
    $('nextCustomers').addEventListener('click',()=>task(async()=>{state.customerPage++;await loadCustomers();},$('nextCustomers')));
    $('customerList').addEventListener('click',e=>{const id=e.target.closest('[data-customer]')?.dataset.customer;if(id)task(()=>openCustomer(id));});
    $('reviewList').addEventListener('click',e=>{const idx=e.target.closest('[data-review]')?.dataset.review;if(idx !== undefined) resolve(state.pending[Number(idx)]);});
    $('cancelResolve').addEventListener('click',()=>$('resolveDialog').close());
    $('closeDetail').addEventListener('click',()=>{$('detail').hidden=true;state.selected=null;});
    $('syncButton').addEventListener('click',()=>task(async()=>{const result=await send('/api/sync',{});notice(`${result.read} postagens lidas; ${result.changed} atualizadas.`);await refresh();},$('syncButton')));
    $('createForm').addEventListener('submit',e=>{e.preventDefault();task(async()=>{const data=await send('/api/customers',{canonicalName:$('newName').value});$('newName').value='';notice('Cadastro criado.');await loadCustomers();await openCustomer(data.customer.id);},e.submitter);});
    $('renameForm').addEventListener('submit',e=>{e.preventDefault();task(async()=>{renderDetail(await send(`/api/customers/${encodeURIComponent(state.selected)}`,{canonicalName:$('renameName').value},'PATCH'));notice('Nome atualizado.');await loadCustomers();},e.submitter);});
    $('aliasForm').addEventListener('submit',e=>{e.preventDefault();task(async()=>{if(await assignAlias($('aliasKind').value,$('aliasName').value,state.selected) === false)return;$('aliasName').value='';notice('Nome associado e postagens reclassificadas.');await refresh();},e.submitter);});
    $('contractForm').addEventListener('submit',e=>{e.preventDefault();task(async()=>{await send('/api/contracts',{customerId:state.selected,contractNumber:$('contractNumber').value,postingCard:$('postingCard').value,note:$('contractNote').value});$('contractForm').reset();notice('Vínculo de contrato registrado.');await openCustomer(state.selected);},e.submitter);});
    $('resolveForm').addEventListener('submit',e=>{e.preventDefault();task(async()=>{const row=state.resolving, customerId=$('resolveCustomer').value;
      if(!customerId)throw new Error('Selecione um cadastro.');
      const shared=['BALCAO','GAS SHOPPING METRO','GAS SHOPPING CENTRO FASHION'].includes(row.portal_norm);
      if(shared && row.sender_norm) { if(await assignAlias('SENDER',row.sender_name,customerId) === false)return; }
      else await send(`/api/postings/${row.first_source_id}/resolve`,{customerId});
      $('resolveDialog').close();notice(shared && row.sender_norm?'Remetente associado e postagens reclassificadas.':'Postagem associada. As demais continuam em revisão.');await refresh();
    },e.submitter);});
  }
  window.addEventListener('agf:auth-ready',start,{once:true});
  if(document.documentElement.classList.contains('agf-auth-ready')) start();
})();
