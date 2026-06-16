AGF AUTH — Reverso Expedição v1.6.0
======================================

Alteração:
- Incluída a chave reverso-expedicao no catálogo AGF_AUTH_CFG.APPS.
- Label: Expedição Reverso.
- Path: /reverso-expedicao/.
- Categoria: Logística reversa.
- Permite roles admin, manager e user, mas defaultEnabled=false para não liberar automaticamente.

Depois de subir no Apps Script:
1. Salve todos os arquivos.
2. Execute migrateAgfAuthV7() uma vez, se quiser limpar cache e registrar a migração.
3. Faça nova implantação do Web App.
4. Abra /agf/usuarios/ e confirme a opção Expedição Reverso em Aplicativos permitidos.
