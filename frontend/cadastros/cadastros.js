/* Cadastro de Clientes - AGF José Bonifácio (tela administrativa) */
(function () {
  'use strict';

  const API = String(window.AGF_CADASTROS_API_URL || '').replace(/\/+$/, '');
  const ABA_NOME = { PORTAL: 'CLIENTE PORTAL', BALCAO: 'BALCÃO', METRO: 'GAS SHOPPING METRO' };
  const LOCAL_NOME = { AGF: 'AGF', BALCAO: 'BALCÃO', METRO: 'METRÔ', '': 'Sem LOCAL' };
  const LOCAL_COR = { AGF: 'var(--l-agf)', BALCAO: 'var(--l-balcao)', METRO: 'var(--l-metro)', '': 'var(--l-vazio)' };
  const REGRA_TXT = {
    PORTAL: 'Cliente do Portal', NOME_UNICO: 'Nome base', DECISAO_MANUAL: 'Agrupado manualmente', PORTAL_RENOMEADO: 'Portal mudou o nome (junção manual)', DECISAO_PLANILHA: 'Planilha (decisão manual antiga)',
    IGUAL_PORTAL: 'Mesmo nome do Portal', SEM_ESPACO: 'Mesmo nome sem espaço/pontuação', MESMO_CNPJ_RAIZ: 'Mesmo CNPJ raiz',
    NOME_CORTADO: 'Nome cortado pelo sistema', MESMAS_PALAVRAS: 'Mesmas palavras', GRAFIA_QUASE_IGUAL: 'Erro de digitação mínimo',
  };
  const MOTIVO_TXT = {
    NOME_CONTIDO: 'Um nome contido no outro', NOME_CONTIDO_COMUM: 'Nome curto e comum', NOME_CONTIDO_GERACAO: 'Tem FILHO/JUNIOR/NETO',
    GRAFIA_PARECIDA: 'Grafia parecida',
  };
  const ORIGEM_TXT = { PORTAL: 'Cliente Portal', BALCAO: 'Remetente Balcão', METRO: 'Remetente Metrô', CF: 'Remetente Centro Fashion' };

  /** "Atende sincronizado 20:41" (com a data quando não é hoje) + andamento da leitura das postagens. */
  function textoSync(x) {
    if (!x || !x.atualizadoEm) return '';
    const d = new Date(String(x.atualizadoEm).replace(' ', 'T') + 'Z');
    const hora = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    const hoje = d.toDateString() === new Date().toDateString();
    const quando = hoje ? hora : `${d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} ${hora}`;
    const cur = Number(x.cursor || 0), tot = Number(x.ultimoIdAtende || 0);
    const lendo = cur > 0 && tot > 0 ? ` · lendo postagens ${Math.min(99, Math.floor(cur * 100 / tot))}%` : '';
    return `Atende sincronizado ${quando}${lendo}`;
  }
  const st = { localPagina: 1, aba: 'PORTAL', pagina: 1, q: '', local: '', ordem: 'postagens', sel: null, modo: 'lista', sugPagina: 1, sugMin: 0, resumo: null };
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const num = (n) => Number(n || 0).toLocaleString('pt-BR');
  const brl = (n) => Number(n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
  const dataBr = (s) => (s ? String(s).slice(0, 10).split('-').reverse().join('/') : '-');

  // ------------------------------------------------------------ api
  // 401 so leva ao login se o controle de acesso confirmar que a sessao acabou;
  // falha momentanea de validacao repete a chamada uma vez e mostra o erro, sem tirar a pessoa da tela.
  async function api(caminho, opcoes = {}, tentativa = 1) {
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
    if (resp.status === 401 && window.AgfAuth) {
      let sessaoValida = false;
      try { await window.AgfAuth.validate(); sessaoValida = true; }
      catch (e) {
        if (e && e.code === 'rejected') { window.AgfAuth.redirectToLogin('sessao'); throw new Error('Sessão expirada. Entre novamente.'); }
      }
      if (sessaoValida && tentativa === 1) return api(caminho, opcoes, 2);
      throw new Error('Não foi possível confirmar seu acesso agora. Tente de novo em instantes.');
    }
    if (!resp.ok || !data || data.ok === false) throw Object.assign(new Error((data && data.erro) || `Erro ${resp.status} na API.`), { codigo: (data && data.codigo) || '' });
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
    if (c.local_carteira) out.push(`<span class="chip local" title="LOCAL da carteira${c.local_fonte === 'ADMIN' ? ' (definido pelo admin)' : ''}"><span class="material-symbols-rounded">location_on</span>${LOCAL_NOME[c.local_carteira] || esc(c.local_carteira)}</span>`);
    const nLocais = [c.local_agf, c.local_balcao, c.local_metro].filter((n) => Number(n) > 0).length;
    if (!c.local_carteira && nLocais) out.push('<span class="chip fila" title="Empate entre LOCAIS: escolha em Mais de um LOCAL"><span class="material-symbols-rounded">location_off</span>LOCAL a definir</span>');
    else if (nLocais > 1) out.push(`<span class="chip fila" title="Posta em ${nLocais} LOCAIS. Ficou no LOCAL com mais postagens."><span class="material-symbols-rounded">call_split</span>${nLocais} LOCAIS</span>`);
    if (Number(c.eh_portal)) out.push('<span class="chip portal"><span class="material-symbols-rounded">verified</span>Portal</span>');
    else if (c.fonte_nome === 'MANUAL') out.push('<span class="chip manual">Nome corrigido</span>');
    if (Number(c.grafias) > 1) out.push(`<span class="chip">${num(c.grafias)} grafias</span>`);
    const abas = String(c.abas || '').split(',').filter((a) => a && a !== st.aba);
    if (abas.length) out.push(`<span class="chip" title="Também aparece nesta fonte do cadastro (CLIENTE PORTAL)">fonte também: ${abas.map((a) => ABA_NOME[a]).join(', ')}</span>`);
    if (c.grupo_nome) out.push(`<span class="chip grp" title="Grupo comercial (só para o CRM)"><span class="material-symbols-rounded">join_inner</span>${esc(c.grupo_nome)}</span>`);
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
      $('syncInfo').textContent = textoSync(r.sincronizacao);
      const s = await api('/api/v2/sugestoes?por=5&pagina=1');
      $('kSug').textContent = num(s.total);
      $('modoSugN').textContent = s.total ? num(s.total) : '';
      $('modoLocalN').textContent = r.filaLocal ? num(r.filaLocal) : '';
      const gr = r.grupos || { grupos: 0, cadastros: 0 };
      $('kGrp').textContent = num(gr.grupos);
      $('kGrpSub').textContent = gr.grupos ? `${num(gr.cadastros)} cadastros somados no CRM` : 'nenhum grupo ainda';
      $('modoGruposN').textContent = gr.grupos ? num(gr.grupos) : '';
    } catch (e) {
      toast(e.message, 'err');
    }
  }

  // ------------------------------------------------------------ lista
  async function carregarLista() {
    const el = $('lista');
    el.innerHTML = '<div class="skel"></div>'.repeat(8);
    try {
      const qs = new URLSearchParams({ aba: st.aba, pagina: st.pagina, por: 50, ordem: st.ordem, q: st.q, local: st.local });
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
      paginador($('pager'), r.pagina, r.paginas, r.total, `${num(r.total)} clientes · ${num(r.postagens)} postagens em ${ABA_NOME[st.aba]}${st.local ? ` · com postagens no LOCAL ${LOCAL_NOME[st.local]}` : ''}`, (p) => { st.pagina = p; carregarLista(); $('lista').scrollIntoView({ block: 'start', behavior: 'smooth' }); });
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
    const nPortal = r.grafias.filter((g) => g.origem === 'PORTAL').length;
    const cands = r.portalRenomeado || [];
    const PAPEL_TXT = { ANTIGO: 'parece o nome antigo', NOVO: 'parece o nome novo' };
    const totL = r.locais.reduce((s, l) => s + l.postagens, 0) || 1;
    const fonte = ehPortal ? '<span class="chip portal"><span class="material-symbols-rounded">verified</span>Nome do Portal</span>'
      : c.fonte_nome === 'MANUAL' ? '<span class="chip manual">Nome corrigido manualmente</span>' : '<span class="chip">Nome mais completo recebido</span>';
    el.innerHTML = `
      <div class="f-head">
        <button type="button" class="cad-btn ghost f-voltar" id="fVoltar"><span class="material-symbols-rounded">arrow_back</span>Voltar</button>
        <div class="f-kicker">Ficha de identidade · ${esc(c.id)}</div>
        <div class="f-nome">${esc(c.nome)}</div>
        <div class="cad-row-meta">${fonte}${nPortal > 1 ? `<span class="chip portal" title="Nome antigo e novo do Portal juntos. Vale o nome mais recente do Portal."><span class="material-symbols-rounded">history</span>${nPortal} nomes no Portal</span>` : ''}${r.abas.map((a) => `<span class="chip" title="Fonte do cadastro (CLIENTE PORTAL)">Fonte ${ABA_NOME[a.aba]}: ${num(a.postagens)}</span>`).join('')}</div>
        <div class="f-local"><span class="material-symbols-rounded" style="font-size:17px;color:var(--c-muted)">location_on</span><b>LOCAL da carteira</b>
          <select id="fLocal" aria-label="LOCAL da carteira">
            <option value="" ${c.local_carteira ? '' : 'selected'} disabled>${c.local_carteira ? '' : 'Não definido (fila)'}</option>
            ${['AGF', 'BALCAO', 'METRO'].map((l) => `<option value="${l}" ${c.local_carteira === l ? 'selected' : ''}>${LOCAL_NOME[l]}</option>`).join('')}
          </select>
          <span class="f-sub">${c.local_fonte === 'ADMIN' ? 'definido pelo admin' : c.local_fonte === 'AUTO' ? 'do Visão 360: só posta neste LOCAL' : c.local_fonte === 'PREDOMINANTE' ? 'do Visão 360: LOCAL com mais postagens' : 'empate entre LOCAIS: escolha um'}</span>
        </div>
        <div class="f-actions">
          <button type="button" class="cad-btn pri" id="fAgrupar"><span class="material-symbols-rounded">merge</span>Agrupar com outro cadastro</button>
          ${ehPortal ? '' : '<button type="button" class="cad-btn" id="fNome"><span class="material-symbols-rounded">edit</span>Corrigir nome</button>'}
        </div>
      </div>
      ${window.AGF_CAD_GRUPOS ? window.AGF_CAD_GRUPOS.secaoFicha(r) : ''}
      ${cands.length ? `<div class="f-sec f-ren"><h3><span class="material-symbols-rounded">history</span>Nome antigo ou novo no Portal? <em>${cands.length}</em></h3>
        <p class="f-sub" style="margin:-2px 0 10px">Mesmo contrato e cartão, e um nome parou quando o outro começou. Se for o mesmo cliente, junte: o cadastro fica com o nome mais recente do Portal e soma o histórico dos dois.</p>
        ${cands.map((x) => `<div class="f-sug"><div class="f-sug-nome">${esc(x.nome)}${x.papel ? ` <span class="chip">${PAPEL_TXT[x.papel]}</span>` : x.motivo === 'NOME_CORTADO' ? ' <span class="chip">nome cortado</span>' : ''}
            <div class="f-sub">No Portal de ${dataBr(x.de)} a ${dataBr(x.ate)} · ${num(x.postagens)} postagens · ${brl(x.valor)}</div>
            <div class="f-sub">Contrato / cartão em comum: ${esc(x.cartoes)}</div></div>
          <button type="button" class="cad-btn ok" data-ren="${esc(x.id)}">É o mesmo: juntar</button>
          <button type="button" class="cad-btn ghost" data-sep="${esc(x.id)}" title="Não é o mesmo cliente">Não é</button></div>`).join('')}</div>` : ''}
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
          <td class="r">${r.grafias.length > 1 && !(g.origem === 'PORTAL' && nPortal < 2) ? `<button type="button" class="cad-btn ghost" data-tirar="${esc(g.chave)}" title="${g.origem === 'PORTAL' ? 'Este nome do Portal não é deste cliente (desfaz a junção)' : 'Esta grafia não é deste cliente'}"><span class="material-symbols-rounded">call_split</span></button>` : ''}</td></tr>`).join('')}
        </tbody></table>
      </div>
      <div class="f-sec"><h3><span class="material-symbols-rounded">description</span>Contratos observados <em>${r.contratos.length}</em></h3>
        ${r.contratos.length ? `<table class="f-tbl"><thead><tr><th>Contrato</th><th>Cartão</th><th>Tipo</th><th class="r">Post.</th><th class="r">Última</th></tr></thead><tbody>
          ${r.contratos.map((k) => `<tr><td>${esc(k.contrato || '-')}</td><td>${esc(k.cartao || '-')}</td><td>${esc(k.tipo || '-')}</td><td class="n">${num(k.postagens)}</td><td class="n">${dataBr(k.ultima)}</td></tr>`).join('')}</tbody></table>`
          : '<div class="f-sub">Nenhum contrato ou cartão nas postagens deste cliente.</div>'}
        <p class="f-sub" style="margin-top:8px">Contrato e cartão servem só para conferência: não identificam o cliente sozinhos.</p>
      </div>`;
    const v = $('fVoltar'); if (v) v.addEventListener('click', () => el.classList.remove('aberta'));
    if (window.AGF_CAD_GRUPOS) window.AGF_CAD_GRUPOS.ligarFicha(el, r);
    $('fAgrupar').addEventListener('click', () => abrirBusca(c));
    $('fLocal').addEventListener('change', async (ev) => {
      const local = ev.target.value;
      const ok = await acao('Gravando LOCAL...', () => api('/api/v2/definir-local', { method: 'POST', body: { itens: [{ clienteId: c.id, local }] } }), `Cliente agora é do LOCAL ${LOCAL_NOME[local]}.`);
      if (ok) { abrirFicha(c.id); carregarResumo(); if (st.modo === 'lista') carregarLista(); }
    });
    const fn = $('fNome'); if (fn) fn.addEventListener('click', () => abrirNome(c));
    el.querySelectorAll('[data-unir]').forEach((b) => b.addEventListener('click', () => agrupar([c.id, b.dataset.unir], '', c.id)));
    el.querySelectorAll('[data-ren]').forEach((b) => b.addEventListener('click', () => {
      if (!confirm(TXT_RENOMEADO)) return;
      agrupar([c.id, b.dataset.ren], '', c.id, { portalRenomeado: true });
    }));
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

  const TXT_RENOMEADO = 'Os dois cadastros vêm do Portal.\n\nSó junte se for o MESMO cliente e o Portal trocou o nome (nome antigo e nome novo).\n'
    + 'O cadastro fica com o nome mais recente do Portal e soma o histórico dos dois. Tratativas e agenda do CRM vão junto.\n\n'
    + 'Dá para desfazer depois pelo botão de separar na grafia.\n\nJuntar?';
  async function agrupar(ids, nome, destino, extra = {}) {
    ocupado('Agrupando e reaplicando a limpeza...');
    let r = null;
    try {
      r = await api('/api/v2/agrupar', { method: 'POST', body: { clientes: ids, nome, destino, ...extra }, timeout: 90000 });
    } catch (e) {
      livre();
      // dois clientes do Portal: so com confirmacao de que o Portal mudou o nome
      if (e.codigo === 'DOIS_PORTAIS' && !extra.portalRenomeado) return confirm(TXT_RENOMEADO) ? agrupar(ids, nome, destino, { ...extra, portalRenomeado: true }) : null;
      if (e.codigo === 'SEM_CARTAO_COMUM' && !extra.forcar) {
        const ok = confirm('Atenção: os dois nomes do Portal NÃO usam o mesmo contrato e cartão.\n\nNormalmente isso indica clientes diferentes. Só continue se você tiver certeza de que é o mesmo cliente.\n\nJuntar mesmo assim?');
        return ok ? agrupar(ids, nome, destino, { ...extra, forcar: true }) : null;
      }
      toast(e.message, 'err');
      return null;
    }
    livre();
    toast(`Agrupado. ${r.motor ? num(r.motor.clientes) + ' clientes no cadastro.' : ''}`, 'ok');
    carregarResumo(); if (st.modo === 'lista') { carregarLista(); abrirFicha(r.clienteId); }
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
      atualizarLote();
      paginador($('sugPager'), r.pagina, r.paginas, r.total, `${num(r.total)} grupos de sugestão em ${ABA_NOME[st.aba]}`, (p) => { st.sugPagina = p; carregarSugestoes(); window.scrollTo({ top: 0, behavior: 'smooth' }); });
    } catch (e) {
      el.innerHTML = `<div class="cad-list"><div class="cad-msg err">${esc(e.message)}</div></div>`;
      atualizarLote();
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
          : `<input id="sf${i}" class="s-nome-in" list="sfl${i}" value="${esc(g.clientes[0].nome)}" maxlength="160" autocomplete="off" title="Escolha um dos nomes ou digite o nome correto">
             <datalist id="sfl${i}">${g.clientes.map((c) => `<option value="${esc(c.nome)}"></option>`).join('')}</datalist>
             <small class="f-sub">Escolha um dos nomes ou digite o nome correto.</small>`}
      </div>
      <div class="s-foot"><button type="button" class="cad-btn ghost" data-acao="sep">Não são o mesmo</button><button type="button" class="cad-btn ok" data-acao="unir"><span class="material-symbols-rounded">check</span>Agrupar</button></div>
    </article>`;
  }
  function ligarCartao(card, g) {
    const marcados = () => [...card.querySelectorAll('input[type=checkbox]:checked')].map((x) => x.dataset.id);
    const nomeIn = card.querySelector('.s-nome-in');                       // sem Portal: nome final editavel
    card.querySelectorAll('input[type=checkbox]').forEach((cb) => cb.addEventListener('change', () => {
      card.querySelector('[data-acao=unir]').disabled = marcados().length < 2;
      atualizarLote();
    }));
    if (nomeIn) nomeIn.addEventListener('input', atualizarLote);
    /** O que o Agrupar do cartão grava (o lote usa exatamente o mesmo). { ids, nome, destino } ou { erro }. */
    card._agrupamento = () => {
      const ids = marcados();
      if (ids.length < 2) return { erro: 'Marque pelo menos 2 nomes.' };
      let destino, nome = '';
      if (nomeIn) {
        nome = nomeIn.value.trim().replace(/\s+/g, ' ').toUpperCase();
        if (!nome) return { erro: 'Informe o nome final.', foco: nomeIn };
        // o cadastro que fica: o de mesmo nome (se o nome escolhido for um deles) ou o que mais postou
        const marcadosCli = g.clientes.filter((c) => ids.includes(c.id));
        const igual = marcadosCli.find((c) => String(c.nome).toUpperCase() === nome);
        destino = (igual || [...marcadosCli].sort((a, b) => Number(b.postagens) - Number(a.postagens))[0]).id;
      } else destino = g.clientes.find((c) => Number(c.eh_portal)).id;
      if (!ids.includes(destino)) destino = ids[0];
      return { ids, nome, destino };
    };
    card.querySelector('[data-acao=unir]').addEventListener('click', async () => {
      const a = card._agrupamento();
      if (a.erro) { if (a.foco) a.foco.focus(); return toast(a.erro, 'err'); }
      const r = await agrupar(a.ids, a.nome, a.destino);
      if (r) { marcarFeito(card); atualizarLote(); }
    });
    card.querySelector('[data-acao=sep]').addEventListener('click', async () => {
      const ids = g.clientes.map((c) => c.id);
      const r = await acao('Registrando...', async () => {
        for (const p of g.pares) await api('/api/v2/nao-e-o-mesmo', { method: 'POST', body: { clienteA: p.cliente_a, clienteB: p.cliente_b } });
        return true;
      }, 'Sugestão descartada. Ela não volta mais.');
      if (r) { marcarFeito(card); carregarResumo(); atualizarLote(); }
      return ids;
    });
  }
  function marcarFeito(card) { card.classList.add('feito'); card.querySelectorAll('button,input,select').forEach((x) => { x.disabled = true; }); }

  // ------------------------------------------------------------ agrupar em lote (cartões da página)
  /** Cartões da página que o lote vai gravar: não feitos, com 2+ nomes marcados e nome final preenchido. */
  function cartoesDoLote() {
    return [...document.querySelectorAll('#sugLista .cad-sug-card:not(.feito)')].map((card) => ({ card, a: card._agrupamento ? card._agrupamento() : { erro: 'x' } }));
  }
  function atualizarLote() {
    const todos = cartoesDoLote(), ok = todos.filter((x) => !x.a.erro).length, fora = todos.length - ok;
    const txt = ok ? `Agrupar ${num(ok)} ${ok > 1 ? 'cartões' : 'cartão'} desta página` : 'Nada para agrupar nesta página';
    const det = !todos.length ? '' : fora ? `${num(fora)} ${fora > 1 ? 'ficam' : 'fica'} de fora (menos de 2 nomes marcados ou sem nome final).` : 'Confira os cartões antes: vale o que está marcado e o nome final de cada um.';
    for (const id of ['sugLoteTopo', 'sugLoteFim']) { const b = $(id); if (!b) continue; b.disabled = !ok; b.querySelector('.tx').textContent = txt; }
    const d = $('sugLoteDet'); if (d) d.textContent = det;
    const barra = $('sugLoteBarra'); if (barra) barra.hidden = !todos.length;
  }
  async function agruparPagina() {
    const lista = cartoesDoLote().filter((x) => !x.a.erro);
    if (!lista.length) return toast('Nenhum cartão pronto para agrupar nesta página.', 'err');
    const nomes = lista.slice(0, 6).map((x) => '- ' + (x.a.nome || x.card.querySelector('.s-final input').value)).join('\n');
    const mais = lista.length > 6 ? `\n... e mais ${lista.length - 6}` : '';
    if (!confirm(`Agrupar ${lista.length} ${lista.length > 1 ? 'cartões' : 'cartão'} desta página?\n\n${nomes}${mais}\n\nVale exatamente o que está marcado em cada cartão. Cartões desmarcados ficam de fora.`)) return;
    const r = await acao(`Agrupando ${lista.length} cartões e reaplicando a limpeza...`,
      () => api('/api/v2/agrupar-lote', { method: 'POST', body: { itens: lista.map((x) => ({ clientes: x.a.ids, nome: x.a.nome, destino: x.a.destino })) }, timeout: 120000 }));
    if (!r) return;
    const pulados = new Map((r.pulados || []).map((p) => [p.indice, p.motivo]));
    lista.forEach((x, i) => {
      x.card.querySelector('.s-aviso')?.remove();
      if (pulados.has(i)) x.card.querySelector('.s-foot').insertAdjacentHTML('beforebegin', `<div class="s-aviso">${esc(pulados.get(i))}</div>`);
      else marcarFeito(x.card);
    });
    toast(`${num(r.agrupados)} ${r.agrupados === 1 ? 'cartão agrupado' : 'cartões agrupados'}${pulados.size ? ` · ${pulados.size} ficou de fora (veja o aviso no cartão)` : ''}.`, pulados.size ? 'err' : 'ok');
    carregarResumo(); atualizarLote();
  }

  // ------------------------------------------------------------ fila de LOCAL
  async function carregarFilaLocal() {
    const el = $('localLista');
    el.innerHTML = '<div class="skel"></div>'.repeat(6);
    try {
      const r = await api('/api/v2/fila-local?' + new URLSearchParams({ pagina: st.localPagina, por: 30 }));
      $('localFortes').hidden = true;
      if (!r.itens.length) {
        el.innerHTML = '<div class="cad-msg">Nenhum cliente posta em mais de um LOCAL.</div>';
      } else {
        el.innerHTML = r.itens.map((x) => `
          <div class="l-item" data-id="${esc(x.id)}">
            <div><div class="l-nome">${esc(x.nome)}</div><div class="cad-row-meta">${Number(x.eh_portal) ? '<span class="chip portal">Portal</span>' : ''}<span class="chip">${num(x.postagens)} postagens · ${brl(x.valor)}</span><span class="chip">última ${dataBr(x.ultima)}</span></div></div>
            <div>${barraLocal({ local_agf: x.agf, local_balcao: x.balcao, local_metro: x.metro, local_vazio: 0 }, true)}</div>
            <div class="l-botoes">${['AGF', 'BALCAO', 'METRO'].map((l) => { const pct = x.postagens ? Math.floor((100 * (l === 'AGF' ? x.agf : l === 'BALCAO' ? x.balcao : x.metro)) / x.postagens) : 0; return `<button type="button" class="cad-btn ${l === x.local_carteira ? 'sug' : ''}" data-local="${l}" title="${l === x.local_carteira ? (x.local_fonte === 'ADMIN' ? 'Definido pelo admin' : 'LOCAL com mais postagens') : 'Trocar para ' + LOCAL_NOME[l]}">${LOCAL_NOME[l]} <small>${pct}%</small></button>`; }).join('')}</div>
          </div>`).join('');
        el.querySelectorAll('.l-item').forEach((item) => item.querySelectorAll('[data-local]').forEach((b) => b.addEventListener('click', async () => {
          const ok = await acao('Gravando LOCAL...', () => api('/api/v2/definir-local', { method: 'POST', body: { itens: [{ clienteId: item.dataset.id, local: b.dataset.local }] } }), `Cliente agora é do LOCAL ${LOCAL_NOME[b.dataset.local]}.`);
          if (ok) { item.querySelectorAll('[data-local]').forEach((x) => x.classList.toggle('sug', x === b)); }
        })));
      }
      paginador($('localPager'), r.pagina, r.paginas, r.total, `${num(r.total)} clientes postam em mais de um LOCAL`, (p) => { st.localPagina = p; carregarFilaLocal(); window.scrollTo({ top: 0, behavior: 'smooth' }); });
    } catch (e) {
      el.innerHTML = `<div class="cad-msg err">${esc(e.message)}</div>`;
    }
  }
  $('localFortes').addEventListener('click', async () => {
    if (!confirm('Aplicar o LOCAL sugerido a todos os clientes que têm 90% ou mais das postagens num LOCAL só?')) return;
    const ok = await acao('Aplicando sugestões...', () => api('/api/v2/definir-local', { method: 'POST', body: { sugestoesFortes: true } }), (x) => `${num(x.definidos)} clientes com LOCAL definido.`);
    if (ok) { st.localPagina = 1; carregarFilaLocal(); carregarResumo(); }
  });

  // ------------------------------------------------------------ eventos
  function trocarModo(m) {
    st.modo = m;
    $('modoLista').classList.toggle('on', m === 'lista'); $('modoSug').classList.toggle('on', m === 'sug'); $('modoLocal').classList.toggle('on', m === 'local');
    $('modoGrupos').classList.toggle('on', m === 'grupos');
    $('vistaLista').hidden = m !== 'lista'; $('vistaSug').hidden = m !== 'sug'; $('vistaLocal').hidden = m !== 'local'; $('vistaGrupos').hidden = m !== 'grupos';
    // grupos valem para todas as fontes: as abas de fonte saem e entra o aviso
    $('tabs').hidden = m === 'grupos'; $('grpBanner').hidden = m !== 'grupos';
    if (m === 'grupos') { if (window.AGF_CAD_GRUPOS) window.AGF_CAD_GRUPOS.abrir(); }
    else if (m === 'sug') { st.sugPagina = 1; carregarSugestoes(); } else if (m === 'local') { st.localPagina = 1; carregarFilaLocal(); } else carregarLista();
  }
  $('modoLocal').addEventListener('click', () => trocarModo('local'));
  $('tabs').querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
    $('tabs').querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
    st.aba = b.dataset.aba; st.pagina = 1; st.sugPagina = 1;
    if (st.modo === 'lista') carregarLista(); else if (st.modo === 'sug') carregarSugestoes();
  }));
  $('modoLista').addEventListener('click', () => trocarModo('lista'));
  $('modoSug').addEventListener('click', () => trocarModo('sug'));
  $('kSugBtn').addEventListener('click', () => trocarModo('sug'));
  $('modoGrupos').addEventListener('click', () => trocarModo('grupos'));
  $('kGrpBtn').addEventListener('click', () => trocarModo('grupos'));
  let bt;
  $('busca').addEventListener('input', () => { clearTimeout(bt); bt = setTimeout(() => { st.q = $('busca').value.trim(); st.pagina = 1; carregarLista(); }, 300); });
  $('local').addEventListener('change', () => { st.local = $('local').value; st.pagina = 1; carregarLista(); });
  $('ordem').addEventListener('change', () => { st.ordem = $('ordem').value; st.pagina = 1; carregarLista(); });
  ['sugLoteTopo', 'sugLoteFim'].forEach((id) => $(id) && $(id).addEventListener('click', agruparPagina));
  $('sugMin').addEventListener('change', () => { st.sugMin = Number($('sugMin').value); st.sugPagina = 1; carregarSugestoes(); });
  const recarregarModo = () => (st.modo === 'lista' ? carregarLista() : st.modo === 'sug' ? carregarSugestoes() : st.modo === 'grupos' ? window.AGF_CAD_GRUPOS && window.AGF_CAD_GRUPOS.abrir() : carregarFilaLocal());
  $('btnRecarregar').addEventListener('click', () => { carregarResumo(); recarregarModo(); });
  $('btnMotor').addEventListener('click', async () => {
    const r = await acao('Aplicando as regras de limpeza em todos os nomes...', () => api('/api/v2/motor', { method: 'POST', timeout: 120000 }),
      (x) => `Limpeza aplicada: ${num(x.motor.clientes)} clientes, ${num(x.motor.sugestoes)} sugestões.`);
    if (r) { carregarResumo(); recarregarModo(); }
  });

  // ponte para o módulo de grupos comerciais (cadastros-grupos.js)
  window.AGF_CAD = { api, toast, acao, ocupado, livre, esc, num, brl, dataBr, barraLocal, LOCAL_NOME, ABA_NOME, st,
    abrirFicha, carregarResumo, carregarLista, trocarModo, fichaAberta: () => st.sel };

  function iniciar() { carregarResumo(); carregarLista(); }
  if (document.documentElement.classList.contains('agf-auth-ready')) iniciar();
  else window.addEventListener('agf:auth-ready', iniciar, { once: true });
})();
