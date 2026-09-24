ALTER TABLE customers ADD COLUMN identity_quality TEXT NOT NULL DEFAULT 'PORTAL'
  CHECK (identity_quality IN ('PORTAL','MANUAL','PROVISIONAL'));

UPDATE customers SET identity_quality = CASE
  WHEN EXISTS (SELECT 1 FROM customer_aliases a WHERE a.customer_id=customers.id AND a.source='MANUAL') THEN 'MANUAL'
  WHEN EXISTS (SELECT 1 FROM customer_aliases a WHERE a.customer_id=customers.id AND a.kind='PORTAL') THEN 'PORTAL'
  ELSE 'PROVISIONAL' END;

-- Nome recebido e ID ficam estáveis enquanto o cadastro provisório existir.
CREATE TABLE auto_enrollment (
  sender_norm TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL UNIQUE,
  sender_name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
