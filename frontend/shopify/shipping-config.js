(function (global) {
  'use strict';

  const SERVICE_OPTIONS = [
    { value: '', label: 'Não definido' },
    { value: 'SEDEX', label: 'SEDEX' },
    { value: 'PAC', label: 'PAC' },
    { value: 'MINI_ENVIOS', label: 'Mini Envios' },
    { value: 'NAO_CORREIOS', label: 'Não postar pelos Correios' }
  ];

  const state = { shop: '', loading: false, services: [] };
  const els = {};

  function bind() {
    if (els.card) return true;
    els.card = document.getElementById('shippingConfigCard');
    if (!els.card) return false;
    els.shopLabel = document.getElementById('shippingConfigShop');
    els.body = document.getElementById('shippingConfigBody');
    els.toggle = document.getElementById('shippingConfigToggle');
    els.message = document.getElementById('shippingConfigMessage');
    els.format = document.getElementById('pkgFormat');
    els.length = document.getElementById('pkgLength');
    els.width = document.getElementById('pkgWidth');
    els.height = document.getElementById('pkgHeight');
    els.weight = document.getElementById('pkgWeight');
    els.mapEmpty = document.getElementById('serviceMapEmpty');
    els.mapList = document.getElementById('serviceMapList');
    els.save = document.getElementById('shippingConfigSave');

    els.save.addEventListener('click', save);
    els.toggle.addEventListener('click', () => setCollapsed(!els.body.hidden));
    return true;
  }

  function setCollapsed(collapsed) {
    els.body.hidden = collapsed;
    els.toggle.textContent = collapsed ? 'Abrir' : 'Recolher';
    els.toggle.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
  }

  function message(text, type) {
    els.message.textContent = text || '';
    els.message.className = 'message' + (type ? ' ' + type : '');
    els.message.hidden = !text;
  }

  function setValue(input, value) {
    input.value = value === null || value === undefined ? '' : String(value);
  }

  function renderPackage(pkg) {
    els.format.value = (pkg && pkg.format) || 'CAIXA';
    setValue(els.length, pkg && pkg.lengthCm);
    setValue(els.width, pkg && pkg.widthCm);
    setValue(els.height, pkg && pkg.heightCm);
    setValue(els.weight, pkg && pkg.defaultWeightGrams);
  }

  function renderServices(services) {
    state.services = services || [];
    els.mapList.innerHTML = '';
    els.mapEmpty.hidden = state.services.length > 0;

    state.services.forEach((item, index) => {
      const row = document.createElement('div');
      row.className = 'service-row' + (item.correiosService ? '' : ' service-row-pending');

      const info = document.createElement('div');
      const title = document.createElement('strong');
      title.textContent = item.shippingTitle;
      const meta = document.createElement('span');
      meta.textContent = item.orders
        ? item.orders + (item.orders === 1 ? ' pedido importado' : ' pedidos importados')
        : 'Sem pedidos no período';
      info.append(title, meta);

      const select = document.createElement('select');
      select.dataset.index = String(index);
      select.setAttribute('aria-label', 'Serviço Correios para ' + item.shippingTitle);
      for (const option of SERVICE_OPTIONS) {
        const node = document.createElement('option');
        node.value = option.value;
        node.textContent = option.label;
        select.appendChild(node);
      }
      select.value = item.correiosService || '';

      row.append(info, select);
      els.mapList.appendChild(row);
    });
  }

  async function load(shop) {
    if (!bind()) return;
    state.shop = shop || '';
    message('');

    if (!state.shop) {
      els.card.hidden = true;
      return;
    }

    els.card.hidden = false;
    els.shopLabel.textContent = state.shop;
    els.save.disabled = true;
    els.mapList.innerHTML = '';
    els.mapEmpty.hidden = false;
    els.mapEmpty.textContent = 'Carregando configuração...';

    try {
      const data = await global.AgfShopify.getShippingConfig(state.shop);
      if (state.shop !== shop) return;
      els.mapEmpty.textContent = 'Nenhum frete encontrado. Importe os pedidos primeiro.';
      renderPackage(data.package);
      renderServices(data.services);
      const pending = (data.services || []).filter((item) => !item.correiosService).length;
      const configured = data.package && data.package.lengthCm && pending === 0 && (data.services || []).length > 0;
      setCollapsed(Boolean(configured));
      if (pending) message(pending + ' frete(s) sem serviço Correios definido.', 'error');
    } catch (error) {
      els.mapEmpty.textContent = error.message || 'Não foi possível carregar a configuração.';
    } finally {
      els.save.disabled = false;
    }
  }

  function readPackage() {
    const values = [els.length.value, els.width.value, els.height.value, els.weight.value].map((value) => String(value).trim());
    if (values.every((value) => !value)) return null;
    return {
      format: els.format.value,
      lengthCm: values[0],
      widthCm: values[1],
      heightCm: values[2],
      defaultWeightGrams: values[3] || null
    };
  }

  async function save() {
    if (!state.shop || state.loading) return;

    const pkg = readPackage();
    const selects = Array.from(els.mapList.querySelectorAll('select'));
    const services = selects.map((select) => ({
      shippingTitle: state.services[Number(select.dataset.index)].shippingTitle,
      correiosService: select.value || null
    }));

    if (!pkg && !services.length) {
      message('Preencha a embalagem padrão ou defina ao menos um frete.', 'error');
      return;
    }

    state.loading = true;
    els.save.disabled = true;
    els.save.textContent = 'Salvando...';
    message('');

    try {
      const payload = { services };
      if (pkg) payload.package = pkg;
      const data = await global.AgfShopify.saveShippingConfig(state.shop, payload);
      renderPackage(data.package);
      renderServices(data.services);
      const pending = (data.services || []).filter((item) => !item.correiosService).length;
      message(pending
        ? 'Configuração salva. Ainda há ' + pending + ' frete(s) sem serviço definido.'
        : 'Configuração salva. Abra um pedido para conferir a prontidão.', pending ? 'error' : 'success');
      global.dispatchEvent(new CustomEvent('agf-shopify:shipping-config-saved', { detail: { shop: state.shop } }));
    } catch (error) {
      message(error.message || 'Não foi possível salvar a configuração.', 'error');
    } finally {
      state.loading = false;
      els.save.disabled = false;
      els.save.textContent = 'Salvar configuração';
    }
  }

  global.addEventListener('agf-shopify:shop-selected', (event) => {
    load(event.detail && event.detail.shop);
  });

  global.AgfShopifyShippingConfig = Object.freeze({ reload: () => load(state.shop) });
})(window);
