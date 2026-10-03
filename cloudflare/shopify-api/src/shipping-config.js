// Conector Shopify - configuração de envio
// Mapa frete Shopify -> serviço Correios, embalagem padrão da loja,
// bairro pelo CEP e ajustes manuais por pedido.

// ------------------------------------------------------------ CFG

export const CORREIOS_SERVICES = Object.freeze(['SEDEX', 'PAC', 'MINI_ENVIOS', 'NAO_CORREIOS']);
export const PACKAGE_FORMATS = Object.freeze(['CAIXA', 'ENVELOPE']);

// Limites de objeto Correios (caixa/pacote). Mini Envios tem limite próprio.
export const PACKAGE_LIMITS = Object.freeze({
  min: { length: 15, width: 10, height: 1 },
  maxSide: 100,
  maxSum: 200,
  maxWeightGrams: 30000,
  miniEnvios: { length: 24, width: 16, height: 4, weightGrams: 300 }
});

const CEP_TIMEOUT_MS = 4000;

// ------------------------------------------------------------ helpers

function httpError(message, status) {
  return Object.assign(new Error(message), { status });
}

export function normalizeShippingKey(title) {
  return String(title || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim();
}

function normalizeText(value) {
  return normalizeShippingKey(value);
}

function positiveNumber(value, label, { integer = false, max = Infinity } = {}) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(String(value).replace(',', '.'));
  if (!Number.isFinite(parsed) || parsed <= 0) throw httpError(label + ' deve ser um número maior que zero.', 400);
  if (parsed > max) throw httpError(label + ' acima do limite permitido.', 400);
  return integer ? Math.round(parsed) : Math.round(parsed * 10) / 10;
}

export function validatePackage(input, { requireAll = false } = {}) {
  const pkg = {
    lengthCm: positiveNumber(input?.lengthCm, 'Comprimento', { max: PACKAGE_LIMITS.maxSide }),
    widthCm: positiveNumber(input?.widthCm, 'Largura', { max: PACKAGE_LIMITS.maxSide }),
    heightCm: positiveNumber(input?.heightCm, 'Altura', { max: PACKAGE_LIMITS.maxSide }),
    weightGrams: positiveNumber(input?.weightGrams ?? input?.defaultWeightGrams, 'Peso', {
      integer: true,
      max: PACKAGE_LIMITS.maxWeightGrams
    })
  };

  const dims = [pkg.lengthCm, pkg.widthCm, pkg.heightCm];
  const filled = dims.filter((value) => value !== null).length;
  if (filled > 0 && filled < 3) throw httpError('Informe comprimento, largura e altura juntos.', 400);
  if (requireAll && filled === 0) throw httpError('Informe as dimensões da embalagem.', 400);

  if (filled === 3) {
    const { min, maxSum } = PACKAGE_LIMITS;
    if (pkg.lengthCm < min.length || pkg.widthCm < min.width || pkg.heightCm < min.height) {
      throw httpError(`Dimensões mínimas: ${min.length} x ${min.width} x ${min.height} cm.`, 400);
    }
    if (pkg.lengthCm + pkg.widthCm + pkg.heightCm > maxSum) {
      throw httpError(`A soma das dimensões não pode passar de ${maxSum} cm.`, 400);
    }
  }
  return pkg;
}

// ------------------------------------------------------------ leitura

export async function readShippingConfig(env, shop) {
  const [settings, maps, titles] = await env.DB.batch([
    env.DB.prepare('SELECT * FROM shopify_shop_settings WHERE shop_domain = ?').bind(shop),
    env.DB.prepare(
      'SELECT shipping_key, shipping_title, correios_service FROM shopify_shipping_service_map WHERE shop_domain = ?'
    ).bind(shop),
    env.DB.prepare(
      `SELECT shipping_title, COUNT(*) AS total
         FROM shopify_orders
        WHERE shop_domain = ? AND shipping_title IS NOT NULL AND shipping_title <> ''
        GROUP BY shipping_title`
    ).bind(shop)
  ]);

  const row = settings.results?.[0] || null;
  const byKey = new Map();

  for (const item of maps.results || []) {
    byKey.set(item.shipping_key, {
      shippingKey: item.shipping_key,
      shippingTitle: item.shipping_title,
      correiosService: item.correios_service,
      orders: 0
    });
  }
  for (const item of titles.results || []) {
    const key = normalizeShippingKey(item.shipping_title);
    if (!key) continue;
    const current = byKey.get(key) || {
      shippingKey: key,
      shippingTitle: item.shipping_title,
      correiosService: null,
      orders: 0
    };
    current.orders += Number(item.total || 0);
    byKey.set(key, current);
  }

  return {
    package: row ? {
      format: row.package_format || 'CAIXA',
      lengthCm: row.length_cm,
      widthCm: row.width_cm,
      heightCm: row.height_cm,
      defaultWeightGrams: row.default_weight_grams
    } : null,
    services: Array.from(byKey.values()).sort((a, b) => b.orders - a.orders || a.shippingTitle.localeCompare(b.shippingTitle))
  };
}

