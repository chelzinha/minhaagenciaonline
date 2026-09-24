/* Cadastro de Clientes - AGF José Bonifácio (tela administrativa) */
(function () {
  'use strict';

  const API = String(window.AGF_CADASTROS_API_URL || '').replace(/\/+$/, '');
  const ABA_NOME = { PORTAL: 'CLIENTE PORTAL', BALCAO: 'BALCÃO', METRO: 'METRÔ' };
  const LOCAL_NOME = { AGF: 'AGF', BALCAO: 'BALCÃO', METRO: 'METRÔ', '': 'Sem LOCAL' };
  const LOCAL_COR = { AGF: 'var(--l-agf)', BALCAO: 'var(--l-balcao)', METRO: 'var(--l-metro)', '': 'var(--l-vazio)' };
  const REGRA_TXT = {
    PORTAL: 'Cliente do Portal', NOME_UNICO: 'Nome base', DECISAO_MANUAL: 'Agrupado manualmente', DECISAO_PLANILHA: 'Planilha (decisão manual antiga)',
    IGUAL_PORTAL: 'Mesmo nome do Portal', SEM_ESPACO: 'Mesmo nome sem espaço/pontuação', MESMO_CNPJ_RAIZ: 'Mesmo CNPJ raiz',
    NOME_CORTADO: 'Nome cortado pelo sistema', MESMAS_PALAVRAS: 'Mesmas palavras', GRAFIA_QUASE_IGUAL: 'Erro de digitação mínimo',
  };
  const MOTIVO_TXT = {
    NOME_CONTIDO: 'Um nome contido no outro', NOME_CONTIDO_COMUM: 'Nome curto e comum', NOME_CONTIDO_GERACAO: 'Tem FILHO/JUNIOR/NETO',
    GRAFIA_PARECIDA: 'Grafia parecida',
  };
  const ORIGEM_TXT = { PORTAL: 'Cliente Portal', BALCAO: 'Remetente Balcão', METRO: 'Remetente Metrô', CF: 'Remetente Centro Fashion' };

  const st = { aba: 'PORTAL', pagina: 1, q: '', ordem: 'postagens', sel: null, modo: 'lista', sugPagina: 1, sugMin: 0, resumo: null };
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const num = (n) => Number(n || 0).toLocaleString('pt-BR');
  const brl = (n) => Number(n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
  const dataBr = (s) => (s ? String(s).slice(0, 10).split('-').reverse().join('/') : '-');

  // ------------------------------------------------------------ api
  async function api(caminho, opcoes = {}) {
    if (!API) throw new Error('Endereço da API não configurado (config.js).');
    const token = window.AgfAuth ? window.AgfAuth.getToken() : '';
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), opcoes.timeout || 45000);
    let resp;
    try {
      resp = await fetch(API + caminho, {
        method: opcoes.method || 'GET', signal: ctrl.signal,
        headers: { Authorization: 'Bearer ' + token, ...(opcoes.body ? { 'Content-Type': 'application/json' } : {}) },
        body: opcoes.body ? JSON.stringify(opcoes.body) : undefined,
      });
    } catch (e) {
      throw new Error(e.name === 'AbortError' ? 'A API demorou para responder. Tente de novo.' : 'Sem conexão com a API do Cadastro.');
    } finally { clearTimeout(t); }
    let data = null;
    try { data = await resp.json(); } catch (_) { /* vazio */ }
    if (resp.status === 401 && window.AgfAuth) { window.AgfAuth.redirectToLogin('sessao'); throw new Error('Sessão expirada.'); }
    if (!resp.ok || !data || data.ok === false) throw new Error((data && data.erro) || `Erro ${resp.status} na API.`);
    return data;
  }

  // ------------------------------------------------------------ feedback
  let toastT;
  function toast(msg, tipo) {
    const el = $('toast'); el.textContent = msg; el.className = 'cad-toast on ' + (tipo || '');
    clearTimeout(toastT); toastT = setTimeout(() => { el.className = 'cad-toast'; }, tipo === 'err' ? 6000 : 3500);
  }
  function ocupado(msg) { $('busyMsg').textContent = msg || 'Processando...'; $('busy').hidden = false; }
  function livre() { $('busy').hidden = true; }
  async function acao(msg, fn, ok) {
    ocupado(msg);
    try { const r = await fn(); if (ok) toast(typeof ok === 'function' ? ok(r) : ok, 'ok'); return r; }
    catch (e) { toast(e.message, 'err'); return null; }
    finally { livre(); }
  }

  // ------------------------------------------------------------ componentes
  function barraLocal(c, comLegenda) {
    const partes = [['AGF', c.local_agf], ['BALCAO', c.local_balcao], ['METRO', c.local_metro], ['', c.local_vazio]];
    const tot = partes.reduce((s, p) => s + (p[1] || 0), 0) || 1;
    const bar = partes.filter((p) => p[1]).map((p) => `<i class="${p[0] ? p[0].toLowerCase() : 'vazio'}" style="width:${(100 * p[1] / tot).toFixed(1)}%" title="${LOCAL_NOME[p[0]]}: ${num(p[1])}"></i>`).join('');
    const leg = comLegenda ? `<div class="lbar-leg">${partes.filter((p) => p[1]).map((p) => `<span><span class="dot" style="background:${LOCAL_COR[p[0]]}"></span>${LOCAL_NOME[p[0]]} <b>${num(p[1])}</b></span>`).join('')}</div>` : '';
    return `<div class="lbar" role="img" aria-label="Postagens por LOCAL">${bar}</div>${leg}`;
  }
  function chipsCliente(c) {
    const out = [];
    if (Number(c.eh_portal)) out.push('<span class="chip portal"><span class="material-symbols-rounded">verified</span>Portal</span>');
    else if (c.fonte_nome === 'MANUAL') out.push('<span class="chip manual">Nome corrigido</span>');
    if (Number(c.grafias) > 1) out.push(`<span class="chip">${num(c.grafias)} grafias</span>`);
    const abas = String(c.abas || '').split(',').filter((a) => a && a !== st.aba);
    if (abas.length) out.push(`<span class="chip">também em ${abas.map((a) => ABA_NOME[a]).join(', ')}</span>`);
    if (Number(c.sugestoes)) out.push(`<span class="chip sug"><span class="material-symbols-rounded">merge</span>${num(c.sugestoes)} ${Number(c.sugestoes) > 1 ? 'sugestões' : 'sugestão'}</span>`);
    return out.join('');
  }
  function paginador(el, pagina, paginas, total, rotulo, ir) {
    const ini = Math.max(1, Math.min(pagina - 2, paginas - 4)), fim = Math.min(paginas, ini + 4);
    let b = `<button type="button" data-p="${pagina - 1}" ${pagina <= 1 ? 'disabled' : ''} aria-label="Anterior">‹</button>`;
    if (ini > 1) b += `<button type="button" data-p="1">1</button>${ini > 2 ? '<span>…</span>' : ''}`;
    for (let i = ini; i <= fim; i++) b += `<button type="button" data-p="${i}" class="${i === pagina ? 'on' : ''}">${i}</button>`;
    if (fim < paginas) b += `${fim < paginas - 1 ? '<span>…</span>' : ''}<button type="button" data-p="${paginas}">${paginas}</button>`;
    b += `<button type="button" data-p="${pagina + 1}" ${pagina >= paginas ? 'disabled' : ''} aria-label="Próxima">›</button>`;
    el.innerHTML = `<span>${rotulo}</span><div class="pg">${b}</div>`;
    el.querySelectorAll('button[data-p]').forEach((x) => x.addEventListener('click', () => ir(Number(x.dataset.p))));
  }

  // ------------------------------------------------------------ resumo
  async function carregarResumo() {
    try {
      const r = await api('/api/v2/resumo');
      st.resumo = r;
      const t = r.totais || {};
      $('kClientes').textContent = num(t.clientes);
      $('kClientesSub').textContent = `${num(t.clientes_portal)} do Portal · ${num((t.clientes || 0) - (t.clientes_portal || 0))} de remetentes`;
      $('kPostagens').textContent = num(t.postagens);
      $('kPostagensSub').textContent = r.motor ? `limpeza em ${new Date(String(r.motor.em).replace(' ', 'T') + 'Z').toLocaleString('pt-BR')}` : 'limpeza ainda não executada';
      $('kSug').textContent = '…';
      const fora = (r.descartadas?.postagens || 0) + (r.semClientePortal || 0);
      $('kFora').textContent = num(fora);
      $('kForaSub').textContent = `${num(r.descartadas?.postagens)} sem remetente · ${num(r.semClientePortal)} sem Cliente Portal`;
      for (const a of Object.keys(ABA_NOME)) {
        const x = r.abas[a] || {};
        const el = document.querySelector(`[data-c="${a}"]`);
        if (el) el.textContent = `${num(x.clientes)} clientes · ${num(x.postagens)} postagens`;
      }
      $('syncInfo').textContent = r.sincronizacao?.atualizadoEm ? `Atende sincronizado ${new Date(String(r.sincronizacao.atualizadoEm).replace(' ', 'T') + 'Z').toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}` : '';
      const s = await api('/api/v2/sugestoes?por=5&pagina=1');
      $('kSug').textContent = num(s.total);
      $('modoSugN').textContent = s.total ? num(s.total) : '';
    } catch (e) {
      toast(e.message, 'err');
    }
  }

  // ------------------------------------------------------------ lista
  async function carregarLista() {
    const el = $('lista');
    el.innerHTML = '<div class="skel"></div>'.repeat(8);
    try {
      const qs = new URLSearchParams({ aba: st.aba, pagina: st.pagina, por: 50, ordem: st.ordem, q: st.q });
      const r = await api('/api/v2/clientes?' + qs);
      if (!r.clientes.length) {
        el.innerHTML = `<div class="cad-msg">${st.q ? 'Nenhum cliente encontrado para essa busca.' : 'Nenhum cliente nesta origem.'}</div>`;
      } else {
        el.innerHTML = r.clientes.map((c) => `
          <button type="button" class="cad-row ${c.id === st.sel ? 'sel' : ''}" data-id="${esc(c.id)}">
            <div style="min-width:0"><div class="cad-row-nome" title="${esc(c.nome)}">${esc(c.nome)}</div><div class="cad-row-meta">${chipsCliente(c)}</div></div>
            <div class="lcol">${barraLocal(c, true)}</div>
            <div class="cad-row-num">${num(c.postagens)}<small>${brl(c.valor)}</small></div>
          </button>`).join('');
        el.querySelectorAll('.cad-row').forEach((b) => b.addEventListener('click', () => abrirFicha(b.dataset.id)));
      }
      paginador($('pager'), r.pagina, r.paginas, r.total, `${num(r.total)} clientes · ${num(r.postagens)} postagens em ${ABA_NOME[st.aba]}`, (p) => { st.pagina = p; carregarLista(); $('lista').scrollIntoView({ block: 'start', behavior: 'smooth' }); });
    } catch (e) {
      el.innerHTML = `<div class="cad-msg err">${esc(e.message)}<br><button class="cad-btn" type="button" id="tentarLista">Tentar de novo</button></div>`;
      $('tentarLista').addEventListener('click', carregarLista);
      $('pager').innerHTML = '';
    }
  }

  // ------------------------------------------------------------ ficha
  async function abrirFicha(id) {
    st.sel = id;
    document.querySelectorAll('.cad-row').forEach((b) => b.classList.toggle('sel', b.dataset.id === id));
    const el = $('ficha');
    el.classList.add('aberta');
    el.innerHTML = '<div class="cad-msg"><span class="cad-spin"></span></div>';
    try {
      const r = await api('/api/v2/clientes/' + encodeURIComponent(id));
      if (r.redirecionar) return abrirFicha(r.redirecionar);
      desenharFicha(r);
    } catch (e) {
      el.innerHTML = `<div class="cad-msg err">${esc(e.message)}</div>`;
    }
  }

  function desenharFicha(r) {
    const c = r.cliente, el = $('ficha');
    const ehPortal = !!c.portal_chave;
    const totL = r.locais.reduce((s, l) => s + l.postagens, 0) || 1;
    const fonte = ehPortal ? '<span class="chip portal"><span class="material-symbols-rounded">verified</span>Nome do Portal</span>'
      : c.fonte_nome === 'MANUAL' ? '<span class="chip manual">Nome corrigido manualmente</span>' : '<span class="chip">Nome mais completo recebido</span>';
    el.innerHTML = `
      <div class="f-head">
        <button type="button" class="cad-btn ghost f-voltar" id="fVoltar"><span class="material-symbols-rounded">arrow_back</span>Voltar</button>
        <div class="f-kicker">Ficha de identidade · ${esc(c.id)}</div>
        <div class="f-nome">${esc(c.nome)}</div>
        <div class="cad-row-meta">${fonte}${r.abas.map((a) => `<span class="chip">${ABA_NOME[a.aba]}: ${num(a.postagens)}</span>`).join('')}</div>
        <div class="f-actions">
          <button type="button" class="cad-btn pri" id="fAgrupar"><span class="material-symbols-rounded">merge</span>Agrupar com outro cadastro</button>
          ${ehPortal ? '' : '<button type="button" class="cad-btn" id="fNome"><span class="material-symbols-rounded">edit</span>Corrigir nome</button>'}
        </div>
      </div>
      ${r.sugestoes.length ? `<div class="f-sec"><h3><span class="material-symbols-rounded">merge</span>Sugestões para este cliente <em>${r.sugestoes.length}</em></h3>
        ${r.sugestoes.map((s) => {
          const outro = s.cliente_a === c.id ? s.cliente_b : s.cliente_a;
          return `<div class="f-sug"><div class="f-sug-nome">${esc(s.outro_nome)}<div class="f-sub">${Number(s.outro_portal) ? 'Portal · ' : ''}${num(s.outro_postagens)} postagens · ${MOTIVO_TXT[s.motivo] || s.motivo} · ${s.score}</div></div>
            <button type="button" class="cad-btn ok" data-unir="${esc(outro)}">Agrupar</button>
            <button type="button" class="cad-btn ghost" data-sep="${esc(outro)}" title="Não é o mesmo cliente">Não é</button></div>`;
        }).join('')}</div>` : ''}
      <div class="f-sec"><h3><span class="material-symbols-rounded">store</span>Postagens por LOCAL <em>${num(totL)}</em></h3>
        ${r.locais.map((l) => `<div class="f-loc"><span>${LOCAL_NOME[l.local_codigo] || esc(l.local_codigo)}</span>
          <span class="bar"><i style="width:${(100 * l.postagens / totL).toFixed(1)}%;background:${LOCAL_COR[l.local_codigo] || 'var(--l-vazio)'}"></i></span>
          <span class="r"><b>${num(l.postagens)}</b></span><span class="r">${brl(l.valor)}</span></div>`).join('') || '<div class="f-sub">Sem postagens.</div>'}
      </div>
      <div class="f-sec"><h3><span class="material-symbols-rounded">spellcheck</span>Grafias recebidas no Atende <em>${r.grafias.length}</em></h3>
        <table class="f-tbl"><thead><tr><th>Grafia recebida</th><th class="r">Post.</th><th></th></tr></thead><tbody>
        ${r.grafias.map((g) => `<tr><td><div class="f-graf">${esc(g.grafia)}</div><div class="f-sub">${ORIGEM_TXT[g.origem] || g.origem} · ${REGRA_TXT[g.regra] || g.regra} · última ${dataBr(g.ultima)}</div></td>
          <td class="n">${num(g.postagens)}</td>
          <td class="r">${r.grafias.length > 1 && !(ehPortal && g.origem === 'PORTAL') ? `<button type="button" class="cad-btn ghost" data-tirar="${esc(g.chave)}" title="Esta grafia não é deste cliente"><span class="material-symbols-rounded">call_split</span></button>` : ''}</td></tr>`).join('')}
        </tbody></table>
      </div>
      <div class="f-sec"><h3><span class="material-symbols-rounded">description</span>Contratos observados <em>${r.contratos.length}</em></h3>
        ${r.contratos.length ? `<table class="f-tbl"><thead><tr><th>Contrato</th><th>Cartão</th><th>Intermediador</th><th class="r">Post.</th><th class="r">Última</th></tr></thead><tbody>
          ${r.contratos.map((k) => `<tr><td>${esc(k.contrato || '-')}</td><td>${esc(k.cartao || '-')}</td><td>${esc(k.intermediador || '-')}</td><td class="n">${num(k.postagens)}</td><td class="n">${dataBr(k.ultima)}</td></tr>`).join('')}</tbody></table>`
          : '<div class="f-sub">Nenhum contrato ou cartão nas postagens deste cliente.</div>'}
        <p class="f-sub" style="margin-top:8px">Contrato e cartão servem só para conferência: não identificam o cliente sozinhos.</p>
      </div>`;
    const v = $('fVoltar'); if (v) v.addEventListener('click', () => el.classList.remove('aberta'));
    $('fAgrupar').addEventListener('click', () => abrirBusca(c));
    const fn = $('fNome'); if (fn) fn.addEventListener('click', () => abrirNome(c));
    el.querySelectorAll('[data-unir]').forEach((b) => b.addEventListener('click', () => agrupar([c.id, b.dataset.unir], '', c.id)));
    el.querySelectorAll('[data-sep]').forEach((b) => b.addEventListener('click', async () => {
      const ok = await acao('Registrando...', () => api('/api/v2/nao-e-o-mesmo', { method: 'POST', body: { clienteA: c.id, clienteB: b.dataset.sep } }), 'Sugestão descartada. Ela não volta mais.');
      if (ok) { abrirFicha(c.id); carregarResumo(); }
    }));
    el.querySelectorAll('[data-tirar]').forEach((b) => b.addEventListener('click', async () => {
      if (!confirm('Tirar esta grafia deste cliente? Ela vira um cadastro separado e o motor não junta de novo.')) return;
      const ok = await acao('Separando e reaplicando a limpeza...', () => api('/api/v2/tirar-grafia', { method: 'POST', body: { clienteId: c.id, chave: b.dataset.tirar }, timeout: 90000 }), 'Grafia separada.');
      if (ok) { abrirFicha(c.id); carregarLista(); carregarResumo(); }
    }));
  }

  async function agrupar(ids, nome, destino) {
    const r = await acao('Agrupando e reaplicando a limpeza...', () => api('/api/v2/agrupar', { method: 'POST', body: { clientes: ids, nome, destino }, timeout: 90000 }),
      (x) => `Agrupado. ${x.motor ? num(x.motor.clientes) + ' clientes no cadastro.' : ''}`);
    if (r) { carregarResumo(); if (st.modo === 'lista') { carregarLista(); abrirFicha(r.clienteId); } }
    return r;
  }

  // ------------------------------------------------------------ dialogos
  let buscaT, buscaOrigem;
  function abrirBusca(c) {
    buscaOrigem = c;
    $('dlgBuscaQ').value = ''; $('dlgBuscaRes').innerHTML = '';
    $('dlgBusca').showModal(); $('dlgBuscaQ').focus();
  }
  $('dlgBuscaQ').addEventListener('input', () => {
    clearTimeout(buscaT);
    buscaT = setTimeout(async () => {
      const q = $('dlgBuscaQ').value.trim();
      const res = $('dlgBuscaRes');
      if (q.length < 2) { res.innerHTML = ''; return; }
      res.innerHTML = '<div class="cad-msg"><span class="cad-spin"></span></div>';
      try {
        const r = await api('/api/v2/busca?q=' + encodeURIComponent(q));
        const itens = r.clientes.filter((x) => x.id !== buscaOrigem.id);
        res.innerHTML = itens.length ? itens.map((x) => `<button type="button" data-id="${esc(x.id)}">${Number(x.eh_portal) ? '<span class="chip portal">Portal</span>' : ''}<span style="flex:1;font-weight:700">${esc(x.nome)}</span><span class="f-sub">${num(x.postagens)} post.</span></button>`).join('')
          : '<div class="cad-msg">Nenhum cadastro encontrado.</div>';
        res.querySelectorAll('button[data-id]').forEach((b) => b.addEventListener('click', async () => {
          $('dlgBusca').close();
          await agrupar([buscaOrigem.id, b.dataset.id], '', b.dataset.id);
        }));
      } catch (e) { res.innerHTML = `<div class="cad-msg err">${esc(e.message)}</div>`; }
    }, 280);
  });
  let nomeAlvo;
  function abrirNome(c) { nomeAlvo = c; $('dlgNomeIn').value = c.nome; $('dlgNome').showModal(); $('dlgNomeIn').select(); }
  $('dlgNomeForm').addEventListener('submit', async (ev) => {
    if (ev.submitter && ev.submitter.value !== 'ok') return;
    const nome = $('dlgNomeIn').value.trim().toUpperCase();
    if (!nome) { ev.preventDefault(); return; }
    const r = await acao('Salvando nome...', () => api('/api/v2/renomear', { method: 'POST', body: { clienteId: nomeAlvo.id, nome }, timeout: 90000 }), 'Nome atualizado.');
    if (r) { abrirFicha(nomeAlvo.id); carregarLista(); }
  });

  // ------------------------------------------------------------ sugestoes
  async function carregarSugestoes() {
    const el = $('sugLista');
    el.innerHTML = '<div class="cad-list"><div class="skel"></div><div class="skel"></div></div>'.repeat(2);
    try {
      const qs = new URLSearchParams({ pagina: st.sugPagina, por: 20, min: st.sugMin, aba: st.aba });
      const r = await api('/api/v2/sugestoes?' + qs);
      if (!r.grupos.length) {
        el.innerHTML = `<div class="cad-list"><div class="cad-msg">Nenhuma sugestão pendente em ${ABA_NOME[st.aba]}.</div></div>`;
      } else {
        el.innerHTML = r.grupos.map((g, i) => cartaoSugestao(g, i)).join('');
        el.querySelectorAll('.cad-sug-card').forEach((card, i) => ligarCartao(card, r.grupos[i]));
      }
      paginador($('sugPager'), r.pagina, r.paginas, r.total, `${num(r.total)} grupos de sugestão em ${ABA_NOME[st.aba]}`, (p) => { st.sugPagina = p; carregarSugestoes(); window.scrollTo({ top: 0, behavior: 'smooth' }); });
    } catch (e) {
      el.innerHTML = `<div class="cad-list"><div class="cad-msg err">${esc(e.message)}</div></div>`;
    }
  }
  function cartaoSugestao(g, i) {
    const portal = g.clientes.find((c) => Number(c.eh_portal));
    return `<article class="cad-sug-card">
      <div class="s-head"><span class="material-symbols-rounded">merge</span>${g.clientes.length} cadastros · ${g.motivos.map((m) => MOTIVO_TXT[m] || m).join(' · ')}<span class="s-score">${g.scoreMax}</span></div>
      ${g.clientes.map((c) => `<label class="s-item"><input type="checkbox" data-id="${esc(c.id)}" checked>
        <div><div class="s-nome">${esc(c.nome)}</div><div class="s-meta">${Number(c.eh_portal) ? '<span class="chip portal">Portal</span>' : ''}${String(c.abas || '').split(',').filter(Boolean).map((a) => `<span class="chip">${ABA_NOME[a]}</span>`).join('')}${Number(c.grafias) > 1 ? `<span class="chip">${c.grafias} grafias</span>` : ''}</div>
        <div style="margin-top:6px">${barraLocal(c, false)}</div></div>
        <div class="s-n">${num(c.postagens)}<div class="f-sub">post.</div></div></label>`).join('')}
      <div class="s-final"><label for="sf${i}">Nome final</label>
        ${portal ? `<input id="sf${i}" value="${esc(portal.nome)}" disabled title="Com cliente do Portal, vale o nome do Portal">`
          : `<select id="sf${i}">${g.clientes.map((c) => `<option value="${esc(c.id)}">${esc(c.nome)}</option>`).join('')}</select>`}
      </div>
      <div class="s-foot"><button type="button" class="cad-btn ghost" data-acao="sep">Não são o mesmo</button><button type="button" class="cad-btn ok" data-acao="unir"><span class="material-symbols-rounded">check</span>Agrupar</button></div>
    </article>`;
  }
  function ligarCartao(card, g) {
    const marcados = () => [...card.querySelectorAll('input[type=checkbox]:checked')].map((x) => x.dataset.id);
    const sel = card.querySelector('select');
    card.querySelectorAll('input[type=checkbox]').forEach((cb) => cb.addEventListener('change', () => {
      card.querySelector('[data-acao=unir]').disabled = marcados().length < 2;
    }));
    card.querySelector('[data-acao=unir]').addEventListener('click', async () => {
      const ids = marcados();
      if (ids.length < 2) return toast('Marque pelo menos 2 nomes.', 'err');
      let destino = sel ? sel.value : g.clientes.find((c) => Number(c.eh_portal)).id;
      if (!ids.includes(destino)) destino = ids[0];
      const nome = sel ? g.clientes.find((c) => c.id === destino).nome : '';
      const r = await agrupar(ids, nome, destino);
      if (r) { card.classList.add('feito'); card.querySelectorAll('button,input,select').forEach((x) => { x.disabled = true; }); }
    });
    card.querySelector('[data-acao=sep]').addEventListener('click', async () => {
      const ids = g.clientes.map((c) => c.id);
      const r = await acao('Registrando...', async () => {
        for (const p of g.pares) await api('/api/v2/nao-e-o-mesmo', { method: 'POST', body: { clienteA: p.cliente_a, clienteB: p.cliente_b } });
        return true;
      }, 'Sugestão descartada. Ela não volta mais.');
      if (r) { card.classList.add('feito'); card.querySelectorAll('button,input,select').forEach((x) => { x.disabled = true; }); carregarResumo(); }
      return ids;
    });
  }

  // ------------------------------------------------------------ eventos
  function trocarModo(m) {
    st.modo = m;
    $('modoLista').classList.toggle('on', m === 'lista'); $('modoSug').classList.toggle('on', m === 'sug');
    $('vistaLista').hidden = m !== 'lista'; $('vistaSug').hidden = m !== 'sug';
    if (m === 'sug') { st.sugPagina = 1; carregarSugestoes(); } else carregarLista();
  }
  $('tabs').querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
    $('tabs').querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
    st.aba = b.dataset.aba; st.pagina = 1; st.sugPagina = 1;
    if (st.modo === 'lista') carregarLista(); else carregarSugestoes();
  }));
  $('modoLista').addEventListener('click', () => trocarModo('lista'));
  $('modoSug').addEventListener('click', () => trocarModo('sug'));
  $('kSugBtn').addEventListener('click', () => trocarModo('sug'));
  let bt;
  $('busca').addEventListener('input', () => { clearTimeout(bt); bt = setTimeout(() => { st.q = $('busca').value.trim(); st.pagina = 1; carregarLista(); }, 300); });
  $('ordem').addEventListener('change', () => { st.ordem = $('ordem').value; st.pagina = 1; carregarLista(); });
  $('sugMin').addEventListener('change', () => { st.sugMin = Number($('sugMin').value); st.sugPagina = 1; carregarSugestoes(); });
  $('btnRecarregar').addEventListener('click', () => { carregarResumo(); st.modo === 'lista' ? carregarLista() : carregarSugestoes(); });
  $('btnMotor').addEventListener('click', async () => {
    const r = await acao('Aplicando as regras de limpeza em todos os nomes...', () => api('/api/v2/motor', { method: 'POST', timeout: 120000 }),
      (x) => `Limpeza aplicada: ${num(x.motor.clientes)} clientes, ${num(x.motor.sugestoes)} sugestões.`);
    if (r) { carregarResumo(); st.modo === 'lista' ? carregarLista() : carregarSugestoes(); }
  });

  function iniciar() { carregarResumo(); carregarLista(); }
  if (document.documentElement.classList.contains('agf-auth-ready')) iniciar();
  else window.addEventListener('agf:auth-ready', iniciar, { once: true });
})();
