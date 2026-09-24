(function (global) {
  'use strict';

  const original = global.AgfShopify;
  if (!original || typeof original.getOrder !== 'function') return;

  function text(value, fallback) {
    const normalized = String(value == null ? '' : value).trim();
    return normalized || fallback || '—';
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

    const field = document.createElement('div');
    field.className = 'detail-field';
    field.dataset.agfDistrict = '1';

    const label = document.createElement('span');
    label.className = 'detail-label';
    label.textContent = 'Bairro';

    const value = document.createElement('strong');
    value.className = 'detail-value';
    value.textContent = 'A validar pelo CEP';

    field.append(label, value);
    grid.appendChild(field);
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

    grid.appendChild(createCheck(
      'Conta Correios',
      'block',
      'O Conector Shopify ainda não está lendo contrato e cartão de postagem da integração CORREIOS do AGF Core.'
    ));

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
    footer.innerHTML = '<strong>Próxima etapa:</strong> ligar a conta Correios do cliente no AGF Core e mapear a opção de frete para um serviço Correios. Nenhuma etiqueta é gerada enquanto houver itens bloqueantes.';

    block.append(head, grid, footer);
    container.appendChild(block);
  }

  global.AgfShopify = Object.freeze(Object.assign({}, original, {
    getOrder: async function (shop, orderId) {
      const data = await original.getOrder(shop, orderId);
      setTimeout(function () { renderReadiness(data); }, 0);
      return data;
    }
  }));
})(window);
