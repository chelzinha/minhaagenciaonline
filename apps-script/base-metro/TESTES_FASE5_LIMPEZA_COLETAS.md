# Testes — Fase 5: Limpeza controlada de COLETAS

## Validação antes da remoção
1. Publique o backend e confirme que CRM, Agenda e Dashboard continuam abrindo.
2. Execute `previewRemocaoColetasFase5()`.
3. Registre os totais exibidos no preview.
4. Execute `backupAntesRemocaoColetasFase5()`.
5. Abra o `backupUrl` retornado e confirme que a cópia está acessível.

## Validação após a remoção
1. Execute `removeColetasFase5('EXCLUIR_COLETAS')`.
2. Execute `auditRemocaoColetasFase5()`.
3. Confirme `ok: true` e `residualTotal: 0`.
4. Confirme que `COLETAS_EXECUCAO` não existe mais.
5. Confirme que Agenda não oferece tipo de atividade relacionado a coletas.
6. Confirme que prospects não possuem colunas exclusivas de coletas.
7. Confirme que checklist não possui colunas exclusivas de coletas.
8. Confirme que blocos antes usados para coletas continuam disponíveis como janelas genéricas de Agenda.
9. Confirme que nenhum prospect ficou em etapa `COLETA`.
10. Confirme que links de mídias válidas continuam abrindo.

## Regressão funcional
1. Login interno.
2. `/agf/` e card CRM.
3. `/intra/` Gerencial.
4. `/crm/` Home.
5. Kanban de prospects.
6. Kanban de clientes.
7. Criação de ligação em `+ Agenda`.
8. Criação de visita presencial em `+ Agenda`.
9. Conclusão de atividade e transição de etapa.
10. Etiquetas.
11. Balcão.
12. Nuvemshop.
13. SuperFrete.

## Reversão
1. Reimplante o backend anterior.
2. Restaure a planilha usando o `backupUrl` criado antes da remoção.
3. Publique novamente o frontend anterior caso necessário.


## Fix 5.0.1 — execução manual no editor
O editor do Apps Script executa funções sem argumentos. Para realizar a exclusão confirmada pelo seletor **Executar**, use:
```javascript
executarRemocaoColetasConfirmadaFase5()
```
A função chama internamente `removeColetasFase5('EXCLUIR_COLETAS')`.
