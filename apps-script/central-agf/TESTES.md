# TESTES - CENTRAL AGF Motor V1 v0.8.0

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
8. Conferir que `14_PREVIA_MIGRACAO_CLIENTES` tem exatamente um registro para cada candidato do diagnostico.
9. Conferir que `15_FILA_REVISAO_IDENTIDADE` contem apenas `STATUS_PREVIA=REVISAR`.
10. Executar `centralAgfGerarAssistenciaRevisaoIdentidade()`.
11. Conferir `16_RESUMO_IDENTIDADE` e `17_FILA_REVISAO_ASSISTIDA`.
12. Executar `centralAgfGerarLoteSeguroMigracaoClientes()`.
13. Conferir `18_LOTE_SEGURO_CLIENTES`, `19_CONFLITOS_LOTE_SEGURO` e `20_RESUMO_LOTE_SEGURO`.
14. Exigir `REVISAR_ANTES_MIGRACAO=0` antes de gerar proposta de Cliente ID.
15. Executar `centralAgfGerarPropostaClienteId()`.
16. Conferir `21_PROPOSTA_CLIENTES_MASTER`, `22_CONFLITOS_PROPOSTA_ID` e `23_RESUMO_PROPOSTA_ID`.
17. Confirmar que nenhuma dessas etapas escreveu em `01_CLIENTES_MASTER`.

## Baseline atual da previa v0.5.0

A execucao homologada sobre o historico ate 2026-08-19 produziu:

- 8.724 candidatos totais;
- 2.170 `PRONTO_PREVIA`;
- 6.548 `REVISAR`;
- 6 `NAO_CRIAR_CLIENTE`.

Estrategias observadas:

- 332 `RAZAO_SOCIAL_AGF`;
- 2.083 `ALIAS_EXATO_NORM_LEGADO`;
- 140 `ALIAS_MANUAL_LEGADO`;
- 6.163 `SEM_ALIAS_CONFIAVEL`;
- 6 `PLACEHOLDER_OPERACIONAL`.

Na fila de revisao:

- 5.232 `AGF_BALCAO_REMETENTE`;
- 1.299 `METRO_REMETENTE`;
- 17 `AGF_RAZAO_SOCIAL`.

Motivos de revisao podem se sobrepor. Baseline observado:

- 6.163 `SEM_ALIAS_MANUAL_OU_EXATO`;
- 321 `MESMO_NOME_EM_CENTROS_DIFERENTES`;
- 550 `NOME_COLADO_SEM_ESPACOS`;
- 85 `SUFIXO_NUMERICO`;
- 191 `POSSIVEL_CODIFICACAO_CORROMPIDA`;
- 0 conflitos de mais de um canonico legado no mesmo nivel de prioridade.

## Baseline da assistencia v0.6.0

Sobre os 6.548 casos em revisao:

- 385 `JA_TEM_ALIAS_CONFIAVEL_MAS_REQUER_REVISAO`;
- 34 `SUGESTAO_DETERMINISTICA`;
- 72 `SUGESTAO_LEGADO_FORTE`;
- 24 `SUGESTAO_LEGADO_ALTA`;
- 30 `SUGESTAO_LEGADO_MEDIA`;
- 6.003 `SEM_SUGESTAO`.

Nenhuma dessas classificacoes promove automaticamente um caso de revisao para Cliente Master.

## Baseline homologado do lote seguro v0.7.1

A execucao final produziu:

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

## Regressao da revisao assistida - v0.6.0

1. Todos os 6.548 casos base de `15_FILA_REVISAO_IDENTIDADE` devem aparecer em `17_FILA_REVISAO_ASSISTIDA`.
2. A fila deve permanecer ordenada por `FATURAMENTO_TOTAL` decrescente.
3. Um alias ja confiavel retido por outro motivo pode aparecer como `PREVIA_ALIAS_CONFIAVEL`, mas continua `PENDENTE_REVISAO`.
4. Correspondencia por nome compacto so pode sugerir candidato quando houver exatamente um nome pronto para o mesmo Centro.
5. Correspondencia sem sufixo numerico so pode sugerir candidato quando houver exatamente um nome pronto para o mesmo Centro.
6. Sugestao por score legado nunca pode virar `PRONTO_PREVIA` automaticamente.
7. O fallback de alias sem Razao Social so pode ser usado quando todos os registros conhecidos para o mesmo raw apontarem para um unico nome canonico.
8. `DECISAO_HUMANA`, `NOME_CONFIRMADO` e `OBSERVACAO_HUMANA` devem nascer vazios.
9. `STATUS` deve nascer `PENDENTE_REVISAO` em toda a fila.
10. Nenhuma execucao da assistencia pode gravar em `01_CLIENTES_MASTER`, `04_CLIENTES_CENTRO_LOCAL` ou nos fatos mensais.

## Regressao do lote seguro - v0.7.1

