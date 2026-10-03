/* ============================================================================
   perfil-equipe.js - Usuarios internos: foto e aniversario de cada usuario
   v1.0.0. Fonte: Worker agf-mural-api (D1 agf-mural, tabela equipe_perfis).
   O login, o perfil e os aplicativos continuam no Apps Script (usuarios.js).
   Expoe window.AgfPerfilEquipe para o usuarios.js:
     sincronizar(users) - cria e atualiza perfis a partir da lista de logins
     editar(user) / limpar() - preenche ou zera a secao do formulario
     coletar() - le a secao antes do save
     salvar(username, nome, ativo, dados) - grava; devolve '' ou a mensagem de erro
     avatarHtml(user) / aniversarioHtml(user) - usados na lista
   ========================================================================== */
(function (global, document) {
  'use strict';

  var API = (/^(localhost|127\.0\.0\.1)$/.test(location.hostname) ? 'http://127.0.0.1:8787' : 'https://agf-mural-api.chelzinha.workers.dev');
  var MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  var DIAS_MES = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  var CORES = ['#9F1239', '#6D28D9', '#C2410C', '#0F766E', '#0369A1', '#4338CA', '#047857', '#A21CAF', '#00416B'];

  var perfis = {};          /* username -> { nome, ativo, dia, mes, avatar } */
  var indisponivel = '';    /* mensagem quando o Worker nao responde */
  var fotoNova;             /* undefined = nao mexeu; '' = remover; data URL = trocar */
  var editando = '';

  function $(id) { return document.getElementById(id); }
  function esc(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (m) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]; }); }
  function cor(n) { var h = 0; for (var i = 0; i < n.length; i++) h = (h * 31 + n.charCodeAt(i)) >>> 0; return CORES[h % CORES.length]; }
  function iniciais(n) { var p = String(n || '?').trim().split(/\s+/); return ((p[0] || '?')[0] + ((p[1] || '')[0] || (p[0] || '')[1] || '')).toUpperCase(); }
  function pad(n) { return String(n).padStart(2, '0'); }
  function token() { try { return (global.AgfAuth && global.AgfAuth.getToken()) || ''; } catch (e) { return ''; } }

  function api(metodo, caminho, corpo) {
    return fetch(API + caminho, {
      method: metodo,
      headers: { 'Authorization': 'Bearer ' + token(), 'Content-Type': 'application/json' },
      body: corpo ? JSON.stringify(corpo) : undefined
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (d) {
        if (!r.ok || d.ok === false) throw new Error(d.error || 'Não foi possível concluir agora.');
        return d;
      });
    }, function () { throw new Error('Sem conexão com o servidor de fotos e aniversários.'); });
  }

  /* ------------------------------------------------------------ UI */
  function montarSecao() {
    if ($('pePerfilSecao')) return;
    var alvo = document.querySelector('#userForm .user-two');
    if (!alvo) return;
    var dias = '<option value="">Dia</option>';
    for (var d = 1; d <= 31; d++) dias += '<option value="' + d + '">' + pad(d) + '</option>';
    var meses = '<option value="">Mês</option>' + MESES.map(function (m, i) { return '<option value="' + (i + 1) + '">' + m + '</option>'; }).join('');
    var sec = document.createElement('section');
    sec.className = 'form-section pe-secao';
    sec.id = 'pePerfilSecao';
    sec.innerHTML =
      '<div class="form-section-head"><h3>Perfil na equipe</h3><p>Foto e aniversário aparecem no Portal Interno. A pessoa também pode trocar a própria foto pelo menu do avatar.</p></div>' +
      '<div class="pe-linha">' +
        '<div class="pe-foto"><span class="pe-avatar pe-avatar--lg" id="peAvatar" aria-hidden="true"></span>' +
          '<div class="pe-foto-acoes">' +
            '<button class="users-button" type="button" id="peEscolher"><span class="material-symbols-rounded">photo_camera</span>Escolher foto</button>' +
            '<button class="users-button" type="button" id="peRemover"><span class="material-symbols-rounded">delete</span>Remover</button>' +
            '<input type="file" id="peArquivo" accept="image/png,image/jpeg,image/webp" hidden>' +
          '</div></div>' +
        '<div class="pe-aniv"><span class="pe-rotulo" id="peAnivRotulo">Aniversário</span>' +
          '<div class="pe-aniv-campos" role="group" aria-labelledby="peAnivRotulo">' +
            '<select id="peDia" aria-label="Dia do aniversário">' + dias + '</select>' +
            '<select id="peMes" aria-label="Mês do aniversário">' + meses + '</select>' +
          '</div><small>Só dia e mês, sem ano.</small></div>' +
      '</div>' +
      '<p class="pe-aviso" id="peAviso" aria-live="polite"></p>';
    alvo.insertAdjacentElement('afterend', sec);
    $('peEscolher').addEventListener('click', function () { $('peArquivo').click(); });
    $('peArquivo').addEventListener('change', escolherArquivo);
    $('peRemover').addEventListener('click', function () { fotoNova = ''; pintarAvatar(); aviso('A foto será removida ao salvar.'); });
    $('displayName').addEventListener('input', function () { if (!fotoAtual()) pintarAvatar(); });
    pintarAvatar();
    travar(!!indisponivel);
  }

  function aviso(msg, erro) { var el = $('peAviso'); if (!el) return; el.textContent = msg || ''; el.classList.toggle('is-erro', !!erro); }
  function travar(sim) {
    ['peEscolher', 'peRemover', 'peDia', 'peMes'].forEach(function (id) { if ($(id)) $(id).disabled = sim; });
    if (sim) aviso(indisponivel, true);
  }
  function fotoAtual() {
    if (fotoNova !== undefined) return fotoNova;
    return (editando && perfis[editando] && perfis[editando].avatar) || '';
  }
  function pintarAvatar() {
    var el = $('peAvatar'); if (!el) return;
    var foto = fotoAtual(), nome = ($('displayName') && $('displayName').value) || editando || '?';
    el.style.background = foto ? '#E4E9F0' : cor(nome);
    el.innerHTML = foto ? '<img src="' + esc(foto) + '" alt="">' : esc(iniciais(nome));
    if ($('peRemover')) $('peRemover').hidden = !foto;
  }

  /* Recorta quadrado no centro, reduz para 128px JPEG. Mesmo padrao do topo. */
  function escolherArquivo() {
    var input = $('peArquivo'), f = input.files && input.files[0];
    input.value = '';
    if (!f) return;
    if (!/^image\/(png|jpeg|webp)$/i.test(f.type)) { aviso('Use uma imagem PNG, JPG ou WebP.', true); return; }
    if (f.size > 8 * 1024 * 1024) { aviso('Imagem muito grande. Escolha um arquivo de até 8 MB.', true); return; }
    var img = new Image(), url = URL.createObjectURL(f);
    img.onload = function () {
      try {
        var S = 128, c = document.createElement('canvas');
        c.width = S; c.height = S;
        var lado = Math.min(img.width, img.height);
        c.getContext('2d').drawImage(img, (img.width - lado) / 2, (img.height - lado) / 2, lado, lado, 0, 0, S, S);
        var data = c.toDataURL('image/jpeg', 0.82);
        if (data.length > 45000) data = c.toDataURL('image/jpeg', 0.6);
        fotoNova = data; pintarAvatar(); aviso('Foto pronta. Clique em Salvar usuário para gravar.');
      } catch (e) { aviso('Não foi possível processar a imagem.', true); }
      finally { URL.revokeObjectURL(url); }
    };
    img.onerror = function () { URL.revokeObjectURL(url); aviso('Arquivo de imagem inválido.', true); };
    img.src = url;
  }

  /* ------------------------------------------------------------ API publica */
  function sincronizar(users) {
    montarSecao();
    var lista = (users || []).map(function (u) { return { username: u.username, nome: u.displayName || u.username, ativo: !!u.active }; });
    return api('POST', '/api/mural/perfis/sincronizar', { usuarios: lista }).then(function (d) {
      perfis = {};
      (d.perfis || []).forEach(function (p) { perfis[p.username] = p; });
      indisponivel = ''; travar(false); if ($('peAviso') && $('peAviso').classList.contains('is-erro')) aviso('');
      pintarAvatar();
    }).catch(function (e) {
      indisponivel = 'Foto e aniversário indisponíveis agora: ' + e.message + ' O restante do cadastro funciona normalmente.';
      travar(true);
    });
  }
  function editar(user) {
    montarSecao();
    editando = user ? user.username : '';
    fotoNova = undefined;
    var p = perfis[editando] || {};
    if ($('peDia')) { $('peDia').value = p.dia ? String(p.dia) : ''; $('peMes').value = p.mes ? String(p.mes) : ''; }
    aviso(indisponivel, !!indisponivel);
    pintarAvatar();
  }
  function limpar() { editar(null); }
  function coletar() {
    return { dia: $('peDia') ? $('peDia').value : '', mes: $('peMes') ? $('peMes').value : '', foto: fotoNova };
  }
  function validar(dados) {
    var d = Number(dados.dia), m = Number(dados.mes);
    if (!dados.dia && !dados.mes) return '';
    if (!dados.dia || !dados.mes) return 'Escolha o dia e o mês do aniversário, ou deixe os dois em branco.';
    if (d > DIAS_MES[m - 1]) return MESES[m - 1].charAt(0).toUpperCase() + MESES[m - 1].slice(1) + ' não tem dia ' + d + '.';
    return '';
  }
  function salvar(username, nome, ativo, dados) {
    if (indisponivel) return Promise.resolve('');
    var p = perfis[username] || {};
    var mudouData = String(p.dia || '') !== String(dados.dia || '') || String(p.mes || '') !== String(dados.mes || '');
    var mudouFoto = dados.foto !== undefined;
    if (!mudouData && !mudouFoto && p.username) return Promise.resolve('');
    var corpo = { nome: nome, ativo: ativo, dia: dados.dia || null, mes: dados.mes || null };
    if (mudouFoto) corpo.avatar = dados.foto;
    return api('PUT', '/api/mural/perfis/' + encodeURIComponent(username), corpo).then(function () {
      perfis[username] = Object.assign({}, p, { username: username, nome: nome, ativo: ativo, dia: corpo.dia ? Number(corpo.dia) : null, mes: corpo.mes ? Number(corpo.mes) : null, avatar: mudouFoto ? dados.foto : (p.avatar || '') });
      return '';
    }).catch(function (e) { return e.message; });
  }
  function avatarHtml(user) {
    var p = perfis[user.username] || {}, nome = user.displayName || user.username;
    if (p.avatar) return '<span class="pe-avatar" aria-hidden="true"><img src="' + esc(p.avatar) + '" alt=""></span>';
    return '<span class="pe-avatar" style="background:' + cor(nome) + '" aria-hidden="true">' + esc(iniciais(nome)) + '</span>';
  }
  function aniversarioHtml(user) {
    var p = perfis[user.username];
    return p && p.dia && p.mes ? '<span class="user-badge pe-badge" title="Aniversário">Aniv. ' + pad(p.dia) + '/' + pad(p.mes) + '</span>' : '';
  }

  global.AgfPerfilEquipe = { sincronizar: sincronizar, editar: editar, limpar: limpar, coletar: coletar, validar: validar, salvar: salvar, avatarHtml: avatarHtml, aniversarioHtml: aniversarioHtml };
})(window, document);