// ------------------------------------------------------------ gravação

export async function saveShippingConfig(env, shop, body) {
  const statements = [];

  if (body.package) {
    const format = String(body.package.format || 'CAIXA').toUpperCase();
    if (!PACKAGE_FORMATS.includes(format)) throw httpError('Formato de embalagem inválido.', 400);
    const pkg = validatePackage(body.package, { requireAll: true });
    statements.push(env.DB.prepare(
      `INSERT INTO shopify_shop_settings (shop_domain, package_format, length_cm, width_cm, height_cm, default_weight_grams, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(shop_domain) DO UPDATE SET
         package_format = excluded.package_format,
         length_cm = excluded.length_cm,
         width_cm = excluded.width_cm,
         height_cm = excluded.height_cm,
         default_weight_grams = excluded.default_weight_grams,
         updated_at = CURRENT_TIMESTAMP`
    ).bind(shop, format, pkg.lengthCm, pkg.widthCm, pkg.heightCm, pkg.weightGrams));
  }

  const services = Array.isArray(body.services) ? body.services.slice(0, 50) : [];
  for (const item of services) {
    const title = String(item?.shippingTitle || '').trim().slice(0, 120);
    const key = normalizeShippingKey(title);
    if (!key) continue;
    const service = item?.correiosService ? String(item.correiosService).toUpperCase() : '';

    if (!service) {
      statements.push(env.DB.prepare(
        'DELETE FROM shopify_shipping_service_map WHERE shop_domain = ? AND shipping_key = ?'
      ).bind(shop, key));
      continue;
    }
    if (!CORREIOS_SERVICES.includes(service)) throw httpError('Serviço Correios inválido: ' + service, 400);

    statements.push(env.DB.prepare(
      `INSERT INTO shopify_shipping_service_map (shop_domain, shipping_key, shipping_title, correios_service, updated_at)
       VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(shop_domain, shipping_key) DO UPDATE SET
         shipping_title = excluded.shipping_title,
         correios_service = excluded.correios_service,
         updated_at = CURRENT_TIMESTAMP`
    ).bind(shop, key, title, service));
  }

  if (!statements.length) throw httpError('Nada para salvar.', 400);
  await env.DB.batch(statements);
}

export async function saveOrderShipping(env, shop, orderId, body) {
  const exists = await env.DB.prepare(
    'SELECT order_gid FROM shopify_orders WHERE shop_domain = ? AND order_gid = ?'
  ).bind(shop, orderId).first();
  if (!exists) throw httpError('Pedido ainda não importado. Clique em "Importar da Shopify" e tente de novo.', 404);

  const district = body.district === undefined ? undefined : String(body.district || '').trim().slice(0, 80);
  const pkg = body.package ? validatePackage(body.package) : null;

  const sets = ['updated_at = CURRENT_TIMESTAMP'];
  const binds = [];
  if (district !== undefined) {
    sets.push('district = ?', 'district_source = ?');
    binds.push(district || null, district ? 'MANUAL' : null);
  }
  if (pkg) {
    sets.push('pkg_length_cm = ?', 'pkg_width_cm = ?', 'pkg_height_cm = ?', 'pkg_weight_grams = ?');
    binds.push(pkg.lengthCm, pkg.widthCm, pkg.heightCm, pkg.weightGrams);
  }
  binds.push(shop, orderId);
  await env.DB.prepare(
    `UPDATE shopify_orders SET ${sets.join(', ')} WHERE shop_domain = ? AND order_gid = ?`
  ).bind(...binds).run();
}

// ------------------------------------------------------------ CEP

