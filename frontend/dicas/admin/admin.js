/* ============================================================================
   /dicas/admin - curadoria da Vitrine do Lojista
   Autenticação: chave ADMIN_TOKEN do Worker (Bearer). Guardada na sessão
   (ou no aparelho, se "Lembrar" marcado).
   ========================================================================== */
(function () {
  'use strict';

  /* ---------------------------------------------------------------- CFG */
  var CFG = window.AGF_DICAS_CONFIG || {};
  var API = String(CFG.apiUrl || '').replace(/\/+$/, '');
  var TOKEN_KEY = 'agf_dicas_admin_token';
  var LOG = '[dicas-admin]';

  var state = { token: '', status: null, cats: [], prods: [], mapa: {}, editId: null };
  var $ = function (id) { return document.getElementById(id); };

  /* ------------------------------------------------------------ HELPERS */
  function esc(s) {
    return String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function norm(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }
  function brl(n) { return Number(n).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); }
  function num(n) { return Number(n || 0).toLocaleString('pt-BR'); }
  function cor(c) { return /^#[0-9a-fA-F]{6}$/.test(c || '') ? c : '#00416B'; }
  function ic(i) { return String(i || 'sell').replace(/[^a-z0-9_]/g, '') || 'sell'; }
  function ss(k, v) { try { if (v === undefined) return sessionStorage.getItem(k); if (v === null) sessionStorage.removeItem(k); else sessionStorage.setItem(k, v); } catch (e) { return null; } }
  function ls(k, v) { try { if (v === undefined) return localStorage.getItem(k); if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { return null; } }

  var tToast = null;
  function toast(msg, erro) {
    var t = $('ad-toast');
    t.textContent = msg;
    t.classList.toggle('is-err', Boolean(erro));
    t.classList.add('is-on');
    clearTimeout(tToast);
    tToast = setTimeout(function () { t.classList.remove('is-on'); }, erro ? 5200 : 2800);
  }

  function ocupado(btn, on) { if (btn) { btn.classList.toggle('is-busy', on); btn.disabled = on; } }

  function api(caminho, opts) {
    opts = opts || {};
    if (!API) return Promise.reject(new Error('apiUrl não configurado em /dicas/dicas-config.js.'));
    var h = { Authorization: 'Bearer ' + state.token };
    if (opts.body !== undefined) h['Content-Type'] = 'application/json';
    return fetch(API + caminho, { method: opts.method || 'GET', headers: h, body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined })
      .then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (d) {
          if (r.status === 401) { sair(true); throw new Error(d.erro || 'Sessão expirada.'); }
          if (!r.ok || d.ok === false) throw new Error(d.erro || ('Erro ' + r.status));
          return d;
        });
      }, function () { throw new Error('Sem conexão com a API da vitrine.'); });
  }

  /* ---------------------------------------------------------- SESSÃO */
  function mostrar(logado) {
    $('ad-login').hidden = logado;
    $('ad-app').hidden = !logado;
    $('ad-sair').hidden = !logado;
  }

  function sair(expirou) {
    state.token = '';
    ss(TOKEN_KEY, null); ls(TOKEN_KEY, null);
    mostrar(false);
    if (expirou) $('ad-login-msg').textContent = 'Chave inválida ou expirada. Entre de novo.';
  }

  $('ad-login-form').addEventListener('submit', function (ev) {
    ev.preventDefault();
    var tk = $('ad-token').value.trim();
    var btn = $('ad-login-btn');
    $('ad-login-msg').textContent = '';
    if (tk.length < 16) { $('ad-login-msg').textContent = 'A chave tem pelo menos 16 caracteres.'; return; }
    state.token = tk;
    ocupado(btn, true);
    api('/api/admin/status').then(function (st) {
      if ($('ad-lembrar').checked) ls(TOKEN_KEY, tk); else ss(TOKEN_KEY, tk);
      $('ad-token').value = '';
      state.status = st;
      mostrar(true);
      return carregarTudo();
    }).catch(function (e) {
      state.token = '';
      $('ad-login-msg').textContent = e.message;
    }).then(function () { ocupado(btn, false); });
  });
  $('ad-sair').addEventListener('click', function () { sair(false); });

  /* ------------------------------------------------------------ DADOS */
  function carregarTudo() {
    return Promise.all([api('/api/admin/status'), api('/api/admin/catalogo')]).then(function (r) {
      state.status = r[0];
      state.cats = r[1].categorias;
      state.prods = r[1].produtos;
      state.mapa = {};
      state.cats.forEach(function (c) { state.mapa[c.id] = c; });
      renderStatus();
      renderSelects();
      renderLista();
      renderCats();
    }).catch(function (e) { toast(e.message, true); });
  }

  function recarregarStatus() {
    return api('/api/admin/status').then(function (st) { state.status = st; renderStatus(); }).catch(function () {});
  }

  /* --------------------------------------------------------- STATUS */
  function renderStatus() {
    var s = state.status || {};
    $('st-ativos').textContent = num(s.ativos);
    $('st-cliques').textContent = num(s.cliques);
    $('st-c7').textContent = num(s.cliques7d);
    $('st-semfoto').textContent = num(s.ativosSemFoto);
  }

  /* ------------------------------------------------------------- ABAS */
  document.querySelector('.ad-tabs').addEventListener('click', function (ev) {
    var b = ev.target.closest('[data-tab]');
    if (!b) return;
    selecionarAba(b.getAttribute('data-tab'));
  });
  function selecionarAba(id) {
    ['produtos', 'categorias'].forEach(function (t) {
      $('tab-' + t).setAttribute('aria-selected', String(t === id));
      $('pn-' + t).hidden = t !== id;
    });
  }

  /* ---------------------------------------------------------- SELECTS */
  function renderSelects() {
    var opts = state.cats.map(function (c) { return '<option value="' + esc(c.id) + '">' + esc(c.nome) + (c.ativo ? '' : ' (inativa)') + '</option>'; }).join('');
    var atual = $('pf-cat').value;
    $('pf-cat').innerHTML = '<option value="">Todas as categorias</option>' + opts;
    $('pf-cat').value = atual;
    document.querySelector('#ad-form [name="categoriaId"]').innerHTML = opts;
  }

  /* ----------------------------------------------------------- LISTA */
  function thumb(p) {
    var c = state.mapa[p.categoriaId] || {};
    var inner = /^https:\/\//.test(p.imagemUrl || '')
      ? '<img src="' + esc(p.imagemUrl) + '" alt="" loading="lazy" referrerpolicy="no-referrer" />'
      : '<span class="material-symbols-rounded" aria-hidden="true">' + ic(p.icone || c.icone) + '</span>';
    return '<span class="ad-thumb" style="--c:' + cor(c.cor) + '">' + inner + '</span>';
  }

  function filtrados() {
    var q = norm($('pf-q').value).trim(), cat = $('pf-cat').value, sit = $('pf-sit').value;
    return state.prods.filter(function (p) {
      if (cat && p.categoriaId !== cat) return false;
      if (sit === 'semfoto' && (/^https:\/\//.test(p.imagemUrl || '') || !p.ativo)) return false;
      if (sit === 'kit' && !p.destaque) return false;
      if (sit === 'inativo' && p.ativo) return false;
      if (q && norm(p.titulo + ' ' + p.dica + ' ' + p.loja).indexOf(q) < 0) return false;
      return true;
    });
  }

  function renderLista() {
    var lista = filtrados();
    $('pf-count').textContent = lista.length + ' de ' + state.prods.length + ' produtos';
    if (!lista.length) { $('ad-lista').innerHTML = '<div class="ad-empty">Nenhum produto com esses filtros.</div>'; return; }
    var html = '', grupo = '';
    var ordemCat = {};
    state.cats.forEach(function (c, i) { ordemCat[c.id] = i; });
    lista.sort(function (a, b) { return (ordemCat[a.categoriaId] - ordemCat[b.categoriaId]) || (a.ordem - b.ordem) || (a.id - b.id); });
    lista.forEach(function (p) {
      var c = state.mapa[p.categoriaId] || { nome: p.categoriaId };
      if (c.id !== grupo) {
        grupo = c.id;
        html += '<div class="ad-group" style="--c:' + cor(c.cor) + '"><span class="material-symbols-rounded" aria-hidden="true">' + ic(c.icone) + '</span>' + esc(c.nome) + '</div>';
      }
      var badges = [];
      if (p.destaque) badges.push('<span class="ad-badge ad-badge--kit">Kit</span>');
      if (p.dominio) badges.push('<span class="ad-badge ad-badge--link" title="' + esc(p.link) + '"><span class="material-symbols-rounded" aria-hidden="true">link</span>' + esc(p.dominio) + '</span>');
      if (!/^https:\/\//.test(p.imagemUrl || '')) badges.push('<span class="ad-badge ad-badge--noimg">Sem foto</span>');
      if (!p.ativo) badges.push('<span class="ad-badge ad-badge--off">Inativo</span>');
      var preco = p.precoMin ? brl(p.precoMin) : 'sem preço';
      html += '<div class="ad-row' + (p.ativo ? '' : ' is-off') + '" data-id="' + p.id + '">' +
        thumb(p) +
        '<div style="min-width:0"><p class="ad-row-title" title="' + esc(p.titulo) + '">' + esc(p.titulo) + '</p>' +
          '<div class="ad-row-sub">' + badges.join('') + '<span>· ' + preco + '</span><span>· ordem ' + p.ordem + '</span></div></div>' +
        '<div class="ad-clicks"><strong>' + num(p.cliques7d) + '</strong><small>7 dias · ' + num(p.cliques) + ' total</small></div>' +
        '<div class="ad-row-actions">' +
          '<button type="button" class="ad-tg" data-act="kit" aria-pressed="' + Boolean(p.destaque) + '" title="Kit inicial" aria-label="Kit inicial"><span class="material-symbols-rounded" aria-hidden="true">workspace_premium</span></button>' +
          '<button type="button" class="ad-tg" data-act="ativo" aria-pressed="' + Boolean(p.ativo) + '" title="Ativo na vitrine" aria-label="Ativo na vitrine"><span class="material-symbols-rounded" aria-hidden="true">visibility</span></button>' +
          '<a class="ad-tg" href="' + esc(p.link) + '" target="_blank" rel="noopener" title="Testar link" aria-label="Testar link"><span class="material-symbols-rounded" aria-hidden="true">open_in_new</span></a>' +
          '<button type="button" class="ad-tg" data-act="editar" title="Editar" aria-label="Editar"><span class="material-symbols-rounded" aria-hidden="true">edit</span></button>' +
        '</div></div>';
    });
    $('ad-lista').innerHTML = html;
  }

  ['pf-q', 'pf-cat', 'pf-sit'].forEach(function (id) { $(id).addEventListener('input', renderLista); });

  function substituirProduto(prod) {
    var i = state.prods.findIndex(function (x) { return x.id === prod.id; });
    var antigo = i >= 0 ? state.prods[i] : {};
    prod.cliques7d = antigo.cliques7d || prod.cliques7d || 0;
    if (i >= 0) state.prods[i] = prod; else state.prods.push(prod);
  }

  $('ad-lista').addEventListener('click', function (ev) {
    var b = ev.target.closest('button[data-act]');
    if (!b) return;
    var id = Number(b.closest('.ad-row').getAttribute('data-id'));
    var p = state.prods.find(function (x) { return x.id === id; });
    if (!p) return;
    var act = b.getAttribute('data-act');
    if (act === 'editar') { abrirForm(p); return; }
    var corpo = act === 'kit' ? { destaque: !p.destaque } : { ativo: !p.ativo };
    ocupado(b, true);
    api('/api/admin/produtos/' + id, { method: 'PUT', body: corpo }).then(function (r) {
      substituirProduto(r.produto);
      renderLista();
      recarregarStatus();
      toast(act === 'kit' ? (r.produto.destaque ? 'Adicionado ao kit inicial.' : 'Removido do kit inicial.') : (r.produto.ativo ? 'Produto ativo na vitrine.' : 'Produto oculto da vitrine.'));
    }).catch(function (e) { toast(e.message, true); ocupado(b, false); });
  });

  /* --------------------------------------------------------- FORMULÁRIO */
  var dlg = $('ad-dlg'), form = $('ad-form');
  function campo(n) { return form.elements[n]; }
  function fmtNum(v) { return v === null || v === undefined ? '' : String(v).replace('.', ','); }

  function abrirForm(p) {
    state.editId = p ? p.id : null;
    $('dlg-title').textContent = p ? 'Editar produto' : 'Novo produto';
    $('f-msg').textContent = '';
    $('f-excluir').hidden = !p;
    form.reset();
    var d = p || { categoriaId: $('pf-cat').value || (state.cats[0] && state.cats[0].id), ativo: 1, destaque: 0 };
    campo('titulo').value = d.titulo || '';
    campo('categoriaId').value = d.categoriaId || '';
    campo('icone').value = d.icone || '';
    campo('link').value = d.link || '';
    campo('imagemUrl').value = d.imagemUrl || '';
    campo('dica').value = d.dica || '';
    campo('precoMin').value = fmtNum(d.precoMin);
    campo('precoMax').value = fmtNum(d.precoMax);
    campo('avaliacao').value = fmtNum(d.avaliacao);
    campo('vendas').value = d.vendas === null || d.vendas === undefined ? '' : d.vendas;
    campo('loja').value = d.loja || '';
    campo('ordem').value = d.ordem || '';
    campo('destaque').checked = Boolean(d.destaque);
    campo('ativo').checked = d.ativo === undefined ? true : Boolean(d.ativo);
    atualizarPreview();
    if (dlg.showModal) dlg.showModal(); else dlg.setAttribute('open', '');
    setTimeout(function () { campo('titulo').focus(); }, 30);
  }
  function fecharForm() { if (dlg.close) dlg.close(); else dlg.removeAttribute('open'); }

  function dominio(link) {
    try { var u = new URL(link); return u.protocol === 'https:' ? u.hostname.replace(/^www\./, '') : null; } catch (e) { return null; }
  }

  function atualizarPreview() {
    var c = state.mapa[campo('categoriaId').value] || {};
    var img = campo('imagemUrl').value.trim();
    var pv = $('f-preview');
    pv.style.setProperty('--c', cor(c.cor));
    pv.innerHTML = /^https:\/\//.test(img)
      ? '<img src="' + esc(img) + '" alt="" referrerpolicy="no-referrer" onerror="this.replaceWith(Object.assign(document.createElement(\'span\'),{className:\'material-symbols-rounded\',textContent:\'broken_image\'}))" />'
      : '<span class="material-symbols-rounded">' + ic(campo('icone').value || c.icone) + '</span>';
    var dom = dominio(campo('link').value.trim());
    var tag = $('f-af');
    tag.textContent = dom ? '· abre em ' + dom : '';
    tag.style.color = 'var(--green-700)';
  }
  ['categoriaId', 'imagemUrl', 'icone', 'link'].forEach(function (n) { campo(n).addEventListener('input', atualizarPreview); });

  form.addEventListener('click', function (ev) { if (ev.target.closest('[data-close]')) fecharForm(); });
  dlg.addEventListener('click', function (ev) { if (ev.target === dlg) fecharForm(); });
  $('ad-novo').addEventListener('click', function () { abrirForm(null); });

  form.addEventListener('submit', function (ev) {
    ev.preventDefault();
    var msg = $('f-msg');
    msg.textContent = '';
    if (campo('titulo').value.trim().length < 3) { msg.textContent = 'Informe um título com pelo menos 3 letras.'; campo('titulo').focus(); return; }
    if (!/^https:\/\//.test(campo('link').value.trim())) { msg.textContent = 'O link precisa começar com https://'; campo('link').focus(); return; }
    var img = campo('imagemUrl').value.trim();
    if (img && !/^https:\/\//.test(img)) { msg.textContent = 'O link da imagem precisa começar com https://'; campo('imagemUrl').focus(); return; }
    var corpo = {
      titulo: campo('titulo').value.trim(),
      categoriaId: campo('categoriaId').value,
      icone: campo('icone').value.trim(),
      link: campo('link').value.trim(),
      imagemUrl: img,
      dica: campo('dica').value.trim(),
      precoMin: campo('precoMin').value.trim(),
      precoMax: campo('precoMax').value.trim(),
      avaliacao: campo('avaliacao').value.trim(),
      vendas: campo('vendas').value.trim(),
      loja: campo('loja').value.trim(),
      ordem: campo('ordem').value.trim(),
      destaque: campo('destaque').checked,
      ativo: campo('ativo').checked
    };
    var btn = $('f-salvar');
    ocupado(btn, true);
    var req = state.editId
      ? api('/api/admin/produtos/' + state.editId, { method: 'PUT', body: corpo })
      : api('/api/admin/produtos', { method: 'POST', body: corpo });
    req.then(function (r) {
      substituirProduto(r.produto);
      renderLista();
      recarregarStatus();
      fecharForm();
      toast(state.editId ? 'Produto atualizado.' : 'Produto criado.');
    }).catch(function (e) { msg.textContent = e.message; }).then(function () { ocupado(btn, false); });
  });

  $('f-excluir').addEventListener('click', function () {
    var id = state.editId;
    var p = state.prods.find(function (x) { return x.id === id; });
    if (!p || !window.confirm('Excluir "' + p.titulo + '"? Os cliques dele também serão apagados. Para só esconder, desmarque "Ativo".')) return;
    var btn = this;
    ocupado(btn, true);
    api('/api/admin/produtos/' + id, { method: 'DELETE' }).then(function () {
      state.prods = state.prods.filter(function (x) { return x.id !== id; });
      renderLista(); recarregarStatus(); fecharForm(); toast('Produto excluído.');
    }).catch(function (e) { $('f-msg').textContent = e.message; }).then(function () { ocupado(btn, false); });
  });

  /* -------------------------------------------------------- CATEGORIAS */
  function renderCats() {
    var cont = {};
    state.prods.forEach(function (p) { cont[p.categoriaId] = (cont[p.categoriaId] || 0) + 1; });
    $('ad-cats').innerHTML = state.cats.map(function (c) {
      return '<form class="ad-catrow" data-cat="' + esc(c.id) + '">' +
        '<span class="ad-thumb" style="--c:' + cor(c.cor) + '"><span class="material-symbols-rounded" aria-hidden="true">' + ic(c.icone) + '</span></span>' +
        '<label class="ad-field"><span>Nome · ' + (cont[c.id] || 0) + ' itens</span><input name="nome" value="' + esc(c.nome) + '" maxlength="60" required /></label>' +
        '<label class="ad-field"><span>Descrição</span><input name="descricao" value="' + esc(c.descricao) + '" maxlength="200" /></label>' +
        '<label class="ad-field"><span>Ícone</span><input name="icone" value="' + esc(c.icone) + '" maxlength="40" /></label>' +
        '<label class="ad-field"><span>Ordem</span><input name="ordem" value="' + esc(c.ordem) + '" inputmode="numeric" /></label>' +
        '<label class="ad-check"><input type="checkbox" name="ativo"' + (c.ativo ? ' checked' : '') + ' /> Ativa</label>' +
        '<span class="ad-row-actions">' +
          '<button type="submit" class="ad-tg" title="Salvar" aria-label="Salvar categoria"><span class="material-symbols-rounded" aria-hidden="true">save</span></button>' +
          '<button type="button" class="ad-tg" data-del title="Excluir" aria-label="Excluir categoria"' + (cont[c.id] ? ' disabled' : '') + '><span class="material-symbols-rounded" aria-hidden="true">delete</span></button>' +
        '</span></form>';
    }).join('');
  }

  function aplicarCategoria(cat) {
    var i = state.cats.findIndex(function (c) { return c.id === cat.id; });
    if (i >= 0) state.cats[i] = cat; else state.cats.push(cat);
    state.cats.sort(function (a, b) { return a.ordem - b.ordem; });
    state.mapa[cat.id] = cat;
    renderSelects(); renderCats(); renderLista();
  }

  $('ad-cats').addEventListener('submit', function (ev) {
    ev.preventDefault();
    var f = ev.target, id = f.getAttribute('data-cat');
    var btn = f.querySelector('button[type="submit"]');
    ocupado(btn, true);
    api('/api/admin/categorias/' + encodeURIComponent(id), { method: 'PUT', body: {
      nome: f.elements.nome.value, descricao: f.elements.descricao.value, icone: f.elements.icone.value,
      ordem: f.elements.ordem.value, ativo: f.elements.ativo.checked
    } }).then(function (r) { aplicarCategoria(r.categoria); toast('Categoria salva.'); })
      .catch(function (e) { toast(e.message, true); ocupado(btn, false); });
  });

  $('ad-cats').addEventListener('click', function (ev) {
    var b = ev.target.closest('[data-del]');
    if (!b) return;
    var id = b.closest('form').getAttribute('data-cat');
    if (!window.confirm('Excluir a categoria "' + (state.mapa[id] ? state.mapa[id].nome : id) + '"?')) return;
    api('/api/admin/categorias/' + encodeURIComponent(id), { method: 'DELETE' }).then(function () {
      state.cats = state.cats.filter(function (c) { return c.id !== id; });
      delete state.mapa[id];
      renderSelects(); renderCats(); toast('Categoria excluída.');
    }).catch(function (e) { toast(e.message, true); });
  });

  var nc = $('ad-newcat');
  nc.elements.nome.addEventListener('input', function () {
    if (nc.elements.id.dataset.manual) return;
    nc.elements.id.value = norm(this.value).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  });
  nc.elements.id.addEventListener('input', function () { this.dataset.manual = '1'; });
  nc.addEventListener('submit', function (ev) {
    ev.preventDefault();
    var btn = nc.querySelector('button[type="submit"]');
    ocupado(btn, true);
    api('/api/admin/categorias', { method: 'POST', body: {
      id: nc.elements.id.value, nome: nc.elements.nome.value, descricao: nc.elements.descricao.value,
      icone: nc.elements.icone.value || 'sell', cor: nc.elements.cor.value, ordem: (state.cats.length + 1) * 10, ativo: true
    } }).then(function (r) {
      aplicarCategoria(r.categoria); nc.reset(); delete nc.elements.id.dataset.manual; toast('Categoria criada.');
    }).catch(function (e) { toast(e.message, true); }).then(function () { ocupado(btn, false); });
  });

  /* ------------------------------------------------------------- BOOT */
  if (!API) {
    mostrar(false);
    $('ad-login-msg').textContent = 'A API ainda não foi configurada (apiUrl vazio em /dicas/dicas-config.js). Rode o instalador.';
    $('ad-login-btn').disabled = true;
    return;
  }
  state.token = ss(TOKEN_KEY) || ls(TOKEN_KEY) || '';
  if (!state.token) { mostrar(false); setTimeout(function () { $('ad-token').focus(); }, 30); return; }
  mostrar(true);
  carregarTudo().then(function () { console.log(LOG, 'pronto'); });
})();
