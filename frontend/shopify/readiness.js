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

  const SERVICE_LABELS = { SEDEX: 'SEDEX', PAC: 'PAC', MINI_ENVIOS: 'Mini Envios', NAO_CORREIOS: 'Não Correios' };
  const SOURCE_LABELS = { CEP: 'pelo CEP', MANUAL: 'informado manualmente', LOJA: 'padrão da loja', PEDIDO: 'ajustado no pedido', SHOPIFY: 'da Shopify' };
  const current = { shop: '', orderId: '' };

  function setDistrictField(container, value) {
    const field = container.querySelector('[data-agf-district] .detail-value');
    if (field) field.textContent = value;
  }

  function districtCheck(agf) {
    if (!agf) {
      return { status: 'warn', note: 'A Shopify não separou bairro e complemento de forma confiável. Validar pelo CEP antes da postagem.' };
    }
    const d = agf.district || {};
    if (d.value) {
      if (d.cityMatches === false) {
        return {
          status: 'warn',
          note: d.value + ' (' + (SOURCE_LABELS[d.source] || 'informado') + '). Atenção: o CEP pertence a ' +
            text(d.cepCity) + '/' + text(d.cepUf) + ', diferente da cidade informada na Shopify.'
        };
      }
      return { status: 'ok', note: d.value + ' (' + (SOURCE_LABELS[d.source] || 'informado') + ').' };
    }
    if (d.cepStatus === 'NOT_FOUND') return { status: 'block', note: 'CEP não encontrado na base de CEPs. Conferir o endereço com o cliente.' };
    if (d.cepStatus === 'UNAVAILABLE') return { status: 'warn', note: 'Consulta de CEP indisponível agora. Informe o bairro em "Ajustes deste pedido".' };
    return { status: 'block', note: 'CEP sem bairro na base (CEP geral da cidade). Informe o bairro em "Ajustes deste pedido".' };
  }

  function packageChecks(agf, packageData) {
    if (!agf) {
      const grams = Number(packageData.weightGrams || 0);
      return {
        weight: { status: grams > 0 ? 'ok' : 'warn', note: grams > 0 ? grams + ' g recebidos da Shopify.' : 'Peso não informado pela Shopify.' },
        dims: { status: 'warn', note: 'Não fornecidas pela Shopify; configure a embalagem padrão da loja.' }
      };
    }
    const pkg = agf.package || {};
    const weight = pkg.weight
      ? { status: 'ok', note: pkg.weight.grams + ' g (' + (SOURCE_LABELS[pkg.weight.source] || '') + ').' }
      : { status: 'block', note: 'Sem peso. Informe o peso padrão da loja ou ajuste o pedido.' };
    const d = pkg.dimensions;
    const dims = d
      ? { status: 'ok', note: d.lengthCm + ' x ' + d.widthCm + ' x ' + d.heightCm + ' cm (' + (SOURCE_LABELS[d.source] || '') + ').' }
      : { status: 'block', note: 'Sem dimensões. Configure a embalagem padrão em "Configuração de envio".' };
    return { weight, dims };
  }

  function serviceCheck(agf, shipping) {
    if (!agf) {
      const ok = isCorreiosService(shipping);
      return {
        status: ok ? 'ok' : 'block',
        note: ok ? 'Frete reconhecido como serviço Correios.' : 'Frete Shopify "' + text(shipping.title, 'não informado') + '" ainda não está mapeado.'
      };
    }
    const service = agf.service && agf.service.correiosService;
    const title = text(agf.service && agf.service.shippingTitle, 'não informado');
    if (!service) {
      return { status: 'block', note: 'Frete Shopify "' + title + '" sem serviço definido. Defina em "Configuração de envio".' };
    }
    if (service === 'NAO_CORREIOS') {
      return { status: 'block', note: 'Frete "' + title + '" está marcado como não postado pelos Correios.' };
    }
    if (service === 'MINI_ENVIOS') {
      const limits = agf.limits && agf.limits.miniEnvios;
      const pkg = agf.package || {};
      const d = pkg.dimensions;
      const grams = pkg.weight ? pkg.weight.grams : 0;
      const tooBig = limits && d && (d.lengthCm > limits.length || d.widthCm > limits.width || d.heightCm > limits.height);
      const tooHeavy = limits && grams > limits.weightGrams;
      if (tooBig || tooHeavy) {
        return {
          status: 'block',
          note: 'Mini Envios aceita até ' + limits.length + ' x ' + limits.width + ' x ' + limits.height + ' cm e ' + limits.weightGrams + ' g. Ajuste a embalagem ou o serviço.'
        };
      }
    }
    return { status: 'ok', note: '"' + title + '" vai como ' + SERVICE_LABELS[service] + '.' };
  }

  function inputField(labelText, id, value, attrs) {
    const label = document.createElement('label');
    label.textContent = labelText;
    const input = document.createElement('input');
    input.id = id;
    input.value = value === null || value === undefined ? '' : String(value);
    Object.entries(attrs || {}).forEach(([key, val]) => input.setAttribute(key, val));
    label.appendChild(input);
    return label;
  }

  function renderAdjustments(container, agf) {
    const previous = container.querySelector('.agf-adjustments');
    if (previous) previous.remove();
    if (!agf) return;

    const block = document.createElement('section');
    block.className = 'detail-block detail-block-wide agf-adjustments';

    const heading = document.createElement('h3');
    heading.textContent = 'Ajustes deste pedido';
    block.appendChild(heading);

    if (!agf.imported) {
      const note = document.createElement('p');
      note.className = 'section-note';
      note.textContent = 'Pedido ainda não importado para a Plataforma AGF. Clique em "Importar da Shopify" para habilitar os ajustes.';
      block.appendChild(note);
      container.appendChild(block);
      return;
    }

    const pkg = agf.package || {};
    const dims = pkg.dimensions && pkg.dimensions.source === 'PEDIDO' ? pkg.dimensions : null;
    const weight = pkg.weight && pkg.weight.source === 'PEDIDO' ? pkg.weight.grams : null;

    const note = document.createElement('p');
    note.className = 'section-note';
    note.textContent = 'Preencha só o que for diferente do padrão. Campos de embalagem vazios voltam a usar o padrão da loja.';

    const grid = document.createElement('div');
    grid.className = 'adjust-grid';
    grid.append(
      inputField('Bairro', 'adjDistrict', agf.district && agf.district.value, { maxlength: '80', autocomplete: 'off' }),
      inputField('Comprimento (cm)', 'adjLength', dims && dims.lengthCm, { type: 'number', inputmode: 'decimal', step: '0.1', min: '15', max: '100' }),
      inputField('Largura (cm)', 'adjWidth', dims && dims.widthCm, { type: 'number', inputmode: 'decimal', step: '0.1', min: '10', max: '100' }),
      inputField('Altura (cm)', 'adjHeight', dims && dims.heightCm, { type: 'number', inputmode: 'decimal', step: '0.1', min: '1', max: '100' }),
      inputField('Peso (g)', 'adjWeight', weight, { type: 'number', inputmode: 'numeric', step: '1', min: '1', max: '30000' })
    );

    const feedback = document.createElement('div');
    feedback.className = 'message';
    feedback.hidden = true;

    const actions = document.createElement('div');
    actions.className = 'actions';
    const save = document.createElement('button');
    save.type = 'button';
    save.className = 'btn-primary';
    save.textContent = 'Salvar ajustes';
    actions.appendChild(save);

    save.addEventListener('click', async function () {
      const value = (id) => String(document.getElementById(id).value || '').trim();
      save.disabled = true;
      save.textContent = 'Salvando...';
      feedback.hidden = true;
      try {
        await global.AgfShopify.saveOrderShipping(current.shop, current.orderId, {
          district: value('adjDistrict'),
          package: {
            lengthCm: value('adjLength') || null,
            widthCm: value('adjWidth') || null,
            heightCm: value('adjHeight') || null,
            weightGrams: value('adjWeight') || null
          }
        });
        await global.AgfShopify.getOrder(current.shop, current.orderId);
      } catch (error) {
        feedback.textContent = error.message || 'Não foi possível salvar os ajustes.';
        feedback.className = 'message error';
        feedback.hidden = false;
        save.disabled = false;
        save.textContent = 'Salvar ajustes';
      }
    });

    block.append(note, grid, feedback, actions);
    container.appendChild(block);
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
    const agf = data && data.agfShipping ? data.agfShipping : null;

    if (agf && agf.district && agf.district.value) setDistrictField(container, agf.district.value);

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
    const checks = [];
    function add(label, check) {
      checks.push({ label, status: check.status });
      grid.appendChild(createCheck(label, check.status, check.note));
    }

    add('Destinatário', {
      status: recipient.name && documentData ? 'ok' : 'block',
      note: recipient.name && documentData ? 'Nome e CPF/CNPJ disponíveis.' : 'Nome e CPF/CNPJ são necessários.'
    });

    const addressOk = address.address1 && address.city && (address.provinceCode || address.province) && address.postalCode;
    add('Endereço principal', {
      status: addressOk ? 'ok' : 'block',
      note: addressOk ? 'Logradouro, cidade, UF e CEP disponíveis.' : 'Há dados obrigatórios do endereço ausentes.'
    });

    add('Bairro', districtCheck(agf));
    const pkgChecks = packageChecks(agf, packageData);
    add('Peso', pkgChecks.weight);
    add('Dimensões', pkgChecks.dims);
    add('Serviço Correios', serviceCheck(agf, shipping));
    add('Conta Correios', accountReadiness(correios));

    const fulfilled = String(order.fulfillmentStatus || '').toUpperCase() === 'FULFILLED';
    add('Situação do pedido', {
      status: fulfilled ? 'block' : 'ok',
      note: fulfilled
        ? 'O pedido já consta como Fulfilled na Shopify; revisar antes de gerar nova postagem.'
        : 'Pedido ainda não consta como totalmente expedido na Shopify.'
    });

    const blocking = checks.filter((item) => item.status === 'block').map((item) => item.label);
    const footer = document.createElement('div');
    footer.className = 'readiness-footer';
    const strong = document.createElement('strong');
    strong.textContent = blocking.length ? 'Bloqueios: ' : 'Pronto: ';
    footer.appendChild(strong);
    footer.append(blocking.length
      ? blocking.join(', ') + '. Nenhuma etiqueta é gerada enquanto houver bloqueios.'
      : 'todos os dados de envio conferidos. Falta apenas o XML da NF-e (próxima etapa).');

    block.append(head, grid, footer);
    container.appendChild(block);
    renderAdjustments(container, agf);
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
      current.shop = shop;
      current.orderId = orderId;
      const data = await original.getOrder(shop, orderId);
      data.agfCore = await loadAgfCoreContext();
      setTimeout(function () { renderReadiness(data); }, 0);
      return data;
    }
  }));

  global.addEventListener('agf-shopify:shipping-config-saved', function (event) {
    const card = document.getElementById('orderDetailCard');
    const shop = event.detail && event.detail.shop;
    if (!card || card.hidden || !current.orderId || shop !== current.shop) return;
    global.AgfShopify.getOrder(current.shop, current.orderId).catch(function () { return null; });
  });
})(window);
