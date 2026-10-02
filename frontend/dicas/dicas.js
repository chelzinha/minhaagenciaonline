/* ============================================================================
   /dicas - Vitrine do Lojista
   Fluxo: renderiza na hora (cache local ou catálogo de reserva) -> busca a API
   -> re-renderiza mantendo filtros. Estado espelhado na URL (?cat=&q=&ordem=).
   ========================================================================== */
(function () {
  'use strict';

  /* ---------------------------------------------------------------- CFG */
  var CFG = window.AGF_DICAS_CONFIG || {};
  var API = String(CFG.apiUrl || '').replace(/\/+$/, '');
  var LOG = '[dicas]';
  var ORDENS = ['destaque', 'preco', 'vendas', 'avaliacao', 'nome'];

  /* -------------------------------------------------------------- STATE */
  var state = {
    dados: null,
    fonte: 'base',
    cat: 'todos',
    q: '',
    ordem: 'destaque',
    carregando: false
  };

  var $ = function (id) { return document.getElementById(id); };
  var el = {
    cats: $('dc-cats'), catsScroll: $('dc-cats-scroll'), content: $('dc-content'),
    title: $('dc-res-title'), count: $('dc-count'), chip: $('dc-chip'), sort: $('dc-sort'),
    form: $('dc-search'), q: $('dc-q'), qClear: $('dc-q-clear'), updated: $('dc-updated'),
    stCat: $('dc-st-cat'), stProd: $('dc-st-prod'), stKit: $('dc-st-kit')
  };

  /* ------------------------------------------------------------ HELPERS */
  function esc(s) {
    return String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function norm(s) {
    return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
  }
  function brl(n) {
    return Number(n).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }
  function milhar(n) {
    n = Number(n);
    if (n >= 1000) return (n / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' mil';
    return String(n);
  }
  function lsGet(k) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* modo privado */ } }
  function linkSeguro(u) {
    try { var x = new URL(u); return x.protocol === 'https:' ? x.toString() : '#'; } catch (e) { return '#'; }
  }
  function corSegura(c) { return /^#[0-9a-fA-F]{6}$/.test(c || '') ? c : '#00416B'; }
  function iconeSeguro(i) { return String(i || 'sell').replace(/[^a-z0-9_]/g, '') || 'sell'; }

  /* ------------------------------------------------------------- DADOS */
  function validarDados(d) {
    return d && Array.isArray(d.categorias) && Array.isArray(d.produtos) && d.categorias.length > 0;
  }

  function prepararDados(d) {
    var cats = d.categorias.filter(function (c) { return c.ativo === undefined || c.ativo; })
      .slice().sort(function (a, b) { return (a.ordem || 0) - (b.ordem || 0); });
    var mapa = {};
    cats.forEach(function (c) { c.total = 0; mapa[c.id] = c; });
    var prods = d.produtos.filter(function (p) { return mapa[p.categoriaId]; });
    prods.forEach(function (p) {
      mapa[p.categoriaId].total++;
      p._busca = norm([p.titulo, p.dica, p.loja, mapa[p.categoriaId].nome].join(' '));
    });
    return { categorias: cats.filter(function (c) { return c.total > 0; }), mapa: mapa, produtos: prods, versao: d.versao || '', geradoEm: d.geradoEm || '' };
  }

  function carregarInicial() {
    var cache = lsGet(CFG.cacheKey || 'agf_dicas_catalogo_v1');
    if (API && cache && validarDados(cache)) { state.fonte = 'cache'; return prepararDados(cache); }
    var base = window.AGF_DICAS_BASE;
    if (validarDados(base)) { state.fonte = 'base'; return prepararDados(base); }
    return null;
  }

  function buscarApi() {
    if (!API) return Promise.resolve(null);
    var ctrl = 'AbortController' in window ? new AbortController() : null;
    var t = setTimeout(function () { if (ctrl) ctrl.abort(); }, CFG.timeoutMs || 6000);
    return fetch(API + '/api/catalogo', { signal: ctrl ? ctrl.signal : undefined, headers: { Accept: 'application/json' } })
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (d) {
        clearTimeout(t);
        if (!validarDados(d)) throw new Error('catálogo vazio ou inválido');
        lsSet(CFG.cacheKey || 'agf_dicas_catalogo_v1', { categorias: d.categorias, produtos: d.produtos, versao: d.versao, geradoEm: d.geradoEm });
        return d;
      })
      .catch(function (e) { clearTimeout(t); console.warn(LOG, 'API indisponível, mantendo catálogo local:', e.message); return null; });
  }

  function registrarClique(id) {
    if (!API || !id) return;
    var url = API + '/api/clique/' + encodeURIComponent(id);
    try {
      if (navigator.sendBeacon && navigator.sendBeacon(url, '')) return;
    } catch (e) { /* segue para fetch */ }
    try { fetch(url, { method: 'POST', keepalive: true, mode: 'cors' }).catch(function () {}); } catch (e) { /* sem rastreio */ }
  }

  /* --------------------------------------------------------------- URL */
  function lerUrl() {
    var sp = new URLSearchParams(location.search);
    state.cat = sp.get('cat') || 'todos';
    state.q = (sp.get('q') || '').slice(0, 60);
    state.ordem = ORDENS.indexOf(sp.get('ordem')) >= 0 ? sp.get('ordem') : 'destaque';
  }
  function gravarUrl() {
    var sp = new URLSearchParams();
    if (state.cat !== 'todos') sp.set('cat', state.cat);
    if (state.q) sp.set('q', state.q);
    if (state.ordem !== 'destaque') sp.set('ordem', state.ordem);
    var qs = sp.toString();
    try { history.replaceState(null, '', location.pathname + (qs ? '?' + qs : '') + location.hash); } catch (e) { /* file:// */ }
  }

  /* ----------------------------------------------------------- FILTROS */
  function filtrar() {
    var d = state.dados;
    var termos = norm(state.q).split(' ').filter(Boolean);
    return d.produtos.filter(function (p) {
      if (state.cat === 'kit' && !p.destaque) return false;
      if (state.cat !== 'todos' && state.cat !== 'kit' && p.categoriaId !== state.cat) return false;
      for (var i = 0; i < termos.length; i++) if (p._busca.indexOf(termos[i]) < 0) return false;
      return true;
    });
  }

  function ordenar(lista) {
    var ordemCat = {};
    state.dados.categorias.forEach(function (c, i) { ordemCat[c.id] = i; });
    var porPadrao = function (a, b) {
      return (b.destaque - a.destaque) || (ordemCat[a.categoriaId] - ordemCat[b.categoriaId]) || ((a.ordem || 0) - (b.ordem || 0)) || (a.id - b.id);
    };
    var nulosFim = function (va, vb, asc) {
      var na = va === null || va === undefined, nb = vb === null || vb === undefined;
      if (na && nb) return 0; if (na) return 1; if (nb) return -1;
      return asc ? va - vb : vb - va;
    };
    var fn = {
      destaque: porPadrao,
      preco: function (a, b) { return nulosFim(a.precoMin, b.precoMin, true) || porPadrao(a, b); },
      vendas: function (a, b) { return nulosFim(a.vendas, b.vendas, false) || porPadrao(a, b); },
      avaliacao: function (a, b) { return nulosFim(a.avaliacao, b.avaliacao, false) || porPadrao(a, b); },
      nome: function (a, b) { return a.titulo.localeCompare(b.titulo, 'pt-BR'); }
    }[state.ordem] || porPadrao;
    return lista.slice().sort(fn);
  }

  /* ----------------------------------------------------------- RENDER */
  function htmlArte(cat, icone) {
    return '<span class="dc-art" aria-hidden="true"><span class="dc-art-ic"><span class="material-symbols-rounded">' +
      iconeSeguro(icone || cat.icone) + '</span></span></span>';
  }

  function htmlCard(p) {
    var cat = state.dados.mapa[p.categoriaId];
    var cor = corSegura(cat.cor);
    var href = linkSeguro(p.link);
    var titulo = esc(p.titulo);
    var temImg = /^https:\/\//.test(p.imagemUrl || '');
    var thumb = temImg
      ? '<img src="' + esc(p.imagemUrl) + '" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" data-cat="' + esc(cat.id) + '" data-ic="' + esc(iconeSeguro(p.icone || cat.icone)) + '" />'
      : htmlArte(cat, p.icone);

    var meta = [];
    if (p.avaliacao) meta.push('<span class="material-symbols-rounded dc-star" aria-hidden="true">star</span><b>' + Number(p.avaliacao).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + '</b>');
    if (p.vendas) meta.push('<span>' + (meta.length ? '· ' : '') + milhar(p.vendas) + ' vendidos</span>');

    var preco;
    if (p.precoMin) {
      var faixa = p.precoMax && p.precoMax > p.precoMin;
      preco = '<div class="dc-price"><small>' + (faixa ? 'a partir de' : 'preço de referência') + '</small><strong>' + brl(p.precoMin) + '</strong></div>';
    } else {
      preco = '<div class="dc-price dc-price--none"><small>várias lojas</small><strong>Compare preços</strong></div>';
    }
    var acao = 'Onde comprar';

    return '<article class="dc-card" style="--c:' + cor + '">' +
      '<a class="dc-thumb" href="' + esc(href) + '" target="_blank" rel="noopener sponsored" data-id="' + esc(p.id) + '" tabindex="-1" aria-hidden="true">' +
        (p.destaque ? '<span class="dc-badge"><span class="material-symbols-rounded" aria-hidden="true">workspace_premium</span>Kit inicial</span>' : '') +
        thumb +
      '</a>' +
      '<div class="dc-body">' +
        '<span class="dc-tag">' + esc(cat.nome) + '</span>' +
        '<h3 class="dc-title"><a href="' + esc(href) + '" target="_blank" rel="noopener sponsored" data-id="' + esc(p.id) + '">' + titulo + '</a></h3>' +
        (meta.length ? '<div class="dc-meta">' + meta.join('') + '</div>' : '') +
        (p.loja ? '<div class="dc-shopname"><span class="material-symbols-rounded" aria-hidden="true">storefront</span>' + esc(p.loja) + '</div>' : '') +
        (p.dica ? '<p class="dc-tip is-clamped"><span class="material-symbols-rounded" aria-hidden="true">lightbulb</span><span title="' + esc(p.dica) + '">' + esc(p.dica) + '</span></p>' : '') +
        '<div class="dc-foot">' + preco +
          '<a class="dc-buy" href="' + esc(href) + '" target="_blank" rel="noopener sponsored" data-id="' + esc(p.id) + '" aria-label="' + acao + ': ' + titulo + ' (abre em nova aba)">' +
            acao + '<span class="material-symbols-rounded" aria-hidden="true">open_in_new</span></a>' +
        '</div>' +
      '</div>' +
    '</article>';
  }

  function htmlBloco(cat, lista, total, opts) {
    opts = opts || {};
    var mais = total > lista.length
      ? '<button type="button" class="dc-more" data-cat="' + esc(cat.id) + '">Ver todos (' + total + ')<span class="material-symbols-rounded" aria-hidden="true">chevron_right</span></button>'
      : '';
    return '<section class="dc-block' + (opts.kit ? ' dc-kit' : '') + '" id="' + (opts.kit ? 'kit' : 'cat-' + esc(cat.id)) + '" style="--c:' + corSegura(cat.cor) + '" aria-labelledby="h-' + esc(cat.id) + '">' +
      '<div class="dc-block-head"><div class="dc-block-title">' +
        '<span class="dc-block-ic"><span class="material-symbols-rounded" aria-hidden="true">' + iconeSeguro(cat.icone) + '</span></span>' +
        '<div><h3 id="h-' + esc(cat.id) + '">' + esc(cat.nome) + '</h3><p>' + esc(cat.descricao || '') + '</p></div>' +
      '</div>' + mais + '</div>' +
      '<div class="dc-grid' + (opts.kit ? ' dc-grid--kit' : '') + '">' + lista.map(htmlCard).join('') + '</div>' +
    '</section>';
  }

  var KIT = { id: 'kit', nome: 'Kit inicial do lojista', descricao: 'O essencial para começar a despachar com agilidade e sem retrabalho.', icone: 'workspace_premium', cor: '#B07207' };

  function renderCats() {
    var d = state.dados;
    var kitTotal = d.produtos.filter(function (p) { return p.destaque; }).length;
    var itens = [{ id: 'todos', nome: 'Todos', icone: 'apps', cor: '#00416B', total: d.produtos.length }];
    if (kitTotal) itens.push({ id: 'kit', nome: 'Kit inicial', icone: 'workspace_premium', cor: '#B07207', total: kitTotal });
    itens = itens.concat(d.categorias);
    el.catsScroll.innerHTML = itens.map(function (c) {
      return '<button type="button" class="dc-cat" data-cat="' + esc(c.id) + '" aria-pressed="' + (state.cat === c.id) + '" style="--c:' + corSegura(c.cor) + '">' +
        '<span class="dc-cat-ic"><span class="material-symbols-rounded" aria-hidden="true">' + iconeSeguro(c.icone) + '</span></span>' +
        esc(c.nome) + ' <small>' + c.total + '</small></button>';
    }).join('');
    atualizarFades();
    var ativo = el.catsScroll.querySelector('[aria-pressed="true"]');
    if (ativo && ativo.scrollIntoView) {
      var box = el.catsScroll.getBoundingClientRect(), r = ativo.getBoundingClientRect();
      if (r.left < box.left || r.right > box.right) el.catsScroll.scrollLeft += (r.left - box.left) - 16;
    }
  }

  function renderStats() {
    var d = state.dados;
    el.stCat.textContent = d.categorias.length;
    el.stProd.textContent = d.produtos.length;
    el.stKit.textContent = d.produtos.filter(function (p) { return p.destaque; }).length;
    if (el.updated) {
      el.updated.textContent = state.fonte === 'api' && d.geradoEm
        ? 'Catálogo atualizado em ' + new Date(d.geradoEm).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) + '.'
        : '';
    }
  }

  function renderConteudo() {
    var d = state.dados;
    if (state.cat !== 'todos' && state.cat !== 'kit' && !d.mapa[state.cat]) state.cat = 'todos';
    var lista = ordenar(filtrar());
    var visaoVitrine = state.cat === 'todos' && !state.q && state.ordem === 'destaque';

    var titulo = state.cat === 'todos' ? 'Todos os produtos' : state.cat === 'kit' ? KIT.nome : d.mapa[state.cat].nome;
    el.title.textContent = titulo;
    el.count.textContent = lista.length === 1 ? '1 produto' : lista.length + ' produtos';
    el.chip.innerHTML = state.q
      ? '<span class="dc-chip-q">“' + esc(state.q) + '”<button type="button" data-clear-q aria-label="Remover busca"><span class="material-symbols-rounded" aria-hidden="true">close</span></button></span>'
      : '';

    if (!lista.length) {
      el.content.innerHTML = '<div class="dc-empty"><span class="material-symbols-rounded" aria-hidden="true">search_off</span>' +
        '<h3>Nenhum produto encontrado</h3><p>Tente outra palavra, como “caixa”, “fita” ou “etiqueta”, ou veja todas as categorias.</p>' +
        '<button type="button" class="dc-more" data-reset>Ver todos os produtos</button></div>';
      return;
    }

    if (visaoVitrine) {
      var max = CFG.maxPorCategoria || 4;
      var kit = lista.filter(function (p) { return p.destaque; });
      var html = kit.length ? htmlBloco(KIT, kit, kit.length, { kit: true }) : '';
      d.categorias.forEach(function (c) {
        var daCat = lista.filter(function (p) { return p.categoriaId === c.id; })
          .sort(function (a, b) { return ((a.ordem || 0) - (b.ordem || 0)) || (a.id - b.id); });
        if (daCat.length) html += htmlBloco(c, daCat.slice(0, max), daCat.length);
      });
      el.content.innerHTML = html;
    } else {
      el.content.innerHTML = '<div class="dc-grid">' + lista.map(htmlCard).join('') + '</div>';
    }
  }

  function render() {
    if (!state.dados) return;
    renderCats();
    renderStats();
    renderConteudo();
    el.sort.value = state.ordem;
    if (el.q.value !== state.q) el.q.value = state.q;
    el.qClear.classList.toggle('is-on', Boolean(el.q.value));
  }

  function renderSkeleton() {
    var card = '<article class="dc-card dc-skel"><span class="dc-thumb"></span><div class="dc-body"><span class="dc-line" style="width:40%"></span><span class="dc-line"></span><span class="dc-line" style="width:70%"></span><span class="dc-line" style="height:40px;border-radius:12px"></span></div></article>';
    el.content.innerHTML = '<div class="dc-grid">' + new Array(8).join(card) + card + '</div>';
  }

  /* ----------------------------------------------------------- AÇÕES */
  function irParaLoja() {
    var alvo = document.getElementById('loja');
    if (!alvo) return;
    var topo = alvo.getBoundingClientRect().top + window.pageYOffset;
    var offset = el.cats.offsetHeight + (document.querySelector('.site-header') || { offsetHeight: 0 }).offsetHeight - 2;
    if (window.pageYOffset > topo - offset) window.scrollTo({ top: topo - offset, behavior: 'smooth' });
  }

  function definirCat(id, rolar) {
    state.cat = id;
    gravarUrl();
    render();
    if (rolar) irParaLoja();
  }

  function definirBusca(q, rolar) {
    state.q = String(q || '').slice(0, 60).trim();
    if (state.q && state.cat !== 'todos') state.cat = 'todos';
    gravarUrl();
    render();
    if (rolar) irParaLoja();
  }

  var tBusca = null;
  el.q.addEventListener('input', function () {
    el.qClear.classList.toggle('is-on', Boolean(el.q.value));
    clearTimeout(tBusca);
    tBusca = setTimeout(function () { definirBusca(el.q.value, false); }, 220);
  });
  el.form.addEventListener('submit', function (ev) {
    ev.preventDefault();
    clearTimeout(tBusca);
    definirBusca(el.q.value, true);
    el.q.blur();
  });
  el.qClear.addEventListener('click', function () { el.q.value = ''; definirBusca('', false); el.q.focus(); });
  el.sort.addEventListener('change', function () { state.ordem = el.sort.value; gravarUrl(); render(); });

  document.addEventListener('click', function (ev) {
    var t = ev.target;
    var cat = t.closest && t.closest('[data-cat]');
    if (cat && (cat.classList.contains('dc-cat') || cat.classList.contains('dc-more'))) { definirCat(cat.getAttribute('data-cat'), true); return; }
    var sug = t.closest && t.closest('[data-q]');
    if (sug) { definirBusca(sug.getAttribute('data-q'), true); return; }
    if (t.closest && t.closest('[data-clear-q]')) { definirBusca('', false); return; }
    if (t.closest && t.closest('[data-reset]')) { state.q = ''; definirCat('todos', true); return; }
    var link = t.closest && t.closest('a[data-id]');
    if (link) registrarClique(link.getAttribute('data-id'));
    var nav = t.closest && t.closest('.desktop-nav a[href="#kit"]');
    if (nav) { ev.preventDefault(); state.q = ''; state.ordem = 'destaque'; definirCat('kit', true); }
  });

  /* Clique do meio do mouse também conta */
  document.addEventListener('auxclick', function (ev) {
    var link = ev.target.closest && ev.target.closest('a[data-id]');
    if (link && ev.button === 1) registrarClique(link.getAttribute('data-id'));
  });

  /* Imagem quebrada vira a arte da categoria */
  document.addEventListener('error', function (ev) {
    var img = ev.target;
    if (!img || img.tagName !== 'IMG' || !img.hasAttribute('data-cat') || !state.dados) return;
    var cat = state.dados.mapa[img.getAttribute('data-cat')];
    if (cat) img.outerHTML = htmlArte(cat, img.getAttribute('data-ic'));
  }, true);

  /* Sombras da barra de categorias */
  function atualizarFades() {
    var s = el.catsScroll;
    var l = el.cats.querySelector('.dc-cats-fade--l'), r = el.cats.querySelector('.dc-cats-fade--r');
    if (!l || !r) return;
    l.classList.toggle('is-on', s.scrollLeft > 4);
    r.classList.toggle('is-on', s.scrollLeft + s.clientWidth < s.scrollWidth - 4);
  }
  el.catsScroll.addEventListener('scroll', atualizarFades, { passive: true });
  window.addEventListener('resize', atualizarFades);

  if ('IntersectionObserver' in window) {
    var sentinela = document.createElement('div');
    sentinela.style.cssText = 'position:relative;height:1px;margin-top:-1px';
    el.cats.parentNode.insertBefore(sentinela, el.cats);
    new IntersectionObserver(function (e) { el.cats.classList.toggle('is-stuck', !e[0].isIntersecting); }, { rootMargin: '-60px 0px 0px 0px' }).observe(sentinela);
  }

  /* ------------------------------------------------------ CALCULADORA */
  (function calculadora() {
    var f = { c: $('dc-c'), l: $('dc-l'), a: $('dc-a'), p: $('dc-p') };
    var o = { cub: $('dc-out-cub'), soma: $('dc-out-soma'), max: $('dc-out-max'), msg: $('dc-calc-msg') };
    if (!f.c) return;
    var num = function (i) { var v = parseFloat(String(i.value).replace(',', '.')); return isFinite(v) && v > 0 ? v : 0; };
    var kg = function (v) { return v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' kg'; };
    function calcular() {
      var c = num(f.c), l = num(f.l), a = num(f.a), p = num(f.p);
      o.msg.className = 'dc-calc-msg';
      if (!c || !l || !a) {
        o.cub.textContent = '-'; o.soma.textContent = '-'; o.max.textContent = p ? kg(p) : '-';
        o.msg.textContent = 'Preencha as medidas da caixa fechada.';
        return;
      }
      var cub = c * l * a / 6000, soma = c + l + a, maior = Math.max(cub, p);
      o.cub.textContent = kg(cub);
      o.soma.textContent = soma.toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' cm';
      o.max.textContent = kg(maior);
      var avisos = [];
      if (Math.max(c, l, a) > 100) avisos.push('um dos lados passa de 100 cm');
      if (soma > 200) avisos.push('a soma passa de 200 cm');
      if (p > 30) avisos.push('o peso passa de 30 kg');
      if (avisos.length) {
        o.msg.className = 'dc-calc-msg is-warn';
        o.msg.textContent = 'Atenção: ' + avisos.join(', ') + '. Fale com a agência antes de embalar.';
      } else if (p && cub > p) {
        o.msg.className = 'dc-calc-msg is-warn';
        o.msg.textContent = 'O peso cúbico está maior que o real. Uma caixa menor pode baratear o frete.';
      } else {
        o.msg.className = 'dc-calc-msg is-ok';
        o.msg.textContent = p ? 'Medidas dentro dos limites. O peso real é a referência.' : 'Medidas dentro dos limites. Informe o peso real para comparar.';
      }
    }
    Object.keys(f).forEach(function (k) { f[k].addEventListener('input', calcular); });
  })();

  /* ------------------------------------------------------------- BOOT */
  lerUrl();
  state.dados = carregarInicial();
  if (state.dados) render(); else renderSkeleton();

  buscarApi().then(function (d) {
    if (d) { state.fonte = 'api'; state.dados = prepararDados(d); render(); }
    else if (!state.dados) {
      el.content.innerHTML = '<div class="dc-empty"><span class="material-symbols-rounded" aria-hidden="true">cloud_off</span><h3>Não foi possível carregar a vitrine</h3><p>Verifique a conexão e tente de novo.</p><button type="button" class="dc-more" onclick="location.reload()">Tentar de novo</button></div>';
    }
  });
})();
