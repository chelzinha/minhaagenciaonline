# TESTES - CENTRAL AGF Motor V1 v0.3.2

## Pre-condicoes

1. Projeto Apps Script vinculado a `CONSULTA_HISTORICA_POSTAGENS`.
2. Arquivos de `apps-script/central-agf` enviados integralmente para o projeto.
3. Nenhum script atual de producao deve ser alterado.

## Ordem de homologacao

1. Executar `centralAgfAutoConfigurar()` e autorizar Drive/Sheets.
2. Executar `centralAgfSincronizarCatalogoParticoes()`.
3. Executar `centralAgfValidarHistorico()`.
4. Conferir `07_HOMOLOGACAO`: todas as particoes precisam ter `STATUS_LINHAS=OK`, `STATUS_FATURAMENTO=OK` e `STATUS_PERIODO=OK` antes de avancar.
5. Alertas de duplicidade de SRO/FATO_ID podem permanecer como `REVISAR`: eles nao bloqueiam o diagnostico somente leitura e nunca autorizam deduplicacao automatica.
6. Em `01_PARAMETROS`, testar primeiro um unico mes com `MODO=POSTAGENS`.
7. Executar `centralAgfAtualizarVisao()` e conferir `03_POSTAGENS`.
8. Comparar contagem de linhas e faturamento com a particao mensal.
9. Testar filtros de Centro e Local.
10. Somente depois deixar DATA_INICIO/DATA_FIM vazias e testar todo o historico.
11. Com linhas, faturamento e periodo homologados, executar `centralAgfGerarDiagnosticoIdentidade()`.
12. Revisar `CADASTRO_MESTRE_CLIENTES!13_DIAGNOSTICO_IDENTIDADE` sem editar fatos.
13. Confirmar que `SEM_REGISTRO`, `PRODUTO_ECT` e outros fatos sem SRO nao aparecem como candidatos de cliente.

## Regressao

- `APP MODELO_AGF` atual permanece inalterado.
- Base Metro atual permanece inalterada.
- CRM atual permanece inalterado.
- `FATOS_POSTAGENS_AAAA_MM` sao somente leitura nesta fase.
- Nenhum `CLIENTE_ID` novo e criado automaticamente.
- Nenhum Centro/Local final e gravado automaticamente.
- Fatos sem SRO permanecem no faturamento/historico, mas nao entram na identificacao nem na contagem de clientes.
- Duplicidades de SRO/FATO_ID permanecem registradas em `07_HOMOLOGACAO` e `09_RECONCILIACAO_FONTES`; nao sao apagadas nem mescladas automaticamente.

## Criterio para avancar

So iniciar a migracao efetiva do Cadastro Mestre depois de:

- todas as particoes terem `STATUS_LINHAS=OK`, `STATUS_FATURAMENTO=OK` e `STATUS_PERIODO=OK`;
- consulta de um mes bater com a particao;
- consulta de periodo total bater com a soma do catalogo;
- diagnostico de identidade conter somente fatos elegiveis com SRO real;
- diagnostico de identidade ser revisado como visao derivada, nao como fonte de verdade;
- alertas de SRO/FATO_ID repetidos permanecerem preservados para reconciliacao com a fonte, sem deduplicacao automatica.
