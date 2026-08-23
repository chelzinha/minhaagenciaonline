# TESTES - CENTRAL AGF Motor V1 v0.6.0

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
12. Confirmar que a fila assistida nao escreveu nada em `01_CLIENTES_MASTER`.

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

## Regressao geral

- `APP MODELO_AGF` atual permanece inalterado.
- Base Metro atual permanece inalterada.
- CRM atual permanece inalterado.
- `FATOS_POSTAGENS_AAAA_MM` sao somente leitura nesta fase.
- Nenhum `CLIENTE_ID` novo e criado automaticamente.
- Nenhum Centro/Local final e gravado automaticamente.
- Fatos sem SRO permanecem no faturamento/historico, mas nao entram na identificacao nem na contagem de clientes.
- Duplicidades de SRO/FATO_ID permanecem registradas em `07_HOMOLOGACAO` e `09_RECONCILIACAO_FONTES`.

## Criterio para avancar

So iniciar a escrita efetiva no Cadastro Mestre depois de:

- invariantes historicas continuarem homologadas;
- regras `BALCÃO -> AGF` e `GAS SHOPPING METRO -> METRO` continuarem validas;
- previa e fila assistida serem revisadas como visoes derivadas;
- candidatos prontos serem consolidados por identidade unica antes de gerar `CLIENTE_ID`;
- nenhuma sugestao de score/fuzzy ser promovida automaticamente sem confirmacao.