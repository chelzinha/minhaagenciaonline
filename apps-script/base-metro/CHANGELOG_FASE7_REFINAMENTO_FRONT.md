# Changelog — Fase 7: Refinamento UX/UI do CRM

- Checklists por entidade podem ser consultados pela rota `get_entity_checklists_v7`.
- Salvamentos de checklist aceitam `REQUEST_ID` e evitam duplicidade por reenvio.
- Novos cabeçalhos aditivos em `CRM_VISITA_CHECKLIST`: `REQUEST_ID`, `ATUALIZADO_EM`.
- A rota `save_checklist` passa a registrar também identificadores da tratativa, atividade, resultado e responsável quando informados.
- Nenhuma rota legada foi removida.
