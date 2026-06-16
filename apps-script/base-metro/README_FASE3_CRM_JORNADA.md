# CRM AGF — Fase 3: Jornada e Agenda Comercial

Esta versão é aditiva. Ela mantém todas as rotas antigas e acrescenta o backend da nova jornada comercial.

## Instalação
1. Faça backup do projeto Apps Script atual e das planilhas APP Total CF + Metro e APP Etiquetas AGF.
2. Substitua os arquivos do projeto pelo conteúdo completo deste pacote.
3. Preserve a mesma implantação Web App `/exec`.
4. Execute manualmente `setupCrmJornadaFase3()`.
5. Execute `auditCrmJornadaFase3()`.
6. Execute `smokeTestCrmJornadaFase3()`.
7. Execute `previewMigracaoTratativasFase3()` antes de criar tratativas iniciais.
8. Somente após revisar o preview, execute `migrateTratativasFase3()`.

## Rotas novas
### GET
- `get_crm_config_v3`
- `get_crm_jornada_data`
- `get_crm_agenda_v3`
- `get_crm_dashboard_v3`

### POST
- `create_tratativa`
- `move_tratativa`
- `save_atividade`
- `complete_atividade`
- `cancel_atividade`
- `delete_agenda_item`

## Observações
- `VISITAR` não é recomendação do motor. A visita presencial usa `ATV_VISITA`.
- Todas as atividades podem aparecer na Agenda.
- A exclusão é bloqueada para atividades já concluídas.
- A migração inicial não altera `ACAO_ENGINE` nem as regras automáticas atuais.
- Não remova o arquivo `05_CRM_CANONICO_FASE2.js`: a Fase 3 reaproveita seus schemas e helpers.