async function fetchJson(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CEP_TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal: controller.signal, headers: { accept: 'application/json' } });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// ViaCEP com BrasilAPI de reserva. Retorna null se as duas falharem.
export async function lookupCep(cep) {
  const digits = String(cep || '').replace(/\D/g, '');
  if (digits.length !== 8) return null;

  const via = await fetchJson(`https://viacep.com.br/ws/${digits}/json/`);
  if (via && !via.erro) {
    return { district: via.bairro || null, city: via.localidade || null, uf: via.uf || null, provider: 'VIACEP' };
  }
  if (via && via.erro) return { notFound: true };

  const br = await fetchJson(`https://brasilapi.com.br/api/cep/v1/${digits}`);
  if (br && br.cep) {
    return { district: br.neighborhood || null, city: br.city || null, uf: br.state || null, provider: 'BRASILAPI' };
  }
  return null;
}

// ------------------------------------------------------------ montagem para o detalhe

export async function buildAgfShipping(env, shop, orderId, detail) {
  const draft = detail.shipmentDraft || {};
  const address = draft.address || {};
  const shippingTitle = draft.shipping?.title || '';

  const [config, row] = await Promise.all([
    readShippingConfig(env, shop),
    env.DB.prepare('SELECT * FROM shopify_orders WHERE shop_domain = ? AND order_gid = ?').bind(shop, orderId).first()
  ]);

  // Serviço
  const key = normalizeShippingKey(shippingTitle);
  const mapped = config.services.find((item) => item.shippingKey === key && item.correiosService) || null;

  // Bairro: manual > CEP já consultado > nova consulta
  let district = row?.district || null;
  let districtSource = row?.district_source || null;
  let cepCity = row?.cep_city || null;
  let cepUf = row?.cep_uf || null;
  let cepStatus = row?.cep_checked_at ? 'CHECKED' : 'PENDING';

  if (!row?.cep_checked_at && address.postalCode) {
    const found = await lookupCep(address.postalCode);
    if (found?.notFound) {
      cepStatus = 'NOT_FOUND';
    } else if (found) {
      cepStatus = 'CHECKED';
      cepCity = found.city;
      cepUf = found.uf;
      if (!district && found.district) {
        district = found.district;
        districtSource = 'CEP';
      }
    } else {
      cepStatus = 'UNAVAILABLE';
    }

    if (row && cepStatus !== 'UNAVAILABLE') {
      await env.DB.prepare(
        `UPDATE shopify_orders
            SET district = COALESCE(district, ?), district_source = COALESCE(district_source, ?),
                cep_city = ?, cep_uf = ?, cep_checked_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
          WHERE shop_domain = ? AND order_gid = ?`
      ).bind(district, districtSource, cepCity, cepUf, shop, orderId).run();
    }
  }

  const cityMatches = cepCity
    ? normalizeText(cepCity) === normalizeText(address.city) &&
      (!cepUf || !address.provinceCode || normalizeText(cepUf) === normalizeText(address.provinceCode))
    : null;

  // Embalagem: ajuste do pedido > padrão da loja; peso: pedido > Shopify > padrão da loja
  const shopPkg = config.package;
  const orderHasDims = row && row.pkg_length_cm && row.pkg_width_cm && row.pkg_height_cm;
  const dims = orderHasDims
    ? { lengthCm: row.pkg_length_cm, widthCm: row.pkg_width_cm, heightCm: row.pkg_height_cm, source: 'PEDIDO' }
    : (shopPkg && shopPkg.lengthCm
      ? { lengthCm: shopPkg.lengthCm, widthCm: shopPkg.widthCm, heightCm: shopPkg.heightCm, source: 'LOJA' }
      : null);

  const shopifyWeight = Number(draft.package?.weightGrams || 0);
  let weight = null;
  if (row?.pkg_weight_grams) weight = { grams: row.pkg_weight_grams, source: 'PEDIDO' };
  else if (shopifyWeight > 0) weight = { grams: shopifyWeight, source: 'SHOPIFY' };
  else if (shopPkg?.defaultWeightGrams) weight = { grams: shopPkg.defaultWeightGrams, source: 'LOJA' };

  return {
    imported: Boolean(row),
    service: {
      shippingTitle: shippingTitle || null,
      correiosService: mapped ? mapped.correiosService : null
    },
    district: {
      value: district,
      source: districtSource,
      cepStatus,
      cepCity,
      cepUf,
      cityMatches
    },
    package: {
      format: shopPkg?.format || 'CAIXA',
      dimensions: dims,
      weight
    },
    limits: PACKAGE_LIMITS
  };
}
