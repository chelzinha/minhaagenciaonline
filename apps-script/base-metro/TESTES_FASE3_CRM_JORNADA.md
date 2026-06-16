# Testes — Fase 3 CRM Jornada

## Antes da migração
1. Execute `setupCrmJornadaFase3()`.
2. Execute `auditCrmJornadaFase3()` e confirme `blockers: 0`.
3. Execute `smokeTestCrmJornadaFase3()` e confirme `ok: true`.
4. Teste as telas antigas CRM, Prospects e Agenda.
5. Teste Etiquetas, Balcão, Nuvemshop e SuperFrete.

## Migração de tratativas
6. Execute `previewMigracaoTratativasFase3()`.
7. Revise os totais. Por padrão, clientes `MANTER` não entram na fila inicial.
8. Execute `migrateTratativasFase3()`.
9. Execute novamente `auditCrmJornadaFase3()`.

## Teste manual das novas funções
10. Crie uma tratativa com `crm3_apiCreateTratativa_({tipoEntidade:'CLIENTE', entidadeId:'CLI_...', responsavelId:'RSP_...'})`.
11. Crie uma agenda com `crm3_apiSaveAtividade_({tipoEntidade:'CLIENTE', entidadeId:'CLI_...', tratativaId:'TRT_...', tipoAtividadeId:'ATV_LIGACAO', dataProgramada:'YYYY-MM-DD', horaProgramada:'10:00'})`.
12. Conclua com `crm3_apiCompleteAtividade_({agendaId:'AGD_...', resultadoId:'RES_INTERESSE'})`.
13. Confirme a movimentação de etapa e o evento em `CRM_EVENTOS`.
14. Tente excluir uma atividade concluída e confirme o bloqueio.

## Reversão
A Fase 3 é aditiva. Para interromper o uso, volte a implantação anterior. Não exclua as novas abas até concluir a homologação.
