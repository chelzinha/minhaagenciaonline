/* Cadastro de Clientes - Grupos comerciais (02/10/2026)
   Vários cadastros que comercialmente são um cliente só. Serve SOMENTE para o CRM:
   nome, ID e postagens de cada cadastro não mudam. Depende de window.AGF_CAD (cadastros.js). */
(function () {
  'use strict';

  const LOCAIS = ['AGF', 'BALCAO', 'METRO'];
  const $ = (id) => document.getElementById(id);
  const C = () => window.AGF_CAD;
  const esc = (s) => C().esc(s);
  const num = (n) => C().num(n);
  const brl = (n) => C().brl(n);
  const dataBr = (s) => C().dataBr(s);
  const LN = (l) => (C().LOCAL_NOME[l] || l || 'Sem LOCAL');
  const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().trim();
  const ms = (n, extra = '') => `<span class="material-symbols-rounded" ${extra}>${n}</span>`;
  const AC_TXT = { RESGATAR: 'Resgatar', CONVERTER: 'Converter', FIDELIZAR: 'Fidelizar', MANTER: 'Manter', CANCELAR: 'Cancelar' };
  const AC_CHIP = { RESGATAR: 'background:#FDE8E8;color:#C81E1E', CONVERTER: 'background:#FFF1D6;color:#B45309', FIDELIZAR: 'background:#DDF6E8;color:#15803D', MANTER: 'background:#E8EEF6;color:#4B607A', CANCELAR: 'background:#F1F1F1;color:#6B6B6B' };

  const G = { grupos: [], total: 0, cadastros: 0, carregado: false, sug: null, sugFeitas: {}, gv: 'lista', desfazer: null, flash: null, ed: null, pickId: null };

  // ------------------------------------------------------------ componentes
  const localChip = (l) => (l ? `<span class="chip local"><span class="dot ${l.toLowerCase()}"></span>${esc(LN(l))}</span>` : '<span class="chip">sem LOCAL</span>');
  function fonteChips(m) {
    const abas = String(m.abas || '').split(',').filter(Boolean);
    const out = [];
    if (m.ehPortal) out.push(`<span class="chip portal">${ms('verified')}Portal</span>`);
    for (const a of [...new Set(abas)]) if (!(a === 'PORTAL' && m.ehPortal)) out.push(`<span class="chip">${esc(C().ABA_NOME[a] || a)}</span>`);
    return out.join('');
  }
  const acChip = (a) => (a ? `<span class="chip" style="${AC_CHIP[a] || ''}">${AC_TXT[a] || esc(a)}</span>` : '');
  function barraLocais(locais) {
    const tot = LOCAIS.reduce((t, l) => t + (Number(locais[l]) || 0), 0);
    if (!tot) return '<div class="lbar"></div><div class="lbar-leg"><span>Sem postagens com LOCAL</span></div>';
    const ks = LOCAIS.filter((l) => locais[l]);
    return `<div class="lbar" role="img" aria-label="Postagens por LOCAL">${ks.map((l) => `<i class="${l.toLowerCase()}" style="width:${(100 * locais[l] / tot).toFixed(1)}%"></i>`).join('')}</div>
      <div class="lbar-leg">${ks.map((l) => `<span><span class="dot ${l.toLowerCase()}"></span><b>${esc(LN(l))}</b> ${(100 * locais[l] / tot).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}% · ${num(locais[l])} post.</span>`).join('')}</div>`;
  }
  const somaLocais = (membros) => membros.reduce((a, m) => ({ AGF: a.AGF + (Number(m.local_agf) || 0), BALCAO: a.BALCAO + (Number(m.local_balcao) || 0), METRO: a.METRO + (Number(m.local_metro) || 0) }), { AGF: 0, BALCAO: 0, METRO: 0 });
  /** Mesma regra do servidor: maior percentual de postagens; empate fica com o LOCAL do principal; escolha manual vence. */
  function localDoGrupo(modo, locais, localPrincipal) {
    if (LOCAIS.includes(modo)) return modo;
    const tot = LOCAIS.reduce((t, l) => t + locais[l], 0);
    if (!tot) return LOCAIS.includes(localPrincipal) ? localPrincipal : '';
    const max = Math.max(...LOCAIS.map((l) => locais[l]));
    const emp = LOCAIS.filter((l) => locais[l] === max);
    return emp.includes(localPrincipal) ? localPrincipal : emp[0];
  }
  const pct = (a, b) => (b ? (100 * a / b).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + '%' : '0%');

  // ------------------------------------------------------------ lista de grupos
  async function carregarGrupos() {
    const el = $('gLista');
    if (!G.carregado) el.innerHTML = '<div class="g-card"><div class="skel"></div><div class="skel"></div></div>'.repeat(2);
    try {
      const r = await C().api('/api/v2/grupos');
      G.grupos = r.grupos; G.total = r.total; G.cadastros = r.cadastros; G.carregado = true;
      desenharGrupos();
    } catch (e) {
      el.innerHTML = `<div class="g-card g-vazio"><p class="cad-msg err">${esc(e.message)}</p><button type="button" class="cad-btn" data-g-recarregar>Tentar de novo</button></div>`;
    }
  }
  function filtrados() {
    const q = norm($('gBusca').value), l = $('gLocal').value;
    return G.grupos.filter((g) => (!q || norm(g.nome).includes(q) || g.membros.some((m) => norm(m.nome).includes(q))) && (!l || g.local === l));
  }
  function cartaoGrupo(g) {
    const c = g.crm;
    const incompleto = g.membros.filter((m) => m.existe).length < 2;
    const confirmar = G.desfazer === g.id;
    return `<article class="g-card ${G.flash === g.id ? 'flash' : ''}" data-g="${esc(g.id)}">
      <div class="g-head"><span class="g-ic">${ms('join_inner')}</span>
        <div class="g-ttl"><b>${esc(g.nome)}</b>
          <div class="row"><span class="chip grp solid">GRUPO · ${g.membros.length} cadastros</span>${localChip(g.local)}<span class="chip ${g.localModo === 'AUTO' ? 'ok' : 'sug'}">${g.localModo === 'AUTO' ? 'LOCAL automático' : 'LOCAL manual'}</span></div></div>
        <button type="button" class="cad-btn" data-g-editar="${esc(g.id)}">${ms('edit')}Editar</button></div>
      ${incompleto ? `<div class="g-aviso">${ms('warning')}Só 1 cadastro ainda existe (os outros foram juntados pela limpeza). No CRM ele aparece sozinho até o grupo ser corrigido.</div>`
        : c && !c.emDia ? `<div class="g-aviso">${ms('sync')}O CRM ainda está com a versão anterior deste grupo. Atualiza no próximo cálculo (até 10 min).</div>` : ''}
      <div class="g-nums">
        <div><small>Fat. 30D</small><b>${c ? brl(c.fat30) : '-'}</b><em>${c ? brl(c.fat60) + ' em 31-60D' : 'CRM calculando'}</em></div>
        <div><small>No LOCAL ${esc(LN(g.local))}</small><b>${c ? brl(c.valorTotal) : '-'}</b><em>${c ? num(c.qtdTotal) + ' objetos' : '&nbsp;'}</em></div>
        <div><small>Última postagem</small><b>${c ? dataBr(c.ultima) : '-'}</b><em>${c ? num(c.diasSemPostar) + ' dias sem postar' : '&nbsp;'}</em></div>
        <div><small>No CRM</small><b>${c ? `<span class="chip">Curva ${esc(c.curva)}</span>${acChip(c.acao)}` : '-'}</b><em>${c ? (c.temContrato ? 'com contrato' : 'sem contrato') : '&nbsp;'}</em></div>
      </div>
      <div class="g-loc"><span class="lb">LOCAL</span>${barraLocais(g.locais)}</div>
      <div class="g-mem h"><span>Cadastro</span><span class="r hm">Fat. 30D</span><span class="r hm">Última</span><span class="r">Postagens</span></div>
      ${g.membros.map((m) => `<div class="g-mem ${m.noLocal === false ? 'fora' : ''}">
        <div><div class="nm">${m.principal ? ms('star', 'title="Principal: contato do grupo no CRM"') : ''}<span>${esc(m.nome || m.id)}</span></div>
          <div class="sub">${m.existe ? fonteChips(m) + localChip(m.localCarteira) : '<span class="chip sug">cadastro não existe mais</span>'}${m.noLocal === false ? `<span class="chip sug">fora do LOCAL do grupo</span>` : ''}</div></div>
        <span class="r hm">${m.fat30 === null ? '-' : brl(m.fat30)}</span><span class="r hm">${dataBr(m.ultima)}</span><span class="r"><b>${num(m.postagens)}</b></span></div>`).join('')}
      ${confirmar ? `<div class="g-confirm"><span>Desfazer o grupo? Os ${g.membros.length} cadastros voltam separados no CRM. Nada no cadastro muda. Tratativas e agenda registradas no grupo ficam no cadastro principal.</span>
          <button type="button" class="cad-btn" data-g-desf-nao>Manter grupo</button><button type="button" class="cad-btn danger" data-g-desf-sim="${esc(g.id)}">Desfazer grupo</button></div>`
        : `<div class="g-foot">${ms('history', 'style="font-size:15px"')}Criado em ${dataBr(g.criadoEm)}${g.criadoPor ? ' por ' + esc(g.criadoPor) : ''}${g.atualizadoEm && g.atualizadoEm !== g.criadoEm ? ` · alterado em ${dataBr(g.atualizadoEm)}` : ''}<span class="sp"></span><button type="button" class="cad-btn ghost" data-g-desf="${esc(g.id)}">${ms('link_off')}Desfazer grupo</button></div>`}
    </article>`;
  }
  function desenharGrupos() {
    $('gvN').textContent = G.total ? num(G.total) : '';
    const lista = filtrados();
    $('gLista').innerHTML = lista.length ? lista.map(cartaoGrupo).join('')
      : `<div class="g-card g-vazio">${ms('join_inner')}<p>${G.total ? 'Nenhum grupo com este filtro.' : 'Nenhum grupo comercial ainda. Crie o primeiro ou veja as sugestões.'}</p><button type="button" class="cad-btn grp" data-g-novo>${ms('add')}Novo grupo</button></div>`;
    if (G.flash) { const el = document.querySelector(`[data-g="${G.flash}"]`); if (el) el.scrollIntoView({ block: 'center', behavior: 'smooth' }); G.flash = null; }
  }

  // ------------------------------------------------------------ sugestões
  async function carregarSugestoes(forcar) {
    const el = $('gSug');
    if (G.sug && !forcar) return desenharSugestoes();
    el.innerHTML = '<div class="g-card"><div class="skel"></div><div class="skel"></div></div>'.repeat(2);
    try {
      const r = await C().api('/api/v2/grupos/sugestoes', { timeout: 60000 });
      G.sug = r.sugestoes; G.sugTotal = r.total; G.sugFeitas = {};
      desenharSugestoes();
    } catch (e) { el.innerHTML = `<div class="g-card g-vazio"><p class="cad-msg err">${esc(e.message)}</p></div>`; }
  }
  const MOTIVO = { NOME_BASE: 'Mesmo nome-base', INICIO_NOME: 'Mesmo início de nome', MESMO_CONTRATO: 'Mesmo contrato e nome parecido' };
  function cartaoSugestao(s, i) {
    const feito = G.sugFeitas[s.chave];
    if (feito === 'nao') return `<article class="g-card feito"><div class="gs-done" style="color:var(--c-muted)">${ms('block')}Marcado como clientes diferentes. Não volta a ser sugerido.<button type="button" class="cad-btn" data-s-volta="${i}" style="margin-left:auto">Desfazer</button></div></article>`;
    if (feito) return `<article class="g-card feito"><div class="gs-done" style="color:var(--c-ok)">${ms('check_circle')}${esc(feito)}</div></article>`;
    const baixa = s.score < 70;
    return `<article class="g-card" data-s="${i}">
      <div class="gs-head">${ms('lightbulb', 'style="font-size:16px"')}<span title="${esc(s.texto)}">${esc(s.texto || MOTIVO[s.motivo] || s.motivo)}</span><span class="gs-score ${baixa ? 'baixa' : ''}">Confiança ${s.score}${baixa ? ' · conferir' : ''}</span></div>
      ${s.alvo ? `<div class="gs-alvo">${ms('join_inner')}Entrar no grupo ${esc(s.alvo.nome)}</div>` : ''}
      ${s.clientes.map((c) => `<label class="gs-item"><input type="checkbox" data-s-chk="${esc(c.id)}" checked>
        <div><div class="gs-nome">${esc(c.nome)}</div><div class="s-meta" style="display:flex;gap:6px;flex-wrap:wrap;margin-top:4px">${fonteChips(c)}${localChip(c.localCarteira)}</div></div>
        <div class="gs-n">${num(c.postagens)} post.<small>${brl(c.valor)}</small></div></label>`).join('')}
      ${s.alvo ? '' : `<div class="gs-final"><label for="gsn${i}">Nome do grupo</label><input id="gsn${i}" value="${esc(s.nomeSugerido)}" maxlength="160"></div>`}
      <div class="gs-foot"><button type="button" class="cad-btn ghost" data-s-nao="${i}">${ms('block')}Não são o mesmo</button><button type="button" class="cad-btn grp" data-s-ok="${i}">${ms('join_inner')}${s.alvo ? 'Adicionar ao grupo' : 'Criar grupo'}</button></div>
    </article>`;
  }
  function desenharSugestoes() {
    const pend = (G.sug || []).filter((s) => !G.sugFeitas[s.chave]).length;
    $('gsN').textContent = pend ? num(pend) : '';
    $('gSug').innerHTML = (G.sug || []).length ? G.sug.map(cartaoSugestao).join('')
      : `<div class="g-card g-vazio">${ms('task_alt')}<p>Nenhuma sugestão de grupo pendente.</p></div>`;
  }
  async function aceitarSugestao(i) {
    const s = G.sug[i], card = document.querySelector(`[data-s="${i}"]`);
    const marcados = [...card.querySelectorAll('[data-s-chk]:checked')].map((x) => x.dataset.sChk);
    if (s.alvo) {
      if (!marcados.length) return C().toast('Marque pelo menos um cadastro.', 'err');
      if (!G.carregado) await carregarGrupos();
      const g = G.grupos.find((x) => x.id === s.alvo.id);
      if (!g) return C().toast('O grupo não existe mais. Recarregue a tela.', 'err');
      const r = await salvar({ id: g.id, nome: g.nome, membros: [...g.membros.map((m) => m.id), ...marcados], principalId: g.principalId, localModo: g.localModo }, `Adicionando ao grupo ${g.nome}...`);
      if (r) { G.sugFeitas[s.chave] = `${marcados.length} cadastro(s) entraram no grupo ${g.nome}.`; desenharSugestoes(); }
      return;
    }
    if (marcados.length < 2) return C().toast('Um grupo precisa de pelo menos 2 cadastros.', 'err');
    const nome = $('gsn' + i).value.trim();
    if (!nome) return C().toast('Informe o nome do grupo.', 'err');
    const principal = s.clientes.filter((c) => marcados.includes(c.id)).sort((a, b) => (b.ehPortal - a.ehPortal) || (b.valor - a.valor))[0].id;
    const r = await salvar({ nome, membros: marcados, principalId: principal, localModo: 'AUTO' }, 'Criando o grupo e recalculando o CRM...');
    if (r) { G.sugFeitas[s.chave] = `Grupo ${nome.toUpperCase()} criado com ${marcados.length} cadastros.`; desenharSugestoes(); }
  }

  // ------------------------------------------------------------ gravar
  async function salvar(corpo, msg) {
    const r = await C().acao(msg, () => C().api('/api/v2/grupos/salvar', { method: 'POST', body: corpo, timeout: 90000 }));
    if (!r) return null;
    const avisos = (r.avisos || []).join(' ');
    C().toast(`${r.criado ? 'Grupo criado.' : 'Grupo salvo.'} ${r.crmAtualizado ? 'CRM atualizado.' : 'O CRM atualiza no próximo ciclo (até 10 min).'}${avisos ? ' ' + avisos : ''}`, avisos ? '' : 'ok');
    G.flash = r.grupoId;
    await Promise.all([carregarGrupos(), C().carregarResumo()]);
    if (C().fichaAberta()) C().abrirFicha(C().fichaAberta());
    if (C().st.modo === 'lista') C().carregarLista();
    if (G.gv !== 'sug') G.sug = null;                                      // sugestões mudam depois de um grupo novo
    return r;
  }
  async function desfazer(id) {
    const r = await C().acao('Desfazendo o grupo e recalculando o CRM...', () => C().api('/api/v2/grupos/desfazer', { method: 'POST', body: { id }, timeout: 90000 }));
    if (!r) return;
    C().toast(`Grupo ${r.nome} desfeito. ${r.crmAtualizado ? 'O CRM já mostra os cadastros separados.' : 'O CRM atualiza no próximo ciclo (até 10 min).'}`, 'ok');
    G.desfazer = null;
    await Promise.all([carregarGrupos(), C().carregarResumo()]);
    if (C().fichaAberta()) C().abrirFicha(C().fichaAberta());
    G.sug = null; if (G.gv === 'sug') carregarSugestoes(true);
  }

  // ------------------------------------------------------------ editor
  const membroDeGrupo = (m) => ({ id: m.id, nome: m.nome, ehPortal: m.ehPortal, abas: m.abas, localCarteira: m.localCarteira, postagens: m.postagens, valor: m.valor, ultima: m.ultima,
    local_agf: m.local_agf, local_balcao: m.local_balcao, local_metro: m.local_metro });
  const membroDeBusca = (x) => ({ id: x.id, nome: x.nome, ehPortal: !!Number(x.eh_portal), abas: x.abas || '', localCarteira: x.local_carteira || '', postagens: Number(x.postagens) || 0,
    valor: Number(x.valor) || 0, ultima: x.ultima || '', local_agf: Number(x.local_agf) || 0, local_balcao: Number(x.local_balcao) || 0, local_metro: Number(x.local_metro) || 0 });
  function abrirEditor(g, pre) {
    G.ed = g ? { id: g.id, nome: g.nome, membros: g.membros.filter((m) => m.existe).map(membroDeGrupo), principal: g.principalId, localModo: g.localModo, res: [] }
      : { id: '', nome: pre ? pre.nome : '', membros: pre ? [pre] : [], principal: pre ? pre.id : '', localModo: 'AUTO', res: [] };
    $('gedTitulo').textContent = g ? 'Editar grupo comercial' : 'Novo grupo comercial';
    $('gedNome').value = G.ed.nome; $('gedBusca').value = ''; $('gedErr').textContent = '';
    desenharEditor();
    $('dlgGrupo').showModal();
    setTimeout(() => (g ? $('gedBusca') : $('gedNome')).focus(), 30);
  }
  function desenharEditor() {
    const E = G.ed;
    if (!E.membros.some((m) => m.id === E.principal)) E.principal = (E.membros[0] || {}).id || '';
    $('gedN').textContent = E.membros.length;
    $('gedMembros').innerHTML = E.membros.length ? E.membros.map((m) => `<div class="ged-m">
        <input type="radio" name="gedPrin" value="${esc(m.id)}" ${E.principal === m.id ? 'checked' : ''} aria-label="Principal: ${esc(m.nome)}" title="Principal (contato do grupo no CRM)">
        <div><div class="nm">${esc(m.nome)}</div><div class="sub">${fonteChips(m)}${localChip(m.localCarteira)}<span>${num(m.postagens)} post. · ${brl(m.valor)}</span></div></div>
        <button type="button" class="rm" data-ged-rm="${esc(m.id)}" aria-label="Tirar ${esc(m.nome)} do grupo" title="Tirar do grupo">${ms('close')}</button></div>`).join('')
      : '<div class="ged-vazio">Busque ao lado e adicione os cadastros que são o mesmo cliente comercial.</div>';
    desenharBusca();
    const locais = somaLocais(E.membros), tot = LOCAIS.reduce((t, l) => t + locais[l], 0);
    const prin = E.membros.find((m) => m.id === E.principal);
    const auto = localDoGrupo('AUTO', locais, prin ? prin.localCarteira : '');
    const final = localDoGrupo(E.localModo, locais, prin ? prin.localCarteira : '');
    const multi = LOCAIS.filter((l) => locais[l]).length > 1;
    $('gedLoc').innerHTML = E.membros.length ? `<div class="top"><b>LOCAL da carteira</b>${localChip(final)}<span class="chip ${E.localModo === 'AUTO' ? 'ok' : 'sug'}">${E.localModo === 'AUTO' ? 'automático' : 'manual'}</span>
        <select id="gedLocSel" aria-label="LOCAL do grupo"><option value="AUTO" ${E.localModo === 'AUTO' ? 'selected' : ''}>Automático: ${auto ? esc(LN(auto)) + ' (' + pct(locais[auto] || 0, tot) + ' das postagens)' : 'sem postagens'}</option>
          ${LOCAIS.map((l) => `<option value="${l}" ${E.localModo === l ? 'selected' : ''}>Fixar em ${esc(LN(l))}</option>`).join('')}</select></div>
      ${barraLocais(locais)}
      ${E.localModo !== 'AUTO' && final !== auto && tot ? `<div class="ged-warn">${ms('warning')}<span>LOCAL fixado em ${esc(LN(final))}, mas ${pct(locais[auto], tot)} das postagens são em ${esc(LN(auto))}. No CRM, só as postagens em ${esc(LN(final))} entram no cálculo.</span></div>` : ''}
      ${E.localModo === 'AUTO' && multi ? `<div class="ged-warn info">${ms('info')}<span>Cadastros em mais de um LOCAL. O grupo fica em ${esc(LN(auto))} e as postagens dos outros LOCAIS ficam fora do cálculo do CRM.</span></div>` : ''}`
      : '<div class="ged-vazio" style="padding:4px">O LOCAL aparece quando houver cadastros no grupo.</div>';
    const ult = E.membros.map((m) => m.ultima).filter(Boolean).sort().pop();
    $('gedPrev').innerHTML = `<div class="t">${ms('visibility', 'style="font-size:16px"')}Como fica no CRM</div>` + (E.membros.length
      ? `<div><small>Cadastros somados</small><b>${num(E.membros.length)}</b></div><div><small>Postagens no LOCAL ${esc(LN(final))}</small><b>${num(locais[final] || 0)}</b></div>
         <div><small>Última postagem</small><b>${dataBr(ult)}</b></div><div><small>Fora do LOCAL</small><b>${num(tot - (locais[final] || 0))} post.</b></div>`
      : '<div style="grid-column:1/-1;font-size:12.5px;color:var(--c-muted)">Adicione cadastros para ver a prévia.</div>');
  }
  function desenharBusca() {
    const E = G.ed, q = $('gedBusca').value.trim();
    if (q.length < 2) { $('gedRes').innerHTML = '<div class="ged-vazio">Digite 2 letras ou mais do nome.</div>'; return; }
    if (E.buscando) { $('gedRes').innerHTML = '<div class="ged-vazio"><span class="cad-spin"></span></div>'; return; }
    const lista = E.res.filter((x) => !E.membros.some((m) => m.id === x.id));
    $('gedRes').innerHTML = lista.length ? lista.map((x) => {
      const bloq = x.grupo_id && x.grupo_id !== E.id;
      return `<div class="ged-add ${bloq ? 'bloq' : ''}"><div><div class="nm">${esc(x.nome)}</div><div class="sub">${fonteChips(membroDeBusca(x))}${localChip(x.local_carteira)}${bloq ? `<span class="chip grp">no grupo ${esc(x.grupo_nome)}</span>` : `<span>${num(x.postagens)} post.</span>`}</div></div>
        ${bloq ? '<span class="chip" title="Um cadastro só pode estar em um grupo">bloqueado</span>' : `<button type="button" class="cad-btn" data-ged-add="${esc(x.id)}">${ms('add')}Adicionar</button>`}</div>`;
    }).join('') : `<div class="ged-vazio">${E.res.length ? 'Os cadastros com esse nome já estão neste grupo.' : 'Nenhum cadastro com esse nome.'}</div>`;
  }
  let buscaT;
  $('gedBusca').addEventListener('input', () => {
    clearTimeout(buscaT);
    const E = G.ed, q = $('gedBusca').value.trim();
    if (q.length < 2) { E.res = []; desenharBusca(); return; }
    E.buscando = true; desenharBusca();
    buscaT = setTimeout(async () => {
      try { const r = await C().api('/api/v2/busca?q=' + encodeURIComponent(q)); if ($('gedBusca').value.trim() === q) E.res = r.clientes || []; }
      catch (e) { E.res = []; $('gedErr').textContent = e.message; }
      E.buscando = false; desenharBusca();
    }, 280);
  });
  $('dlgGrupo').addEventListener('click', (e) => {
    const t = e.target.closest('button,input[type=radio]');
    if (!t) return;
    if (t.hasAttribute('data-ged-fechar')) { $('dlgGrupo').close(); return; }
    const E = G.ed;
    if (t.dataset.gedAdd) { const x = E.res.find((y) => y.id === t.dataset.gedAdd); if (x) E.membros.push(membroDeBusca(x)); if (!E.nome && E.membros.length === 1) $('gedNome').value = x.nome; desenharEditor(); $('gedBusca').focus(); }
    else if (t.dataset.gedRm) { E.membros = E.membros.filter((m) => m.id !== t.dataset.gedRm); desenharEditor(); }
    else if (t.name === 'gedPrin') { E.principal = t.value; desenharEditor(); }
  });
  $('dlgGrupo').addEventListener('change', (e) => { if (e.target.id === 'gedLocSel') { G.ed.localModo = e.target.value; desenharEditor(); } });
  $('gedForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const E = G.ed;
    E.nome = $('gedNome').value.trim();
    const erro = !E.nome ? 'Informe o nome do grupo.' : E.membros.length < 2 ? 'O grupo precisa de pelo menos 2 cadastros.' : '';
    if (erro) { $('gedErr').textContent = erro; return; }
    $('gedErr').textContent = '';
    $('dlgGrupo').close();
    const r = await salvar({ id: E.id, nome: E.nome, membros: E.membros.map((m) => m.id), principalId: E.principal, localModo: E.localModo }, E.id ? 'Salvando o grupo e recalculando o CRM...' : 'Criando o grupo e recalculando o CRM...');
    if (!r) $('dlgGrupo').showModal();                                      // erro (ex.: cadastro já em outro grupo): volta ao editor
    else if (G.gv !== 'lista' && C().st.modo === 'grupos') { G.gv = 'lista'; aplicarGv(); }
  });

  // ------------------------------------------------------------ ficha do cadastro
  function secaoFicha(r) {
    const g = r.grupo;
    if (g) {
      const eu = g.membros.find((m) => m.id === r.cliente.id);
      return `<div class="f-sec f-grp"><h3>${ms('join_inner')}Grupo comercial <em>só para o CRM</em></h3>
        <div class="f-grp-box"><span class="g-ic">${ms('join_inner')}</span><div style="min-width:0"><b>${esc(g.nome)}</b>
          <small>${num(g.membros.length)} cadastros · LOCAL ${esc(LN(g.local))}${eu && eu.principal ? ' · este é o principal' : ''}${g.crm ? ' · Fat. 30D ' + brl(g.crm.fat30) : ''}</small></div></div>
        <div class="f-actions"><button type="button" class="cad-btn" data-fg-abrir="${esc(g.id)}">${ms('open_in_new')}Abrir grupo</button>
          <button type="button" class="cad-btn" data-fg-editar="${esc(g.id)}">${ms('edit')}Editar grupo</button>
          <button type="button" class="cad-btn ghost" data-fg-sair="${esc(g.id)}">${ms('logout')}Tirar deste grupo</button></div></div>`;
    }
    return `<div class="f-sec f-grp"><h3>${ms('join_inner')}Grupo comercial <em>só para o CRM</em></h3>
      <p class="f-sub" style="margin:0 0 8px">Não está em nenhum grupo. No CRM aparece sozinho.</p>
      <div class="f-actions"><button type="button" class="cad-btn grp" data-fg-incluir>${ms('join_inner')}Incluir em grupo</button></div></div>`;
  }
  function ligarFicha(el, r) {
    const c = r.cliente, g = r.grupo;
    const b = (sel) => el.querySelector(sel);
    if (b('[data-fg-abrir]')) b('[data-fg-abrir]').addEventListener('click', () => { G.flash = g.id; G.gv = 'lista'; C().trocarModo('grupos'); });
    if (b('[data-fg-editar]')) b('[data-fg-editar]').addEventListener('click', () => abrirEditor(g));
    if (b('[data-fg-sair]')) b('[data-fg-sair]').addEventListener('click', async () => {
      const ficam = g.membros.filter((m) => m.id !== c.id && m.existe);
      if (ficam.length < 2) { C().toast('O grupo ficaria com 1 cadastro. Para separar, use Desfazer grupo na tela de grupos.', 'err'); return; }
      if (!confirm(`Tirar ${c.nome} do grupo ${g.nome}?\n\nEle volta a aparecer sozinho no CRM. Nada no cadastro muda.`)) return;
      const principal = g.principalId === c.id ? ficam.sort((a, b2) => b2.valor - a.valor)[0].id : g.principalId;
      await salvar({ id: g.id, nome: g.nome, membros: ficam.map((m) => m.id), principalId: principal, localModo: g.localModo }, 'Tirando do grupo e recalculando o CRM...');
    });
    if (b('[data-fg-incluir]')) b('[data-fg-incluir]').addEventListener('click', () => abrirPick(c, r));
  }
  async function abrirPick(c, r) {
    if (!G.carregado) await carregarGrupos();
    const eu = { id: c.id, nome: c.nome, ehPortal: !!c.portal_chave, abas: (r.abas || []).map((a) => a.aba).join(','), localCarteira: c.local_carteira || '',
      postagens: (r.abas || []).reduce((t, a) => t + (Number(a.postagens) || 0), 0), valor: (r.locais || []).reduce((t, l) => t + (Number(l.valor) || 0), 0),
      ultima: (r.grafias || []).map((x) => x.ultima).filter(Boolean).sort().pop() || '',
      local_agf: (r.locais.find((l) => l.local_codigo === 'AGF') || {}).postagens || 0, local_balcao: (r.locais.find((l) => l.local_codigo === 'BALCAO') || {}).postagens || 0,
      local_metro: (r.locais.find((l) => l.local_codigo === 'METRO') || {}).postagens || 0 };
    G.pick = eu;
    $('gpickTx').textContent = `Escolha o grupo de ${c.nome} ou crie um novo. Um cadastro só pode estar em um grupo.`;
    $('gpickLista').innerHTML = G.grupos.map((g) => `<button type="button" data-gp="${esc(g.id)}"><span class="g-ic" style="width:32px;height:32px">${ms('join_inner', 'style="font-size:18px"')}</span><span><b>${esc(g.nome)}</b><small>${num(g.membros.length)} cadastros · LOCAL ${esc(LN(g.local))}</small></span></button>`).join('')
      + `<button type="button" data-gp="novo"><span class="g-ic" style="width:32px;height:32px;background:var(--grp);color:#fff">${ms('add', 'style="font-size:18px"')}</span><span><b>Criar grupo novo</b><small>Começa com este cadastro</small></span></button>`;
    $('dlgGrupoPick').showModal();
  }
  $('dlgGrupoPick').addEventListener('click', async (e) => {
    const t = e.target.closest('button');
    if (!t) return;
    if (t.hasAttribute('data-gpick-fechar')) { $('dlgGrupoPick').close(); return; }
    if (!t.dataset.gp) return;
    $('dlgGrupoPick').close();
    if (t.dataset.gp === 'novo') { abrirEditor(null, G.pick); return; }
    const g = G.grupos.find((x) => x.id === t.dataset.gp);
    if (g) abrirEditor(g); if (g) { G.ed.membros.push(G.pick); desenharEditor(); }   // abre o editor já com o cadastro: ela confere e salva
  });

  // ------------------------------------------------------------ eventos da tela
  function aplicarGv() {
    document.querySelectorAll('[data-gv]').forEach((b) => b.classList.toggle('on', b.dataset.gv === G.gv));
    $('gLista').hidden = G.gv !== 'lista'; $('gSug').hidden = G.gv !== 'sug';
    if (G.gv === 'sug') carregarSugestoes(); else if (G.carregado) desenharGrupos();
  }
  $('vistaGrupos').addEventListener('click', async (e) => {
    const t = e.target.closest('button');
    if (!t) return;
    if (t.dataset.gv) { G.gv = t.dataset.gv; aplicarGv(); }
    else if (t.id === 'gNovo' || t.hasAttribute('data-g-novo')) abrirEditor(null);
    else if (t.hasAttribute('data-g-recarregar')) carregarGrupos();
    else if (t.dataset.gEditar) { const g = G.grupos.find((x) => x.id === t.dataset.gEditar); if (g) abrirEditor(g); }
    else if (t.dataset.gDesf) { G.desfazer = t.dataset.gDesf; desenharGrupos(); }
    else if (t.hasAttribute('data-g-desf-nao')) { G.desfazer = null; desenharGrupos(); }
    else if (t.dataset.gDesfSim) desfazer(t.dataset.gDesfSim);
    else if (t.dataset.sOk) aceitarSugestao(Number(t.dataset.sOk));
    else if (t.dataset.sNao) {
      const s = G.sug[Number(t.dataset.sNao)];
      const ok = await C().acao('Registrando...', () => C().api('/api/v2/grupos/sugestoes/rejeitar', { method: 'POST', body: { chave: s.chave } }));
      if (ok) { G.sugFeitas[s.chave] = 'nao'; desenharSugestoes(); }
    } else if (t.dataset.sVolta) {
      const s = G.sug[Number(t.dataset.sVolta)];
      const ok = await C().acao('Desfazendo...', () => C().api('/api/v2/grupos/sugestoes/restaurar', { method: 'POST', body: { chave: s.chave } }));
      if (ok) { delete G.sugFeitas[s.chave]; desenharSugestoes(); }
    }
  });
  let bt;
  $('gBusca').addEventListener('input', () => { clearTimeout(bt); bt = setTimeout(() => G.carregado && desenharGrupos(), 200); });
  $('gLocal').addEventListener('change', () => G.carregado && desenharGrupos());

  window.AGF_CAD_GRUPOS = {
    abrir() { G.sug = null; aplicarGv(); carregarGrupos(); },
    secaoFicha, ligarFicha,
  };
})();
