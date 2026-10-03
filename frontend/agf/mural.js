/* ============================================================================
   mural.js - Portal Interno vivo (/agf) v1.1.0
   Mural de recados, aniversarios, elogios, agenda e o dia util no topo.
   Depende de: AgfAuth (sessao), AgfHeader v1.2.0 (selos e zona B), AGF_MURAL_CONFIG.
   Expoe window.AgfPortal { contexto, atualizar, sessaoMudou } para o script do topo.
   O agf.js continua dono do login, das permissoes dos cartoes e do Sair.
   v1.1.0: fotos da equipe (agf-mural-api) no lugar das iniciais; aniversario e foto
   passam a ser cadastrados em Usuarios internos (sai a gaveta Editar equipe).
   ========================================================================== */
(function (global, document) {
  'use strict';

  /* ================================================================ CFG */
  var CFG = global.AGF_MURAL_CONFIG || {};
  var API = String(CFG.apiUrl || '').replace(/\/+$/, '');
  var LIM_RECADOS = CFG.recadosVisiveis || 3;
  var MES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  var MES3 = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'];
  var SEM = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
  var CATS = {
    aviso: { l: 'Aviso', c: '#EA580C' },
    oper: { l: 'Operação', c: '#0078D4' },
    lembrete: { l: 'Lembrete', c: '#7648B6' },
    festa: { l: 'Comemoração', c: '#B07207' }
  };
  var AV_CORES = ['#9F1239', '#6D28D9', '#C2410C', '#0F766E', '#0369A1', '#4338CA', '#047857', '#A21CAF', '#00416B'];

  var ICO = {
    pin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 3.8h6l-1 5.4 3.2 3.2H6.8L10 9.2z"/><path d="M12 12.4v7.8"/></svg>',
    heart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round" aria-hidden="true"><path d="M12 19.6s-7.4-4.4-7.4-9.6a4.2 4.2 0 0 1 7.4-2.7A4.2 4.2 0 0 1 19.4 10c0 5.2-7.4 9.6-7.4 9.6z"/></svg>',
    reply: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9.6 7.4 4.6 12l5 4.6"/><path d="M4.8 12h9.4a5.2 5.2 0 0 1 5.2 5.2v.6"/></svg>',
    trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4.8 7h14.4M9.6 7V4.8h4.8V7M6.6 7l.8 12.2h9.2L17.4 7"/></svg>'
  };

  /* ============================================================ FOTOS
     Cache por pessoa no navegador ({ v, d }). So baixa de novo quando a versao
     (avatarV do painel) muda. localStorage pode falhar: tudo segue com iniciais. */
  var FOTOS_KEY = 'agf_mural_fotos_v1';
  function lerFotos() { try { return JSON.parse(global.localStorage.getItem(FOTOS_KEY) || '{}') || {}; } catch (e) { return {}; } }
  function gravarFotos() { try { global.localStorage.setItem(FOTOS_KEY, JSON.stringify(st.fotos)); } catch (e) {} }
  function atualizarFotos() {
    var eq = (st.dados && st.dados.equipe) || [], faltam = [], mudou = false, ativos = {};
    eq.forEach(function (p) {
      ativos[p.username] = true;
      var c = st.fotos[p.username];
      if (!p.avatarV) { if (c) { delete st.fotos[p.username]; mudou = true; } return; }
      if (!c || c.v !== p.avatarV) faltam.push(p.username);
    });
    Object.keys(st.fotos).forEach(function (u) { if (!ativos[u]) { delete st.fotos[u]; mudou = true; } });
    if (!faltam.length) { if (mudou) { gravarFotos(); renderTudo(); } return Promise.resolve(); }
    return api('GET', '/api/mural/avatares?u=' + encodeURIComponent(faltam.join(','))).then(function (d) {
      var r = d.avatares || {};
      faltam.forEach(function (u) { if (r[u]) st.fotos[u] = r[u]; else delete st.fotos[u]; });
      gravarFotos(); renderTudo();
    }).catch(function () { if (mudou) renderTudo(); });
  }

  /* ============================================================ ESTADO */
  var st = {
    logado: false, iniciado: false, carregando: false, dados: null, erro: '',
    abertos: {}, verTodos: false, cat: 'oper', timer: null, confete: {}, fotos: lerFotos()
  };

  /* ========================================================= UTILITARIOS */
  function $(id) { return document.getElementById(id); }
  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function corAvatar(n) { var h = 0; for (var i = 0; i < n.length; i++) h = (h * 31 + n.charCodeAt(i)) >>> 0; return AV_CORES[h % AV_CORES.length]; }
  function iniciais(n) { var p = String(n || '?').trim().split(/\s+/); return ((p[0] || '?')[0] + ((p[1] || '')[0] || (p[0] || '')[1] || '')).toUpperCase(); }
  /* Avatar: foto da pessoa quando existe (por login ou pelo nome da equipe); senao, iniciais. */
  function usernameDe(nome, username) {
    if (username) return username;
    var alvo = String(nome || '').toLowerCase();
    var eq = (st.dados && st.dados.equipe) || [];
    for (var i = 0; i < eq.length; i++) if (eq[i].nome.toLowerCase() === alvo) return eq[i].username;
    return '';
  }
  function av(n, xs, username) {
    var u = usernameDe(n, username), foto = u && st.fotos[u] && st.fotos[u].d;
    var cls = 'pt-av' + (xs ? ' pt-av--xs' : '');
    if (foto) return '<img class="' + cls + ' pt-av--img" src="' + esc(foto) + '" alt="" aria-hidden="true">';
    return '<span class="' + cls + '" style="--av:' + corAvatar(String(n || '')) + '" aria-hidden="true">' + esc(iniciais(n)) + '</span>';
  }
  function pad2(n) { return String(n).padStart(2, '0'); }
  function dataLocal(iso) { var p = iso.split('-').map(Number); return new Date(p[0], p[1] - 1, p[2]); }
  function isoLocal(d) { return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); }
  function chipData(d, tipo) { return '<span class="pt-date ' + (tipo || '') + '"><b>' + pad2(d.getDate()) + '</b>' + MES3[d.getMonth()] + '</span>'; }
  function atras(iso) {
    var m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
    if (m < 1) return 'agora';
    if (m < 60) return 'há ' + m + ' min';
    var h = Math.round(m / 60);
    if (h < 24) return 'há ' + h + ' h';
    var d = Math.round(h / 24);
    return d === 1 ? 'ontem' : 'há ' + d + ' dias';
  }
  function emDias(diff) { return diff === 0 ? 'hoje' : diff === 1 ? 'amanhã' : diff < 0 ? 'já passou' : 'em ' + diff + ' dias'; }

  var toastTimer = null;
  function toast(msg, erro) {
    var t = $('ptToast');
    if (!t) return;
    t.textContent = msg;
    t.setAttribute('data-err', erro ? 'true' : 'false');
    t.setAttribute('data-on', 'true');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.setAttribute('data-on', 'false'); }, erro ? 4200 : 2400);
  }
  function eu() { return (st.dados && st.dados.eu) || { username: '', nome: '', admin: false, gestor: false }; }
  function hojeIso() { return (st.dados && st.dados.hoje) || isoLocal(new Date()); }

  /* ================================================================ API */
  function token() { try { return (global.AgfAuth && global.AgfAuth.getToken && global.AgfAuth.getToken()) || ''; } catch (e) { return ''; } }
  function carregando(on) { try { if (global.AgfHeader) global.AgfHeader.loading[on ? 'start' : 'done'](); } catch (e) {} }

  function api(metodo, caminho, corpo) {
    if (!API) return Promise.reject(new Error('Endereço do mural não configurado.'));
    var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, CFG.timeoutMs || 12000) : null;
    carregando(true);
    return fetch(API + caminho, {
      method: metodo,
      headers: { 'Authorization': 'Bearer ' + token(), 'Content-Type': 'application/json' },
      body: corpo ? JSON.stringify(corpo) : undefined,
      signal: ctrl ? ctrl.signal : undefined
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (d) {
        if (r.status === 401) throw new Error(d.error || 'Sessão encerrada. Entre novamente.');
        if (!r.ok || d.ok === false) throw new Error(d.error || 'Não foi possível concluir agora.');
        return d;
      });
    }, function (e) {
      throw new Error(e && e.name === 'AbortError' ? 'O mural demorou para responder. Tente de novo.' : 'Sem conexão com o mural. Confira a internet e tente de novo.');
    }).then(function (d) { clearTimeout(timer); carregando(false); return d; },
      function (e) { clearTimeout(timer); carregando(false); throw e; });
  }

  /* ========================================================= MODULOS */
  function pintarSelos() {
    if (!global.AgfHeader || !global.AgfHeader.mark) return;
    Array.prototype.forEach.call(document.querySelectorAll('.pt-card[data-glyph]'), function (card) {
      var seal = card.querySelector('.pt-seal');
      if (seal && !seal.firstChild) seal.innerHTML = global.AgfHeader.mark(card.getAttribute('data-glyph'));
    });
  }
  /* Grupo sem nenhum cartao visivel some inteiro (ex.: usuario sem apps do Reverso). */
  function sincronizarGrupos() {
    Array.prototype.forEach.call(document.querySelectorAll('[data-pt-group]'), function (g) {
      var cards = g.querySelectorAll('.pt-card');
      var algum = Array.prototype.some.call(cards, function (c) { return !c.classList.contains('hide'); });
      if (!g.hasAttribute('data-role')) g.classList.toggle('hide', !algum);
      else if (!algum) g.classList.add('hide');
    });
  }

  /* ========================================== TOPO: DATA E DIA UTIL */
  function diasUteis() {
    var d = st.dados;
    if (!d) return null;
    var hoje = dataLocal(d.hoje);
    var y = hoje.getFullYear(), m = hoje.getMonth();
    var fechados = {};
    (d.agenda || []).forEach(function (e) { if (e.tipo === 'feriado' && !e.diaUtil) fechados[e.data] = true; });
    var ultimo = new Date(y, m + 1, 0).getDate(), total = 0, feitos = 0, ultimoUtil = null;
    for (var dia = 1; dia <= ultimo; dia++) {
      var dt = new Date(y, m, dia), w = dt.getDay();
      if (w === 0 || w === 6 || fechados[isoLocal(dt)]) continue;
      total++; ultimoUtil = dt;
      if (dia <= hoje.getDate()) feitos++;
    }
    var w0 = hoje.getDay();
    var hojeUtil = !(w0 === 0 || w0 === 6 || fechados[d.hoje]);
    return { total: total, feitos: feitos, hojeUtil: hojeUtil, ultimoUtil: ultimoUtil, mes: m };
  }
  function contexto() {
    var agora = new Date();
    var html = '<span class="agf-hd__ctx-text">' + SEM[agora.getDay()] + ', ' + agora.getDate() + ' de ' + MES[agora.getMonth()] + '</span>';
    var du = diasUteis();
    if (du && du.total) {
      var titulo = du.hojeUtil
        ? 'Hoje é o ' + du.feitos + 'º dia útil de ' + du.total + ' em ' + MES[du.mes] + '.'
        : 'Hoje não é dia útil. ' + du.feitos + ' de ' + du.total + ' dias úteis de ' + MES[du.mes] + ' já passaram.';
      html += '<span class="agf-hd__ctx-pill" title="' + esc(titulo) + '" aria-label="' + esc(titulo) + '"><b>' + du.feitos + '/' + du.total + '</b><i style="font-style:normal">dias úteis</i></span>';
    }
    return html;
  }
  function pintarContexto() { try { if (global.AgfHeader && global.AgfHeader.setContext) global.AgfHeader.setContext(contexto()); } catch (e) {} }

  /* ======================================================= HOJE */
  function renderHoje() {
    var d = st.dados, me = eu(), h = '';
    var hoje = dataLocal(d.hoje);
    d.aniversarios.filter(function (p) { return p.dia === hoje.getDate() && p.mes === hoje.getMonth() + 1; }).forEach(function (p) {
      var conf = '', chave = d.hoje + '|' + p.nome;
      if (st.confete[chave]) { /* confete so na primeira vez que a pessoa ve o card na sessao */ }
      else for (var i = 0; i < 14; i++) conf += '<i style="left:' + (4 + i * 7) + '%;background:' + ['#F2A900', '#7648B6', '#0078D4', '#EA580C', '#0D9488'][i % 5] + ';animation-delay:' + (0.2 + (i % 5) * 0.12) + 's"></i>';
      h += '<div class="pt-bday"><div class="pt-confetti" aria-hidden="true">' + conf + '</div>' + av(p.nome, false, p.username) +
        '<div style="min-width:0"><strong>' + esc(p.nome) + ' faz aniversário hoje</strong><small>Deixe uma mensagem no mural.</small></div>' +
        '<button class="pt-gold" type="button" data-parabens="' + esc(p.nome) + '">Dar parabéns</button></div>';
      st.confete[chave] = true;
    });
    d.recados.filter(function (r) { return r.fixado; }).forEach(function (r) {
      var c = CATS[r.categoria] || CATS.oper;
      var podeApagar = r.autorUsername === me.username || me.admin;
      h += '<div class="pt-pin" data-recado="' + esc(r.id) + '"><div class="pt-meta">' + av(r.autor, true, r.autorUsername) + '<b>' + esc(r.autor) + '</b>' +
        '<span class="pt-tag" style="--c:' + c.c + '">' + c.l + '</span><span>' + atras(r.criadoEm) + '</span></div>' +
        '<p>' + esc(r.texto) + '</p>' +
        ((me.gestor || podeApagar) ? '<div class="pt-acts">' +
          (me.gestor ? '<button class="pt-act" type="button" data-fixar="0">Desafixar</button>' : '') +
          (podeApagar ? '<button class="pt-act" type="button" data-apagar aria-label="Apagar recado">' + ICO.trash + '</button>' : '') + '</div>' : '') +
        '<span class="pt-stamp" title="Fixado no topo">' + ICO.pin + '</span></div>';
    });
    $('ptHojeTop').innerHTML = h;
  }
  function renderAgenda() {
    var d = st.dados, me = eu();
    var hoje = dataLocal(d.hoje);
    var itens = (d.agenda || []).filter(function (e) { return e.data >= d.hoje; }).map(function (e) {
      return { id: e.id, dt: dataLocal(e.data), t: e.titulo, s: e.descricao, k: e.tipo === 'feriado' ? 'hol' : 'int' };
    });
    /* Fechamento do mes automatico removido em 03/10/2026: so entra se for cadastrado na agenda. */
    itens.sort(function (a, b) { return a.dt - b.dt; });
    itens = itens.slice(0, 5);
    $('ptAgenda').innerHTML = itens.length ? itens.map(function (e) {
      var diff = Math.round((e.dt - hoje) / 864e5);
      return '<li>' + chipData(e.dt, e.k) + '<span class="pt-name">' + esc(e.t) + (e.s ? '<small>' + esc(e.s) + '</small>' : '') + '</span>' +
        '<span class="pt-when">' + emDias(diff) + '</span>' +
        (me.gestor && e.id ? '<button class="pt-x" type="button" data-evento="' + esc(e.id) + '" aria-label="Remover ' + esc(e.t) + ' da agenda">' + ICO.trash + '</button>' : '') + '</li>';
    }).join('') : '<li class="pt-muted">Nada marcado para os próximos dias.</li>';
  }

  /* ======================================================= MURAL */
  function htmlRecado(r) {
    var me = eu(), c = CATS[r.categoria] || CATS.oper;
    var curtiu = r.curtidas.some(function (x) { return x.username === me.username; });
    var quem = r.curtidas.map(function (x) { return x.nome; }).join(', ') || 'Ninguém curtiu ainda';
    var podeApagar = r.autorUsername === me.username || me.admin;
    var aberto = !!st.abertos[r.id], n = r.respostas.length;
    var h = '<article class="pt-post" data-recado="' + esc(r.id) + '">' + av(r.autor, false, r.autorUsername) + '<div style="min-width:0">' +
      '<div class="pt-meta"><b>' + esc(r.autor) + '</b><span class="pt-tag" style="--c:' + c.c + '">' + c.l + '</span><span>' + atras(r.criadoEm) + '</span></div>' +
      '<p class="pt-text">' + esc(r.texto) + '</p>' +
      '<div class="pt-acts">' +
        '<button class="pt-act" type="button" data-curtir aria-pressed="' + curtiu + '" title="' + esc(quem) + '">' + ICO.heart + '<span>' + (r.curtidas.length || 'Curtir') + '</span><span class="pt-sr"> curtidas</span></button>' +
        '<button class="pt-act" type="button" data-responder aria-expanded="' + aberto + '">' + ICO.reply + '<span>' + (n ? n + (n === 1 ? ' resposta' : ' respostas') : 'Responder') + '</span></button>' +
        (me.gestor ? '<button class="pt-act pt-act--end" type="button" data-fixar="1" title="Fixar em Hoje">' + ICO.pin + '<span>Fixar</span></button>' : '') +
        (podeApagar ? '<button class="pt-act' + (me.gestor ? '' : ' pt-act--end') + '" type="button" data-apagar aria-label="Apagar recado">' + ICO.trash + '</button>' : '') +
      '</div>';
    if (aberto) {
      h += '<div class="pt-replies">' + r.respostas.map(function (x) {
        var minha = x.autorUsername === me.username || me.admin;
        return '<div class="pt-reply">' + av(x.autor, true, x.autorUsername) + '<div><b>' + esc(x.autor) + '</b><span class="pt-ago">' + atras(x.criadoEm) + '</span>' +
          (minha ? ' <button class="pt-act" type="button" data-apagar-resposta="' + esc(x.id) + '">Apagar</button>' : '') + '<br>' + esc(x.texto) + '</div></div>';
      }).join('') +
      '<form class="pt-reply-form" data-resposta-form><label class="pt-sr" for="ptRf' + esc(r.id) + '">Sua resposta</label>' +
      '<input id="ptRf' + esc(r.id) + '" maxlength="280" placeholder="Responder a ' + esc(r.autor) + '"><button class="pt-ghost" type="submit">Enviar</button></form></div>';
    }
    return h + '</div></article>';
  }
  function renderFeed() {
    var lista = st.dados.recados.filter(function (r) { return !r.fixado; });
    var vis = st.verTodos ? lista : lista.slice(0, LIM_RECADOS);
    var resto = lista.length - LIM_RECADOS;
    $('ptFeed').innerHTML = (vis.length ? vis.map(htmlRecado).join('') : '<p class="pt-muted pt-pad">Nenhum recado ainda. Escreva o primeiro acima.</p>') +
      (resto > 0 ? '<button class="pt-more" type="button" data-ver-mais>' + (st.verTodos ? 'Mostrar menos' : 'Ver mais ' + resto + (resto === 1 ? ' recado' : ' recados')) + '</button>' : '');
    var total = st.dados.recados.length;
    $('ptFeedCount').textContent = total + (total === 1 ? ' recado' : ' recados');
  }

  /* ======================================================= EQUIPE */
  /* Proximos 5 aniversarios a partir de hoje, virando o ano quando preciso. 29/02 cai em 01/03 fora do bissexto. */
  var PROXIMOS_ANIVERSARIOS = 5;
  function renderAniversarios() {
    var d = st.dados, hoje = dataLocal(d.hoje);
    $('ptBdayMonth').textContent = 'Próximos aniversários';
    var lista = d.aniversarios.map(function (p) {
      var dt = new Date(hoje.getFullYear(), p.mes - 1, p.dia);
      if (dt < hoje) dt = new Date(hoje.getFullYear() + 1, p.mes - 1, p.dia);
      return { nome: p.nome, username: p.username || '', dt: dt, diff: Math.round((dt - hoje) / 864e5) };
    }).sort(function (a, b) { return a.diff - b.diff || a.nome.localeCompare(b.nome, 'pt-BR'); }).slice(0, PROXIMOS_ANIVERSARIOS);
    var h = lista.map(function (p) {
      return '<li>' + chipData(p.dt, p.diff === 0 ? 'bd' : '') + av(p.nome, false, p.username) +
        '<span class="pt-name">' + esc(p.nome) + '</span><span class="pt-when">' + emDias(p.diff) + '</span></li>';
    }).join('');
    if (!h) h = '<li class="pt-muted">' + (eu().admin ? 'Nenhum aniversário cadastrado. Use "Editar equipe" para cadastrar em Usuários internos.' : 'Nenhum aniversário cadastrado ainda.') + '</li>';
    $('ptBdayList').innerHTML = h;
    /* Sugestoes do elogio: equipe ativa (Usuarios internos) e nomes da lista antiga de aniversarios */
    var nomes = {}, meuNome = eu().nome.toLowerCase();
    (d.equipe || []).concat(d.aniversarios).forEach(function (p) { if (p.nome && p.nome.toLowerCase() !== meuNome) nomes[p.nome] = true; });
    $('ptTeamNames').innerHTML = Object.keys(nomes).sort(function (a, b) { return a.localeCompare(b, 'pt-BR'); })
      .map(function (n) { return '<option value="' + esc(n) + '"></option>'; }).join('');
  }
  function renderElogios() {
    var d = st.dados, me = eu();
    $('ptKudos').innerHTML = d.elogios.length ? d.elogios.slice(0, 5).map(function (k) {
      var pode = k.deUsername === me.username || me.admin;
      return '<div class="pt-kudo" data-elogio="' + esc(k.id) + '"><div class="pt-kudo__who">' + av(k.de, true, k.deUsername) + '<span><b>' + esc(k.de) + '</b> elogiou <b>' + esc(k.para) + '</b></span>' +
        '<span style="margin-left:auto;white-space:nowrap">' + atras(k.criadoEm) + '</span>' +
        (pode ? '<button class="pt-x" type="button" data-apagar-elogio aria-label="Apagar elogio">' + ICO.trash + '</button>' : '') + '</div>' +
        '<p>' + esc(k.texto) + '</p></div>';
    }).join('') : '<p class="pt-muted" style="margin:0">Nenhum elogio ainda. Reconheça um colega pelo botão acima.</p>';
    var mes = MES[dataLocal(d.hoje).getMonth()];
    $('ptTally').innerHTML = d.placar.length ? '<span class="pt-lbl">Elogios recebidos em ' + mes + '</span>' +
      d.placar.map(function (p) { return '<span>' + av(p.nome, true) + '<b>' + esc(p.nome) + '</b> ' + p.total + '</span>'; }).join('') : '';
  }

  function renderTudo() {
    if (!st.dados) return;
    var me = eu();
    $('ptPinWrap').hidden = !me.gestor;
    $('ptAddEvent').hidden = !me.gestor;
    $('ptManageTeam').hidden = !me.admin;
    renderHoje(); renderAgenda(); renderFeed(); renderAniversarios(); renderElogios();
    pintarContexto();
  }
  function renderErro(msg) {
    var bloco = '<div class="pt-error" role="alert"><span>' + esc(msg) + '</span><button class="pt-ghost" type="button" data-tentar>Tentar de novo</button></div>';
    if (!st.dados) {
      $('ptFeed').innerHTML = bloco;
      $('ptAgenda').innerHTML = '<li class="pt-muted">Agenda indisponível no momento.</li>';
      $('ptBdayList').innerHTML = '<li class="pt-muted">Indisponível no momento.</li>';
    } else toast(msg, true);
  }

  /* ======================================================= CARGA */
  function ocupadoDigitando() {
    var a = document.activeElement;
    if (a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) && a.closest && a.closest('.pt-main, .pt-drawer')) return true;
    return $('ptComposer').classList.contains('is-open') || document.querySelector('.pt-drawer[data-open="true"]');
  }
  function carregar(manual) {
    if (st.carregando || !st.logado) return Promise.resolve();
    st.carregando = true;
    return api('GET', '/api/mural/painel').then(function (d) {
      st.dados = d; st.erro = '';
      renderTudo();
      atualizarFotos();
      if (manual) toast('Portal atualizado');
    }).catch(function (e) {
      st.erro = e.message; renderErro(e.message);
    }).then(function () { st.carregando = false; });
  }
  function ligarTimer() {
    clearInterval(st.timer);
    st.timer = setInterval(function () {
      if (document.visibilityState === 'visible' && !ocupadoDigitando()) carregar(false);
    }, CFG.atualizarACadaMs || 120000);
  }

  /* ===================================================== ACOES */
  function recadoPorId(id) { return st.dados && st.dados.recados.find(function (r) { return r.id === id; }); }
  function acaoComBotao(btn, promessa, ok) {
    if (btn) btn.disabled = true;
    return promessa.then(function (r) { if (ok) toast(ok); return carregar(false).then(function () { return r || true; }); })
      .catch(function (e) { toast(e.message, true); return null; })
      .then(function (r) { if (btn && document.body.contains(btn)) btn.disabled = false; return r; });
  }

  function onClickColuna(ev) {
    var t = ev.target;
    var tentar = t.closest('[data-tentar]');
    if (tentar) { carregar(true); return; }
    var mais = t.closest('[data-ver-mais]');
    if (mais) { st.verTodos = !st.verTodos; renderFeed(); return; }
    var parabens = t.closest('[data-parabens]');
    if (parabens) {
      abrirComposer(); definirCat('festa');
      var ta = $('ptPostText');
      ta.value = 'Feliz aniversário, ' + parabens.getAttribute('data-parabens') + '! ';
      atualizarComposer();
      ta.scrollIntoView({ behavior: 'smooth', block: 'center' });
      try { ta.focus({ preventScroll: true }); ta.setSelectionRange(ta.value.length, ta.value.length); } catch (e) {}
      return;
    }
    var evBtn = t.closest('[data-evento]');
    if (evBtn) {
      if (!global.confirm('Remover este item da agenda?')) return;
      acaoComBotao(evBtn, api('POST', '/api/mural/agenda/' + encodeURIComponent(evBtn.getAttribute('data-evento')) + '/excluir'), 'Item removido da agenda');
      return;
    }
    var elogio = t.closest('[data-apagar-elogio]');
    if (elogio) {
      var kid = elogio.closest('[data-elogio]').getAttribute('data-elogio');
      if (!global.confirm('Apagar este elogio?')) return;
      acaoComBotao(elogio, api('POST', '/api/mural/elogios/' + encodeURIComponent(kid) + '/excluir'), 'Elogio apagado');
      return;
    }
    var host = t.closest('[data-recado]');
    if (!host) return;
    var id = host.getAttribute('data-recado'), r = recadoPorId(id);
    if (!r) return;

    var curtir = t.closest('[data-curtir]');
    if (curtir) {
      var me = eu(), i = r.curtidas.findIndex(function (x) { return x.username === me.username; });
      if (i >= 0) r.curtidas.splice(i, 1); else r.curtidas.push({ username: me.username, nome: me.nome });
      renderFeed();                                                    /* otimista: volta se falhar */
      api('POST', '/api/mural/recados/' + id + '/curtir').catch(function (e) { toast(e.message, true); carregar(false); });
      return;
    }
    if (t.closest('[data-responder]')) {
      st.abertos[id] = !st.abertos[id]; renderFeed();
      var f = $('ptRf' + id); if (f) f.focus();
      return;
    }
    var fixar = t.closest('[data-fixar]');
    if (fixar) {
      var fixo = fixar.getAttribute('data-fixar') === '1';
      acaoComBotao(fixar, api('POST', '/api/mural/recados/' + id + '/fixar', { fixado: fixo }), fixo ? 'Recado fixado em Hoje' : 'Recado desafixado');
      return;
    }
    var apagarResp = t.closest('[data-apagar-resposta]');
    if (apagarResp) {
      if (!global.confirm('Apagar esta resposta?')) return;
      acaoComBotao(apagarResp, api('POST', '/api/mural/respostas/' + encodeURIComponent(apagarResp.getAttribute('data-apagar-resposta')) + '/excluir'), 'Resposta apagada');
      return;
    }
    var apagar = t.closest('[data-apagar]');
    if (apagar) {
      if (!global.confirm('Apagar este recado para toda a equipe?')) return;
      acaoComBotao(apagar, api('POST', '/api/mural/recados/' + id + '/excluir'), 'Recado apagado');
    }
  }
  function onSubmitResposta(ev) {
    var form = ev.target.closest('[data-resposta-form]');
    if (!form) return;
    ev.preventDefault();
    var host = form.closest('[data-recado]'), id = host.getAttribute('data-recado');
    var input = form.querySelector('input'), texto = input.value.trim(), btn = form.querySelector('button');
    if (!texto) { input.focus(); return; }
    st.abertos[id] = true;
    acaoComBotao(btn, api('POST', '/api/mural/recados/' + id + '/respostas', { texto: texto }), 'Resposta enviada').then(function () {
      var f = $('ptRf' + id); if (f) f.focus();
    });
  }

  /* Composer */
  function definirCat(k) {
    st.cat = k;
    Array.prototype.forEach.call($('ptCats').children, function (c) { c.setAttribute('aria-pressed', String(c.getAttribute('data-cat') === k)); });
  }
  function abrirComposer() { $('ptComposer').classList.add('is-open'); }
  function fecharComposer() {
    $('ptComposer').classList.remove('is-open');
    $('ptPostText').value = ''; $('ptPinIt').checked = false; definirCat('oper'); atualizarComposer();
    $('ptHint').textContent = ''; $('ptHint').className = 'pt-hint';
  }
  function atualizarComposer() {
    var n = $('ptPostText').value.trim().length;
    $('ptPublish').disabled = n < 1;
    $('ptChars').textContent = n > 450 ? (600 - $('ptPostText').value.length) + ' restantes' : '';
  }
  function publicar(ev) {
    ev.preventDefault();
    var texto = $('ptPostText').value.trim(), hint = $('ptHint');
    if (texto.length < 3) { hint.textContent = 'Escreva pelo menos 3 caracteres.'; hint.className = 'pt-hint is-err'; return; }
    var fixado = !!(eu().gestor && $('ptPinIt').checked);
    var btn = $('ptPublish');
    btn.disabled = true; btn.textContent = 'Publicando…';
    api('POST', '/api/mural/recados', { texto: texto, categoria: st.cat, fixado: fixado }).then(function () {
      fecharComposer(); toast(fixado ? 'Recado publicado e fixado em Hoje' : 'Recado publicado');
      return carregar(false);
    }).catch(function (e) {
      hint.textContent = e.message; hint.className = 'pt-hint is-err';
    }).then(function () { btn.textContent = 'Publicar'; atualizarComposer(); });
  }

  /* Abas da equipe */
  function selecionarAba(qual) {
    var b = qual === 'B';
    $('ptTabB').setAttribute('aria-selected', String(b)); $('ptTabK').setAttribute('aria-selected', String(!b));
    $('ptTabB').tabIndex = b ? 0 : -1; $('ptTabK').tabIndex = b ? -1 : 0;
    $('ptPanB').hidden = !b; $('ptPanK').hidden = b;
  }

  /* Elogio */
  function abrirElogio(v) {
    $('ptKudoForm').setAttribute('data-open', String(v));
    $('ptOpenKudo').setAttribute('aria-expanded', String(v));
    if (v) $('ptKudoTo').focus();
  }
  function enviarElogio(ev) {
    ev.preventDefault();
    var para = $('ptKudoTo').value.trim(), texto = $('ptKudoText').value.trim();
    if (!para) { toast('Escreva o nome do colega.', true); $('ptKudoTo').focus(); return; }
    if (texto.length < 5) { toast('Conte em poucas palavras o que a pessoa fez.', true); $('ptKudoText').focus(); return; }
    acaoComBotao($('ptSendKudo'), api('POST', '/api/mural/elogios', { para: para, texto: texto }), 'Elogio publicado').then(function (r) {
      if (r) { $('ptKudoTo').value = ''; $('ptKudoText').value = ''; abrirElogio(false); }
    });
  }

  /* Gavetas */
  var ultimoFoco = null;
  function abrirGaveta(id) {
    ultimoFoco = document.activeElement;
    $(id).setAttribute('data-open', 'true');
    var f = $(id).querySelector('input, select, button');
    if (f) setTimeout(function () { f.focus(); }, 30);
  }
  function fecharGavetas() {
    Array.prototype.forEach.call(document.querySelectorAll('.pt-drawer[data-open="true"]'), function (d) { d.setAttribute('data-open', 'false'); });
    if (ultimoFoco && ultimoFoco.focus) { try { ultimoFoco.focus(); } catch (e) {} }
  }
  function abrirEvento() {
    $('ptEventForm').reset();
    $('ptEvData').value = hojeIso();
    $('ptEvHint').textContent = ''; $('ptEvHint').className = 'pt-hint';
    abrirGaveta('ptEventDrawer');
  }
  function salvarEvento(ev) {
    ev.preventDefault();
    var tipoSel = $('ptEvTipo').value, hint = $('ptEvHint');
    var corpo = {
      data: $('ptEvData').value, titulo: $('ptEvTitulo').value.trim(), descricao: $('ptEvDesc').value.trim(),
      tipo: tipoSel === 'interno' ? 'interno' : 'feriado', diaUtil: tipoSel === 'facultativo'
    };
    if (!/^\d{4}-\d{2}-\d{2}$/.test(corpo.data)) { hint.textContent = 'Escolha a data.'; hint.className = 'pt-hint is-err'; return; }
    if (corpo.titulo.length < 3) { hint.textContent = 'Dê um título ao evento.'; hint.className = 'pt-hint is-err'; return; }
    var btn = $('ptEvSave'); btn.disabled = true; btn.textContent = 'Salvando…';
    api('POST', '/api/mural/agenda', corpo).then(function () {
      fecharGavetas(); toast('Evento salvo na agenda'); return carregar(false);
    }).catch(function (e) { hint.textContent = e.message; hint.className = 'pt-hint is-err'; })
      .then(function () { btn.disabled = false; btn.textContent = 'Salvar evento'; });
  }

  /* ===================================================== LIGACOES */
  function ligar() {
    $('ptCats').innerHTML = Object.keys(CATS).map(function (k) {
      return '<button type="button" class="pt-chip" style="--c:' + CATS[k].c + '" data-cat="' + k + '" aria-pressed="' + (k === st.cat) + '"><i></i>' + CATS[k].l + '</button>';
    }).join('');
    $('ptCats').addEventListener('click', function (e) { var b = e.target.closest('[data-cat]'); if (b) definirCat(b.getAttribute('data-cat')); });
    $('ptPostText').addEventListener('focus', abrirComposer);
    $('ptPostText').addEventListener('input', function () { atualizarComposer(); $('ptHint').textContent = ''; });
    $('ptCancelPost').addEventListener('click', fecharComposer);
    $('ptComposer').addEventListener('submit', publicar);

    ['ptHojeTop', 'ptAgenda', 'ptFeed', 'ptKudos'].forEach(function (id) { $(id).addEventListener('click', onClickColuna); });
    $('ptFeed').addEventListener('submit', onSubmitResposta);

    $('ptTabB').addEventListener('click', function () { selecionarAba('B'); });
    $('ptTabK').addEventListener('click', function () { selecionarAba('K'); });
    [$('ptTabB'), $('ptTabK')].forEach(function (t) {
      t.addEventListener('keydown', function (e) {
        if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
        var n = t.id === 'ptTabB' ? 'K' : 'B'; selecionarAba(n); $('ptTab' + n).focus();
      });
    });

    $('ptOpenKudo').addEventListener('click', function () { abrirElogio($('ptKudoForm').getAttribute('data-open') !== 'true'); });
    $('ptCancelKudo').addEventListener('click', function () { abrirElogio(false); });
    $('ptKudoForm').addEventListener('submit', enviarElogio);

    /* Foto trocada pelo menu do avatar: busca a versao nova no proximo painel */
    global.addEventListener('agf:avatar-changed', function () { carregar(false); });
    $('ptAddEvent').addEventListener('click', abrirEvento);
    $('ptEventForm').addEventListener('submit', salvarEvento);

    Array.prototype.forEach.call(document.querySelectorAll('.pt-drawer'), function (d) {
      d.addEventListener('click', function (e) { if (e.target === d || e.target.closest('[data-pt-close]')) fecharGavetas(); });
    });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') fecharGavetas(); });
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible' && st.logado && st.dados && !ocupadoDigitando()) carregar(false);
    });
  }

  /* ===================================================== API PUBLICA */
  function sessaoMudou(logado) {
    pintarSelos();
    if (logado) {
      sincronizarGrupos();
      if (!st.logado) {
        st.logado = true;
        if (!st.iniciado) { st.iniciado = true; ligar(); }
        carregar(false);
        ligarTimer();
      }
    } else if (st.logado) {
      st.logado = false; st.dados = null; st.abertos = {};
      clearInterval(st.timer);
    }
  }

  global.AgfPortal = {
    contexto: contexto,
    atualizar: function (manual) { return carregar(!!manual); },
    sessaoMudou: sessaoMudou
  };
})(window, document);
