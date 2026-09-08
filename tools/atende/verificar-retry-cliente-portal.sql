SELECT
  COUNT(*) AS total_retry_dsv,
  SUM(CASE WHEN substr(r.data_postagem_iso,1,10) BETWEEN '2026-08-01' AND '2026-08-31' THEN 1 ELSE 0 END) AS agosto_retry_dsv,
  SUM(CASE WHEN ap.origem_cliente='ATENDIMENTO' THEN 1 ELSE 0 END) AS origem_atendimento,
  SUM(CASE WHEN ap.confianca='MEDIA' THEN 1 ELSE 0 END) AS confianca_media
FROM atende_cliente_portal ap
JOIN atende_postagens_raw r ON r.id=ap.raw_id
WHERE ap.source_key LIKE 'DSV:%';

SELECT
  r.id AS raw_id,
  substr(r.data_postagem_iso,1,10) AS data,
  COALESCE(r.codigo_objeto,'') AS objeto_raw,
  r.codigo_servico AS ect,
  ROUND(ABS(COALESCE(r.valor_atendimento_num,0)),2) AS valor,
  r.atendimento,
  ap.cliente_portal,
  ap.origem_cliente,
  ap.confianca,
  ap.source_key
FROM atende_cliente_portal ap
JOIN atende_postagens_raw r ON r.id=ap.raw_id
WHERE ap.source_key LIKE 'DSV:%'
  AND substr(r.data_postagem_iso,1,10) BETWEEN '2026-08-01' AND '2026-08-31'
ORDER BY data, raw_id;