1. A entrada deve conter somente linhas `STATUS_PREVIA=PRONTO_PREVIA` da aba 14.
2. A soma de `FATURAMENTO_TOTAL` do lote seguro + conflitos deve bater com o faturamento das linhas de entrada `PRONTO_PREVIA`, com diferenca maxima de centavos por arredondamento de exibicao.
3. A consolidacao deve agrupar por `CENTRO_SUGERIDO + NOME_CANONICO normalizado`.
4. O mesmo nome canonico presente em mais de um Centro deve ir integralmente para `19_CONFLITOS_LOTE_SEGURO`.
5. Em `CTR_AGF`, a combinacao exata `AGF_BALCAO_REMETENTE + AGF_RAZAO_SOCIAL` para o mesmo canonico nao e conflito de identidade: deve consolidar em `AGF_RAZAO_SOCIAL`, mantendo Balcao como alias/evidencia.
6. Qualquer outra combinacao de mais de um `TIPO_IDENTIDADE` para a mesma chave consolidada deve ir para conflitos.
7. `AGF_BALCAO_REMETENTE` e `AGF_RAZAO_SOCIAL` so podem ficar no lote seguro com `CTR_AGF`.
8. `METRO_REMETENTE` so pode ficar no lote seguro com `CTR_METRO`.
9. Somente estrategias `ALIAS_MANUAL_LEGADO`, `ALIAS_EXATO_NORM_LEGADO` e `RAZAO_SOCIAL_AGF` podem entrar no lote seguro.
10. Placeholder, canonico vazio ou Centro desconhecido deve ir para conflitos.
11. `LOTE_ITEM_ID` deve ser deterministico para a mesma combinacao Centro + canonico.
12. `18_LOTE_SEGURO_CLIENTES` deve permanecer uma visao rebuildable, sem campos de decisao humana persistente e sem `CLIENTE_ID` proposto.
13. Executar a funcao novamente com a mesma entrada deve reconstruir as abas derivadas sem duplicar linhas.
14. Nenhuma execucao deve gravar em `01_CLIENTES_MASTER`, `02_ALIASES_NOME_REMETENTE`, `04_CLIENTES_CENTRO_LOCAL` ou nos fatos mensais.

## Regressao da proposta de Cliente ID - v0.8.0

1. A funcao deve recusar execucao se `20_RESUMO_LOTE_SEGURO` tiver `REVISAR_ANTES_MIGRACAO > 0`.
2. A quantidade lida de `18_LOTE_SEGURO_CLIENTES` deve bater exatamente com `PRONTO_LOTE_SEGURO` do resumo.
3. O `CLIENTE_ID_PROPOSTO` deve ter formato `CLI_` + 20 caracteres hexadecimais.
4. O mesmo `LOTE_ITEM_ID` deve gerar exatamente o mesmo `CLIENTE_ID_PROPOSTO` em execucoes repetidas.
5. O ID proposto nao deve conter nome, Centro, CPF/CNPJ ou outro significado comercial visivel.
6. Duplicidade de `LOTE_ITEM_ID`, colisao de `CLIENTE_ID` ou duplicidade Centro + nome na proposta deve ir para `22_CONFLITOS_PROPOSTA_ID`.
7. Se `ORIGEM_IDENTIDADE` ja existir em `01_CLIENTES_MASTER` com o mesmo ID, a proposta deve marcar `JA_EXISTE_MASTER` em vez de criar novo candidato.
8. Se um ID proposto ja estiver usado por outra origem no Master, deve virar conflito.
9. `RAZAO_SOCIAL_OFICIAL` so pode ser preenchida automaticamente para `AGF_RAZAO_SOCIAL`.
10. `LOCAL_ID_PRINCIPAL` deve permanecer vazio em todas as linhas propostas.
11. `CNPJ_CPF` e `NOME_FANTASIA` devem permanecer vazios quando nao houver fonte homologada.
12. `TIPO_CLIENTE` deve permanecer generico como `CLIENTE` nesta proposta.
13. `STATUS_CADASTRO` deve nascer `PENDENTE_HOMOLOGACAO`.
14. `23_RESUMO_PROPOSTA_ID` deve registrar zero escritas em `01_CLIENTES_MASTER`.
15. Executar novamente a funcao com a mesma entrada deve reconstruir as abas 21-23 sem duplicar linhas nem mudar os IDs propostos.

## Regressao geral

- `APP MODELO_AGF` atual permanece inalterado.
- Base Metro atual permanece inalterada.
- CRM atual permanece inalterado.
- `FATOS_POSTAGENS_AAAA_MM` sao somente leitura nesta fase.
- Nenhum `CLIENTE_ID` e persistido automaticamente no Cadastro Mestre.
- Nenhum Centro/Local final e gravado automaticamente nos fatos.
- Fatos sem SRO permanecem no faturamento/historico, mas nao entram na identificacao nem na contagem de clientes.
- Duplicidades de SRO/FATO_ID permanecem registradas em `07_HOMOLOGACAO` e `09_RECONCILIACAO_FONTES`.

## Criterio para avancar

So iniciar a escrita efetiva no Cadastro Mestre depois de:

- invariantes historicas continuarem homologadas;
- regras `BALCÃO -> AGF` e `GAS SHOPPING METRO -> METRO` continuarem validas;
- previa e fila assistida serem tratadas como visoes derivadas;
- `20_RESUMO_LOTE_SEGURO` permanecer com 2.140 identidades seguras e zero conflitos residuais para o baseline atual;
- `23_RESUMO_PROPOSTA_ID` explicar integralmente as 2.140 identidades entre novas, ja existentes e conflitos;
- qualquer conflito de `22_CONFLITOS_PROPOSTA_ID` ser resolvido antes da escrita;
- a rotina de escrita futura preservar `CLIENTE_ID` ja persistido e nunca recalcular ID por mudanca de nome/alias;
- nenhuma sugestao de score/fuzzy ser promovida automaticamente sem confirmacao.