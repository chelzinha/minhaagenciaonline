# TESTES - CENTRAL AGF Motor V1 v0.3.1

## Pre-condicoes

1. Projeto Apps Script vinculado a `CONSULTA_HISTORICA_POSTAGENS`.
2. Arquivos de `apps-script/central-agf` enviados integralmente para o projeto.
3. Nenhum script atual de producao deve ser alterado.

## Ordem de homologacao

1. Executar `centralAgfAutoConfigurar()` e autorizar Drive/Sheets.
2. Executar `centralAgfSincronizarCatalogoParticoes()`.
3. Executar `centralAgfValidarHistorico()`.
4. Conferir `07_HOMOLOGACAO`: todas as particoes precisam ficar `OK` antes de avancar.
5. Em `01_PARAMETROS`, testar primeiro um unico mes com `MODO=POSTAGENS`.
6. Executar `centralAgfAtualizarVisao()` e conferir `03_POSTAGENS`.
7. Comparar contagem de linhas e faturamento com a particao mensal.
8. Testar filtros de Centro e Local.
9. Somente depois deixar DATA_INICIO/DATA_FIM vazias e testar todo o historico.
10. Com historico homologado, executar `centralAgfGerarDiagnosticoIdentidade()`.
11. Revisar `CADASTRO_MESTRE_CLIENTES!13_DIAGNOSTICO_IDENTIDADE` sem editar fatos.
12. Confirmar que `SEM_REGISTRO`, `PRODUTO_ECT` e outros fatos sem SRO nao aparecem como candidatos de cliente.

## Regressao

- `APP MODELO_AGF` atual permanece inalterado.
- Base Metro atual permanece inalterada.
- CRM atual permanece inalterado.
- `FATOS_POSTAGENS_AAAA_MM` sao somente leitura nesta fase.
- Nenhum `CLIENTE_ID` novo e criado automaticamente.
- Nenhum Centro/Local final e gravado automaticamente.
- Fatos sem SRO permanecem no faturamento/historico, mas nao entram na identificacao nem na contagem de clientes.

## Criterio para avancar

So iniciar a migracao efetiva do Cadastro Mestre depois de:

- todas as particoes historicas estarem `OK`;
- consulta de um mes bater com a particao;
- consulta de periodo total bater com a soma do catalogo;
- diagnostico de identidade conter somente fatos elegiveis com SRO real;
- diagnostico de identidade ser revisado como visao derivada, nao como fonte de verdade.
