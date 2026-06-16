REVERSO BACKEND V1.4.1

ALTERAÇÕES
- Mantém integralmente a API existente.
- Migração atualizada: migrateReversaColetaV141.
- Compatibilidade mantida: migrateReversaColetaV140 encaminha para V1.4.1.
- Prioridade de prazo do coletador passa a considerar dias úteis.
- Novo utilitário opcional de homologação: seedReversaColetaDemoData.

COMO APLICAR
1. clasp push
2. Publicar nova versão da implantação existente do Web App.
3. Na planilha: Reversa > Aplicar migração App Coletas v1.4.1

MASSA DEMONSTRATIVA OPCIONAL
Na planilha: Reversa > Popular dados demonstrativos App Coletas
Informe o coletador_id igual ao login do Portal AGF que será usado no teste.
A rotina é idempotente para a tag [DEMO-COLETA-V141] e não duplica linhas na segunda execução.
