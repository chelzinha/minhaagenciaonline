# TESTES - CENTRAL AGF Motor V1 v0.9.0

## Pre-condicoes

1. Projeto Apps Script vinculado a `CONSULTA_HISTORICA_POSTAGENS`.
2. Arquivos de `apps-script/central-agf` enviados integralmente para o projeto.
3. Nenhum script atual de producao deve ser alterado.

## Ordem de homologacao

1. Executar `centralAgfAutoConfigurar()` e autorizar Drive/Sheets.
2. Executar `centralAgfSincronizarCatalogoParticoes()`.
3. Executar `centralAgfValidarHistorico()`.
4. Conferir `07_HOMOLOGACAO`: todas as particoes precisam ter `STATUS_LINHAS=OK`, `STATUS_FATURAMENTO=OK` e `STATUS_PERIODO=OK`.
5. Alertas de duplicidade de SRO/FATO_ID podem permanecer como `REVISAR`: nao autorizam deduplicacao automatica.
6. Executar `centralAgfGerarDiagnosticoIdentidade()`.
7. Executar `centralAgfGerarPreviaMigracaoClientes()`.
8. Executar `centralAgfGerarAssistenciaRevisaoIdentidade()`.
9. Executar `centralAgfGerarLoteSeguroMigracaoClientes()` e exigir zero conflitos em `19_CONFLITOS_LOTE_SEGURO`.
10. Executar `centralAgfGerarPropostaClienteId()` e exigir zero conflitos em `22_CONFLITOS_PROPOSTA_ID`.
11. Executar `centralAgfAuditarQualidadePropostaMaster()`.
12. Conferir `24_AUDITORIA_QUALIDADE_MASTER` e `25_RESUMO_QUALIDADE_MASTER` antes de qualquer escrita em `01_CLIENTES_MASTER`.
13. Confirmar que nenhuma dessas etapas escreveu em `01_CLIENTES_MASTER`.

## Baseline da proposta de Cliente ID v0.8.0

A execucao homologada produziu:

- 2.140 identidades de entrada;
- 2.140 `PRONTO_PROPOSTA_ID`;
- 0 `JA_EXISTE_MASTER`;
- 0 conflitos;
- 0 preenchimentos automaticos de `LOCAL_ID_PRINCIPAL`;
- 0 escritas em `01_CLIENTES_MASTER`.

## Baseline homologado do lote seguro v0.7.1

- 2.170 linhas `PRONTO_PREVIA` de entrada;
- 2.140 identidades unicas por Centro + canonico;
- 29 identidades consolidadas pela regra AGF Balcao + contrato no mesmo canonico;
- 2.140 identidades em `PRONTO_LOTE_SEGURO`;
- 0 conflitos residuais;
- 1.106 identidades `CTR_AGF`;
- 1.034 identidades `CTR_METRO`;
- R$ 4.887.208,27 de faturamento preservado integralmente no lote seguro.

## Regressao das regras de Centro

1. `RAZAO_SOCIAL=BALCÃO` deve sempre resultar em Centro `CTR_AGF` e tipo `AGF_BALCAO_REMETENTE`, independentemente de `CENTRO_ORIGEM`.
2. `RAZAO_SOCIAL=GAS SHOPPING METRO` deve sempre resultar em Centro `CTR_METRO` e tipo `METRO_REMETENTE`, independentemente de `CENTRO_ORIGEM`.
3. Para razoes sociais diferentes dessas duas regras comerciais, `CENTRO_ID_FINAL=CTR_METRO` deve resultar em `METRO_REMETENTE`.
4. Para razoes sociais diferentes dessas duas regras comerciais, `CENTRO_ID_FINAL=CTR_AGF` deve manter classificacao AGF.
5. Sem Centro final e sem regra comercial explicita, `CENTRO_ORIGEM` pode orientar classificacao provisoria.
6. Nenhuma dessas regras pode gravar `CLIENTE_ID`, `CENTRO_ID_FINAL` ou `LOCAL_ID_FINAL` nos fatos mensais.

## Regressao do lote seguro - v0.7.1

1. A entrada deve conter somente linhas `STATUS_PREVIA=PRONTO_PREVIA` da aba 14.
2. A soma de `FATURAMENTO_TOTAL` do lote seguro + conflitos deve bater com o faturamento das linhas de entrada `PRONTO_PREVIA`.
3. A consolidacao deve agrupar por `CENTRO_SUGERIDO + NOME_CANONICO normalizado`.
4. O mesmo nome canonico presente em mais de um Centro deve ir para `19_CONFLITOS_LOTE_SEGURO`.
5. Em `CTR_AGF`, a combinacao exata `AGF_BALCAO_REMETENTE + AGF_RAZAO_SOCIAL` para o mesmo canonico deve consolidar em `AGF_RAZAO_SOCIAL`.
6. Qualquer outra combinacao de mais de um `TIPO_IDENTIDADE` para a mesma chave deve ir para conflitos.
7. `LOTE_ITEM_ID` deve ser deterministico para a mesma combinacao Centro + canonico.
8. Nenhuma execucao deve gravar no Master ou nos fatos mensais.

