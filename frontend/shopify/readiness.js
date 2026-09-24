(function (global) {
  'use strict';

  const original = global.AgfShopify;
  if (!original || typeof original.getOrder !== 'function') return;

  function text(value, fallback) {
    const normalized = String(value == null ? '' : value).trim();
    return normalized || fallback || '—';
  }

  function digitsLabel(value) {
    const normalized = String(value == null ? '' : value).replace(/\D/g, '');
    return normalized || 'Não informado';
  }

  function isCorreiosService(shipping) {
    const value = [shipping && shipping.title, shipping && shipping.code]
      .filter(Boolean)
      .join(' ')
      .toUpperCase();
    return /\b(SEDEX|PAC|MINI\s*ENVIOS?)\b/.test(value);
  }

  function createCheck(label, status, note) {
    const row = document.createElement('div');
    row.className = 'readiness-item readiness-' + status;

    const icon = document.createElement('span');
    icon.className = 'readiness-icon';
    icon.textContent = status === 'ok' ? '✓' : (status === 'block' ? '×' : '!');

    const body = document.createElement('div');
    const title = document.createElement('strong');
    title.textContent = label;
    body.appendChild(title);

    if (note) {
      const small = document.createElement('span');
      small.textContent = note;
      body.appendChild(small);
    }

    row.append(icon, body);
    return row;
  }

  function createDetailField(labelText, valueText) {
    const field = document.createElement('div');
    field.className = 'detail-field';

    const label = document.createElement('span');
    label.className = 'detail-label';
    label.textContent = labelText;

    const value = document.createElement('strong');
    value.className = 'detail-value';
    value.textContent = valueText;

    field.append(label, value);
    return field;
  }

  function normalizeAddressLabels(container) {
    const blocks = Array.from(container.querySelectorAll('.detail-block'));
    const addressBlock = blocks.find((block) => {
      const heading = block.querySelector('h3');
      return heading && heading.textContent.trim() === 'Endereço de entrega';
    });
    if (!addressBlock) return;

    const labels = Array.from(addressBlock.querySelectorAll('.detail-label'));
    const complement = labels.find((label) => label.textContent.trim() === 'Complemento');
    if (complement) complement.textContent = 'Informação adicional Shopify';

    const grid = addressBlock.querySelector('.detail-grid');
    if (!grid || grid.querySelector('[data-agf-district]')) return;

    const field = createDetailField('Bairro', 'A validar pelo CEP');
    field.dataset.agfDistrict = '1';
    grid.appendChild(field);
  }

  function renderCorreiosAccount(container, correios) {
    const previous = container.querySelector('.agf-correios-account');
    if (previous) previous.remove();

    const block = document.createElement('section');
    block.className = 'detail-block detail-block-wide agf-correios-account';

    const heading = document.createElement('h3');
    heading.textContent = 'Conta Correios do cliente';

    const grid = document.createElement('div');
    grid.className = 'detail-grid';

    if (!correios) {
      grid.appendChild(createDetailField('Situação', 'Não cadastrada no AGF Core'));
      grid.appendChild(createDetailField('Próxima ação', 'Cadastrar contrato e cartão de postagem'));
    } else {
      grid.appendChild(createDetailField('Contrato', digitsLabel(correios.contractNumber)));
      grid.appendChild(createDetailField('Cartão de postagem', digitsLabel(correios.postingCard)));
      grid.appendChild(createDetailField('CNPJ do contrato', digitsLabel(correios.documentNumber)));
      grid.appendChild(createDetailField('DR', text(correios.dr, 'Não informado')));
      grid.appendChild(createDetailField('DRS', text(correios.drs, 'Não informado')));
      grid.appendChild(createDetailField('Status', text(correios.status, 'Não informado')));
      grid.appendChild(createDetailField(
        'Credenciais CWS',
        correios.credentialsConfigured ? 'Configuradas' : 'Ainda não configuradas'
      ));
    }

    block.append(heading, grid);

    const warning = container.querySelector('.detail-warning');
    if (warning) container.insertBefore(block, warning);
    else container.appendChild(block);
  }

  function accountReadiness(correios) {
    if (!correios) {
      return {
        status: 'block',
        note: 'Nenhuma integração CORREIOS foi cadastrada para este cliente no AGF Core.'
      };
    }

    const hasContract = Boolean(String(correios.contractNumber || '').trim());
    const hasPostingCard = Boolean(String(correios.postingCard || '').trim());
    if (!hasContract || !hasPostingCard) {
      return {
        status: 'block',
        note: 'A conta foi localizada, mas número do contrato e cartão de postagem ainda não estão completos.'
      };
    }

    if (String(correios.status || '').toUpperCase() === 'DISABLED') {
      return {
        status: 'block',
        note: 'Contrato ' + text(correios.contractNumber) + ' localizado, mas a integração está desabilitada.'
      };
    }

    if (String(correios.status || '').toUpperCase() === 'ERROR') {
      return {
        status: 'block',
        note: 'Contrato ' + text(correios.contractNumber) + ' localizado, mas a integração está em estado de erro.'
      };
    }

    if (!correios.credentialsConfigured) {
      return {
        status: 'block',
        note: 'Contrato ' + text(correios.contractNumber) + ' e cartão ' + text(correios.postingCard) + ' encontrados; faltam as credenciais CWS.'
      };
    }

    if (String(correios.status || '').toUpperCase() !== 'CONNECTED') {
      return {
        status: 'block',
        note: 'Contrato e cartão encontrados, mas a integração Correios ainda não está ativa.'
      };
    }

    return {
      status: 'ok',
      note: 'Contrato ' + text(correios.contractNumber) + ' e cartão ' + text(correios.postingCard) + ' prontos para uso.'
    };
  }

  function renderReadiness(data) {
    const container = document.getElementById('orderDetailContent');
    if (!container) return;

    normalizeAddressLabels(container);

    const previous = container.querySelector('.agf-readiness');
    if (previous) previous.remove();

    const order = data && data.order ? data.order : {};
    const draft = data && data.shipmentDraft ? data.shipmentDraft : {};
    const recipient = draft.recipient || {};
    const address = draft.address || {};
    const shipping = draft.shipping || {};
    const packageData = draft.package || {};
    const documentData = recipient.document || null;
    const correios = data && data.agfCore ? data.agfCore.correios : null;

    renderCorreiosAccount(container, correios);

    const block = document.createElement('section');
    block.className = 'detail-block detail-block-wide agf-readiness';

    const head = document.createElement('div');
    head.className = 'readiness-head';
    const heading = document.createElement('h3');
    heading.textContent = 'Prontidão para postagem';
    const summary = document.createElement('span');
    summary.className = 'readiness-summary';
    summary.textContent = 'Conferência AGF antes de habilitar qualquer chamada aos Correios.';
    head.append(heading, summary);

    const grid = document.createElement('div');
    grid.className = 'readiness-grid';

    grid.appendChild(createCheck(
      'Destinatário',
      recipient.name && documentData ? 'ok' : 'block',
      recipient.name && documentData ? 'Nome e CPF/CNPJ disponíveis.' : 'Nome e CPF/CNPJ são necessários.'
    ));

    const addressOk = address.address1 && address.city && (address.provinceCode || address.province) && address.postalCode;
    grid.appendChild(createCheck(
      'Endereço principal',
      addressOk ? 'ok' : 'block',
      addressOk ? 'Logradouro, cidade, UF e CEP disponíveis.' : 'Há dados obrigatórios do endereço ausentes.'
    ));

    grid.appendChild(createCheck(
      'Bairro',
      'warn',
      'A Shopify não separou bairro e complemento de forma confiável. Validar pelo CEP antes da postagem.'
    ));

    grid.appendChild(createCheck(
      'Peso',
      Number(packageData.weightGrams || 0) > 0 ? 'ok' : 'warn',
      Number(packageData.weightGrams || 0) > 0
        ? text(packageData.weightGrams) + ' g recebidos da Shopify.'
        : 'Peso não informado pela Shopify.'
    ));

    grid.appendChild(createCheck(
      'Dimensões',
      packageData.dimensions ? 'ok' : 'warn',
      packageData.dimensions ? 'Dimensões disponíveis.' : 'Não fornecidas pela Shopify; manter como dado a complementar quando necessário.'
    ));

    const serviceMapped = isCorreiosService(shipping);
    grid.appendChild(createCheck(
      'Serviço Correios',
      serviceMapped ? 'ok' : 'block',
      serviceMapped
        ? 'Frete reconhecido como serviço Correios.'
        : 'Frete Shopify "' + text(shipping.title, 'não informado') + '" ainda não está mapeado para SEDEX, PAC ou Mini Envios.'
    ));

    const account = accountReadiness(correios);
    grid.appendChild(createCheck('Conta Correios', account.status, account.note));

    const fulfilled = String(order.fulfillmentStatus || '').toUpperCase() === 'FULFILLED';
    grid.appendChild(createCheck(
      'Situação do pedido',
      fulfilled ? 'block' : 'ok',
      fulfilled
        ? 'O pedido já consta como Fulfilled na Shopify; revisar antes de gerar nova postagem.'
        : 'Pedido ainda não consta como totalmente expedido na Shopify.'
    ));

    const footer = document.createElement('div');
    footer.className = 'readiness-footer';

    if (!correios) {
      footer.innerHTML = '<strong>Próxima etapa:</strong> cadastrar a conta Correios deste cliente no AGF Core. Depois disso, ainda será necessário mapear o frete Shopify e configurar as credenciais CWS.';
    } else if (!correios.credentialsConfigured) {
      footer.innerHTML = '<strong>Próxima etapa:</strong> as referências do contrato já estão no AGF Core. Falta configurar as credenciais CWS e mapear a opção de frete para um serviço Correios.';
    } else if (!serviceMapped) {
      footer.innerHTML = '<strong>Próxima etapa:</strong> a conta Correios está disponível. Falta mapear a opção de frete Shopify para SEDEX, PAC ou Mini Envios.';
    } else {
      footer.innerHTML = '<strong>Próxima etapa:</strong> revisar os itens restantes antes de habilitar a preparação da postagem. Nenhuma etiqueta é gerada enquanto houver itens bloqueantes.';
    }

    block.append(head, grid, footer);
    container.appendChild(block);
  }

  async function loadAgfCoreContext() {
    const select = document.getElementById('customerSelect');
    const customerId = select ? String(select.value || '').trim() : '';
    if (!customerId || !global.AgfCore || typeof global.AgfCore.getCustomer !== 'function') {
      return { customerId: customerId || null, correios: null };
    }

    try {
      const data = await global.AgfCore.getCustomer(customerId);
      return {
        customerId,
        correios: data && data.correios ? data.correios : null
      };
    } catch (error) {
      console.warn('[AGF_SHOPIFY_READINESS] Não foi possível consultar o AGF Core:', error && error.message ? error.message : error);
      return { customerId, correios: null, error: error && error.message ? error.message : 'AGF Core indisponível' };
    }
  }

  global.AgfShopify = Object.freeze(Object.assign({}, original, {
    getOrder: async function (shop, orderId) {
      const data = await original.getOrder(shop, orderId);
      data.agfCore = await loadAgfCoreContext();
      setTimeout(function () { renderReadiness(data); }, 0);
      return data;
    }
  }));
})(window);
