# Changelog complementar - CRM importacao em lote

Data: 2026-07-07

## Criado

- CRM/Planilha: criada rotina Apps Script separada para subir cadastros manuais de `PROSPECTS` e `CLIENTES_CADASTRO` para o fluxo do front/CRM.
- CRM/Planilha: adicionado menu `🚀 CRM` com as opcoes:
  - `Subir aba atual para o front`
  - `Subir Prospects e Clientes`
  - `Ver status da importacao CRM`
- CRM/Planilha: rotina completa IDs tecnicos, responsavel, etapa/funil, status de importacao, `TRATATIVA_ATIVA_ID`, cria/recupera `CRM_TRATATIVAS`, registra `CRM_EVENTOS` e invalida caches.
- Documentacao: criado `docs/CRM_IMPORTACAO_LOTE_PLANILHA.md` com manual tecnico e checklist de teste.

## Alterado

- Apps Script: `90_FILTROS.js` passou a chamar o menu novo sem remover o menu de filtros existente.
- Dados: `docs/PLANILHAS_E_DADOS.md` registra as colunas auxiliares `SUBIR_FRONT`, `STATUS_IMPORTACAO_CRM`, `IMPORTADO_EM` e `ERRO_IMPORTACAO_CRM`.

## Atencao sensivel

- A mudanca envolve dados cadastrais e relacao comercial entre cliente/prospect e responsavel.
- Nenhum dado real de cliente/prospect, URL completa, ID privado de planilha, token ou payload bruto foi registrado na documentacao.

## Commit sugerido ao consolidar

```bash
git commit -m "feat(crm): adiciona importacao em lote pela planilha"
```
