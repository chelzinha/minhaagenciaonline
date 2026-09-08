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
cons_keys AS (
  SELECT
    cb.data_iso,
    cb.ect_norm,
    ROUND(ABS(COALESCE(cb.valor_num,0)),2) AS valor_abs,
    COUNT(*) AS qtd_consolidador,
    COUNT(DISTINCT cb.cliente_norm) AS clientes_distintos,
    MAX(cb.cliente) AS cliente_exemplo
  FROM cons_base cb
  WHERE UPPER(TRIM(COALESCE(cb.objeto_norm,''))) NOT LIKE '%BR'
    AND TRIM(COALESCE(cb.data_iso,''))<>''
    AND TRIM(COALESCE(cb.ect_norm,''))<>''
  GROUP BY
    cb.data_iso,
    cb.ect_norm,
    ROUND(ABS(COALESCE(cb.valor_num,0)),2)
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
    AND substr(r.data_postagem_iso,1,10) BETWEEN '2026-08-01' AND '2026-08-31'
    AND UPPER(TRIM(COALESCE(r.codigo_objeto_norm,''))) NOT LIKE '%BR'
    AND TRIM(COALESCE(r.data_postagem_iso,''))<>''
    AND TRIM(COALESCE(r.codigo_servico_norm,''))<>''
),
classified AS (
  SELECT
    a.*,
    COALESCE(k.qtd_consolidador,0) AS qtd_consolidador,
    COALESCE(k.clientes_distintos,0) AS clientes_distintos,
    COALESCE(k.cliente_exemplo,'') AS cliente_exemplo
  FROM at_unmatched a
  LEFT JOIN cons_keys k
    ON k.data_iso=a.data_iso
   AND k.ect_norm=a.ect_norm
   AND ABS(k.valor_abs-a.valor_abs)<0.011
)
SELECT
  COUNT(*) AS sem_origem_sem_sro_agosto,
  SUM(CASE WHEN clientes_distintos=1 THEN 1 ELSE 0 END) AS match_seguro_data_servico_valor,
  SUM(CASE WHEN clientes_distintos>1 THEN 1 ELSE 0 END) AS ambiguo_multicliente,
  SUM(CASE WHEN clientes_distintos=0 THEN 1 ELSE 0 END) AS sem_candidato
FROM classified;
