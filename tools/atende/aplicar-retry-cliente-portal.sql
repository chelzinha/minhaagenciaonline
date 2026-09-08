WITH cons_base AS (
  SELECT * FROM (
    SELECT
      cr.*,
      ROW_NUMBER() OVER (
        PARTITION BY CASE
          WHEN TRIM(COALESCE(cr.venda_pp_norm,''))<>'' THEN cr.venda_pp_norm
          ELSE cr.import_key||':'||cr.id
        END
        ORDER BY cr.id DESC
      ) AS dup_rn
    FROM consolidador_raw cr
    JOIN consolidador_importacoes ci
      ON ci.import_key=cr.import_key
     AND ci.concluido_em IS NOT NULL
    WHERE TRIM(COALESCE(cr.cliente_norm,''))<>''
  )
  WHERE dup_rn=1
),
cons_dsv AS (
  SELECT
    cb.data_iso,
    cb.ect_norm,
    ROUND(ABS(COALESCE(cb.valor_num,0)),2) AS valor_abs,
    MAX(cb.cliente) AS cliente,
    MAX(cb.cliente_norm) AS cliente_norm,
    CASE
      WHEN COUNT(DISTINCT NULLIF(TRIM(COALESCE(cb.cx_at,'')),''))=1
      THEN MAX(cb.cx_at)
      ELSE ''
    END AS cx_at
  FROM cons_base cb
  WHERE UPPER(TRIM(COALESCE(cb.objeto_norm,''))) NOT LIKE '%BR'
    AND TRIM(COALESCE(cb.data_iso,''))<>''
    AND TRIM(COALESCE(cb.ect_norm,''))<>''
    AND TRIM(COALESCE(cb.cliente_norm,''))<>''
  GROUP BY
    cb.data_iso,
    cb.ect_norm,
    ROUND(ABS(COALESCE(cb.valor_num,0)),2)
  HAVING COUNT(DISTINCT cb.cliente_norm)=1
),
at_unmatched AS (
  SELECT
    r.id AS raw_id,
    substr(r.data_postagem_iso,1,10) AS data_iso,
    r.codigo_servico_norm AS ect_norm,
    ROUND(ABS(COALESCE(r.valor_atendimento_num,0)),2) AS valor_abs
  FROM atende_postagens_raw r
  JOIN atende_raw_importacoes ri
    ON ri.import_key=r.import_key
   AND ri.concluido_em IS NOT NULL
  LEFT JOIN atende_cliente_portal ap
    ON ap.raw_id=r.id
  WHERE ap.raw_id IS NULL
    AND UPPER(TRIM(COALESCE(r.codigo_objeto_norm,''))) NOT LIKE '%BR'
    AND TRIM(COALESCE(r.data_postagem_iso,''))<>''
    AND TRIM(COALESCE(r.codigo_servico_norm,''))<>''
)
INSERT OR IGNORE INTO atende_cliente_portal(
  raw_id,
  source_key,
  cliente_portal,
  cliente_portal_norm,
  origem_cliente,
  confianca,
  cx_at,
  atualizado_em
)
SELECT
  a.raw_id,
  'DSV:'||a.data_iso||':'||a.ect_norm||':'||printf('%.2f',a.valor_abs),
  c.cliente,
  c.cliente_norm,
  'ATENDIMENTO',
  'MEDIA',
  c.cx_at,
  datetime('now')
FROM at_unmatched a
JOIN cons_dsv c
  ON c.data_iso=a.data_iso
 AND c.ect_norm=a.ect_norm
 AND ABS(c.valor_abs-a.valor_abs)<0.011;