## Regressao da proposta de Cliente ID - v0.8.0

1. A funcao deve recusar execucao se `20_RESUMO_LOTE_SEGURO` tiver conflito residual.
2. A quantidade lida de `18_LOTE_SEGURO_CLIENTES` deve bater exatamente com `PRONTO_LOTE_SEGURO`.
3. O `CLIENTE_ID_PROPOSTO` deve ter formato `CLI_` + 20 caracteres hexadecimais.
4. O mesmo `LOTE_ITEM_ID` deve gerar exatamente o mesmo `CLIENTE_ID_PROPOSTO` em execucoes repetidas.
5. O ID proposto nao deve conter nome, Centro, CPF/CNPJ ou outro significado comercial visivel.
6. Duplicidade de chave, colisao de ID ou conflito com Master deve ir para `22_CONFLITOS_PROPOSTA_ID`.
7. `LOCAL_ID_PRINCIPAL`, `CNPJ_CPF` e `NOME_FANTASIA` devem permanecer vazios sem fonte homologada.
8. `STATUS_CADASTRO` deve nascer `PENDENTE_HOMOLOGACAO`.
9. `23_RESUMO_PROPOSTA_ID` deve registrar zero escritas em `01_CLIENTES_MASTER`.
10. Reexecucao com a mesma entrada nao pode duplicar linhas nem mudar os IDs propostos.

## Regressao da auditoria de qualidade - v0.9.0

1. `centralAgfAutoConfigurar()` deve resolver tambem `PROCESSAMENTO_POSTAGENS_CORREIOS` e gravar seu ID apenas em Script Properties.
2. A auditoria so pode executar quando `23_RESUMO_PROPOSTA_ID` indicar zero conflitos.
3. A quantidade de linhas auditadas deve corresponder a todas as propostas sem conflito de `21_PROPOSTA_CLIENTES_MASTER`.
4. Para `AGF_RAZAO_SOCIAL`, a rotina deve buscar `NUMERO_CONTRATO` nos fatos historicos e cruzar com `PROCESSAMENTO_POSTAGENS_CORREIOS!02_CONTRATOS`.
5. A rotina nao pode assumir que a Razao Social historica esta limpa quando existe nome atual mais confiavel para o mesmo contrato.
6. Limpeza automatica so pode remover padroes fortemente deterministas, como CNPJ/raiz de CNPJ prefixando o nome ou lista numerica operacional antes do nome.
7. Nomes com problema residual de codificacao, placeholder, ausencia de letras ou multiplas razoes atuais para os contratos observados devem ficar `REVISAR_QUALIDADE`.
8. Se dois `CLIENTE_ID_PROPOSTO` do mesmo Centro convergirem para o mesmo nome final sugerido, ambos devem ficar `REVISAR_QUALIDADE`.
9. `LOCAL_ID_PRINCIPAL` nao deve ser definido por esta auditoria.
10. Nenhuma execucao pode escrever em `01_CLIENTES_MASTER`, `04_CLIENTES_CENTRO_LOCAL` ou nos fatos mensais.
11. `24_AUDITORIA_QUALIDADE_MASTER` e `25_RESUMO_QUALIDADE_MASTER` devem ser rebuildable.

## Regressao geral

- `APP MODELO_AGF` atual permanece inalterado.
- Base Metro atual permanece inalterada.
- CRM atual permanece inalterado.
- `FATOS_POSTAGENS_AAAA_MM` sao somente leitura nesta fase.
- Nenhum `CLIENTE_ID` e persistido automaticamente no Cadastro Mestre.
- Nenhum Centro/Local final e gravado automaticamente nos fatos.
- Fatos sem SRO permanecem no faturamento/historico.
- Duplicidades de SRO/FATO_ID permanecem registradas em `07_HOMOLOGACAO` e `09_RECONCILIACAO_FONTES`.

## Criterio para avancar

So iniciar a escrita efetiva no Cadastro Mestre depois de:

- invariantes historicas continuarem homologadas;
- `20_RESUMO_LOTE_SEGURO` permanecer com 2.140 identidades seguras e zero conflitos residuais para o baseline atual;
- `23_RESUMO_PROPOSTA_ID` continuar com 2.140 propostas e zero conflitos;
- `25_RESUMO_QUALIDADE_MASTER` explicar integralmente as propostas e qualquer `REVISAR_QUALIDADE` ser analisado;
- nenhuma colisao apos o nome final sugerido permanecer sem tratamento;
- a rotina futura de escrita preservar `CLIENTE_ID` ja persistido e nunca recalcular ID por mudanca de nome/alias;
- nenhuma sugestao de score/fuzzy ser promovida automaticamente sem confirmacao.
