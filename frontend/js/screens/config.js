/* =====================================================
   APP ETIQUETAS — Screen: config
   =====================================================
   Tela de conta/configuração. Mostra:
     - Dados do cliente logado (nome, contrato, cartão, ambiente)
     - Dados de conexão com a Correios
     - Botão "Testar conexão" (action testarTokenCws)
     - Botão "Diagnóstico completo" (action diagnostico) — devolve
       JSON cru para troubleshooting

   Nada é editável aqui: a fonte da verdade é a planilha
   CLIENTES_APP. Se precisar mudar algo, é na planilha direto.
   ===================================================== */

Screens.config = (function () {

  function $(id) { return document.getElementById(id); }

  function kvRow(label, value, cls) {
    return '<div class="kv-row">' +
             '<div class="kv-label">' + UI.escapeHtml(label) + '</div>' +
             '<div class="kv-value ' + (cls || '') + '">' + UI.escapeHtml(value == null ? '—' : String(value)) + '</div>' +
           '</div>';
  }

  function renderCliente(client) {
    if (!client) return '—';
    const rows = [
      kvRow('Login',      client.LOGIN_APP),
      kvRow('Nome',       client.NOME_REMETENTE),
      kvRow('Fantasia',   client.NOME_FANTASIA),
      kvRow('CNPJ/CPF',   client.CNPJ_CPF ? UI.fmtCpfCnpj(client.CNPJ_CPF) : '—'),
      kvRow('Endereço',   UI.joinNonEmpty([client.ENDERECO, client.NUMERO, client.BAIRRO], ', ')),
      kvRow('Cidade/UF',  UI.joinNonEmpty([client.CIDADE_REMETENTE, client.UF_REMETENTE], '/')),
      kvRow('CEP',        client.CEP ? UI.fmtCep(client.CEP) : '—'),
      kvRow('Contato',    client.CONTATO ? UI.fmtPhone(client.CONTATO) : '—'),
      kvRow('E-mail',     client.EMAIL)
    ];
    return rows.join('');
  }

  function renderCws(client) {
    if (!client) return '—';
    const amb = (client.AMBIENTE_CWS || 'PRODUCAO').toUpperCase();
    const ambCls = amb === 'PRODUCAO' ? 'is-ok' : 'is-warn';
    const status = client.STATUS_TESTE_CWS || '—';
    const statusCls = /ok|sucesso/i.test(status) ? 'is-ok' : '';

    const rows = [
      kvRow('Ambiente',       amb, ambCls),
      kvRow('Contrato',       client.NUM_CONTRATO),
      kvRow('Cartão postagem',client.CARTAO_POSTAGEM),
      kvRow('Login Correios', client.LOGIN_IDCORREIOS),
      kvRow('Código PAC',     client.COD_SERVICO_PAC),
      kvRow('Código SEDEX',   client.COD_SERVICO_SEDEX),
      kvRow('Último teste',   status, statusCls)
    ];
    return rows.join('');
  }

  async function testarToken() {
    const btn = $('btnTestarToken');
    if (btn) btn.disabled = true;
    UI.showLoading('Testando conexão...');
    try {
      const data = await Api.testarTokenCws();
      UI.hideLoading();
      const temApi36 = data.temApi36 === true;
      if (temApi36) {
        UI.toast('Conexão OK — API 36 habilitada', 'success');
      } else {
        UI.toast('Conexão OK, mas API 36 NÃO está habilitada no cartão', 'error');
      }
      // Atualiza o bloco de config com o resultado
      const out = $('diagnosticoOut');
      if (out) {
        out.hidden = false;
        out.textContent = JSON.stringify(data, null, 2);
      }
    } catch (e) {
      UI.hideLoading();
      UI.toastError(e);
      const out = $('diagnosticoOut');
      if (out) {
        out.hidden = false;
        out.textContent = 'ERRO: ' + (e.message || String(e));
      }
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  async function diagnosticoCompleto() {
    const btn = $('btnDiagnostico');
    if (btn) btn.disabled = true;
    UI.showLoading('Rodando diagnóstico...');
    try {
      const data = await Api.diagnostico();
      UI.hideLoading();
      const out = $('diagnosticoOut');
      if (out) {
        out.hidden = false;
        out.textContent = JSON.stringify(data, null, 2);
      }
      // Scroll até o output
      try { out.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch (e) {}
    } catch (e) {
      UI.hideLoading();
      UI.toastError(e);
      const out = $('diagnosticoOut');
      if (out) {
        out.hidden = false;
        out.textContent = 'ERRO: ' + (e.message || String(e));
      }
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  function mount() {
    const client = Api.getCachedClient();
    const kv1 = $('cfgKvList');
    const kv2 = $('cfgCwsKv');
    if (kv1) kv1.innerHTML = renderCliente(client);
    if (kv2) kv2.innerHTML = renderCws(client);

    const b1 = $('btnTestarToken');
    const b2 = $('btnDiagnostico');
    if (b1) b1.addEventListener('click', testarToken);
    if (b2) b2.addEventListener('click', diagnosticoCompleto);
  }

  return { mount };
})();
