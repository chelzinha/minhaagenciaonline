-- Conector Shopify - configuração de envio por loja e ajustes por pedido

CREATE TABLE IF NOT EXISTS shopify_shop_settings (
  shop_domain TEXT PRIMARY KEY,
  package_format TEXT NOT NULL DEFAULT 'CAIXA',
  length_cm REAL,
  width_cm REAL,
  height_cm REAL,
  default_weight_grams INTEGER,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (shop_domain) REFERENCES shopify_shops(shop_domain) ON DELETE CASCADE
);

-- Frete Shopify (título normalizado) -> serviço Correios genérico.
-- O código do serviço no contrato (ex.: SEDEX contrato) é resolvido na emissão.
CREATE TABLE IF NOT EXISTS shopify_shipping_service_map (
  shop_domain TEXT NOT NULL,
  shipping_key TEXT NOT NULL,
  shipping_title TEXT NOT NULL,
  correios_service TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (shop_domain, shipping_key),
  FOREIGN KEY (shop_domain) REFERENCES shopify_shops(shop_domain) ON DELETE CASCADE
);

ALTER TABLE shopify_orders ADD COLUMN district TEXT;
ALTER TABLE shopify_orders ADD COLUMN district_source TEXT;
ALTER TABLE shopify_orders ADD COLUMN cep_city TEXT;
ALTER TABLE shopify_orders ADD COLUMN cep_uf TEXT;
ALTER TABLE shopify_orders ADD COLUMN cep_checked_at TEXT;
ALTER TABLE shopify_orders ADD COLUMN pkg_length_cm REAL;
ALTER TABLE shopify_orders ADD COLUMN pkg_width_cm REAL;
ALTER TABLE shopify_orders ADD COLUMN pkg_height_cm REAL;
ALTER TABLE shopify_orders ADD COLUMN pkg_weight_grams INTEGER;
