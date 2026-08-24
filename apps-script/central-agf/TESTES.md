# TESTES - CENTRAL AGF Motor V1 v0.9.3

## Pre-condicoes

1. Projeto Apps Script vinculado a `CONSULTA_HISTORICA_POSTAGENS`.
2. Arquivos de `apps-script/central-agf` enviados integralmente via clasp.
3. Nenhuma rotina desta homologacao deve alterar producao.

## Baselines homologados

### Historico
- 152.364 fatos preservados ate 2026-08-19.
- Faturamento: R$ 9.526.566,49.
- Duplicidades SRO/FATO_ID permanecem registradas, sem deduplicacao automatica.

### Lote seguro v0.7.1
- 2.170 entradas `PRONTO_PREVIA`.
- 2.140 identidades seguras.
- 29 consolidacoes AGF Balcao + contrato no mesmo canonico.
- 0 conflitos residuais.
- 1.106 `CTR_AGF` e 1.034 `CTR_METRO`.
- R$ 4.887.208,27 preservados.

### Proposta de Cliente ID v0.8.0
- 2.140 propostas.
- 2.140 `PRONTO_PROPOSTA_ID`.
- 0 `JA_EXISTE_MASTER`.
- 0 conflitos.
- 0 preenchimentos automaticos de Local.
- 0 escritas em `01_CLIENTES_MASTER`.

### Auditoria de qualidade v0.9.2
- 2.140 propostas auditadas / R$ 4.887.208,27.
- 2.041 `PRONTO_SEM_AJUSTE`.
- 63 `PRONTO_COM_AUTORIDADE_CONTRATO`.
- 10 `PRONTO_COM_LIMPEZA_DETERMINISTICA`.
- 26 `REVISAR_QUALIDADE` / R$ 545.999,79.
- 3.663 ocorrencias `9999999999`.
- 1.709 resolvidas por Cartao de Postagem univoco.
- 1.436 em cartao ambiguo.
- 73 em cartao sem referencia.
- 445 sem cartao.
- 23 linhas em colisao, agrupadas em 11 grupos.
- 4 linhas com multiplas Razoes Sociais Portal Postal, sendo uma tambem parte de colisao.
- 0 escritas em `01_CLIENTES_MASTER`.

## Ordem de homologacao atual

1. `centralAgfAutoConfigurar()`.
2. `centralAgfSincronizarCatalogoParticoes()`.
3. `centralAgfValidarHistorico()`.
4. `centralAgfGerarDiagnosticoIdentidade()`.
5. `centralAgfGerarPreviaMigracaoClientes()`.
6. `centralAgfGerarAssistenciaRevisaoIdentidade()`.
7. `centralAgfGerarLoteSeguroMigracaoClientes()` e exigir zero conflitos.
8. `centralAgfGerarPropostaClienteId()` e exigir zero conflitos.
9. `centralAgfAuditarQualidadePropostaMaster()`.
10. Conferir `24_AUDITORIA_QUALIDADE_MASTER` e `25_RESUMO_QUALIDADE_MASTER`.
11. Confirmar `ESCRITAS_EM_01_CLIENTES_MASTER=0`.
12. `centralAgfPrepararValidacaoManualMaster()`.
13. Conferir `26_VALIDACAO_MANUAL_MASTER` antes de qualquer persistencia real.

## Regressao de Centro

1. `RAZAO_SOCIAL=BALCÃO` -> `CTR_AGF`, independentemente de `CENTRO_ORIGEM`.
2. `RAZAO_SOCIAL=GAS SHOPPING METRO` -> `CTR_METRO`, independentemente de `CENTRO_ORIGEM`.
3. Para demais casos, `CENTRO_ID_FINAL` confirmado vence fallbacks.
4. Sem Centro final, `CENTRO_ORIGEM` pode orientar provisoriamente.
5. Nenhuma regra grava Centro/Local final nos fatos nesta fase.

## Regressao do Cliente ID - v0.8.0

1. Formato `CLI_` + 20 caracteres hexadecimais.
2. Mesmo `LOTE_ITEM_ID` gera sempre o mesmo ID.
3. ID nao codifica nome, Centro, CPF/CNPJ ou contrato.
4. Colisao/chave duplicada vai para `22_CONFLITOS_PROPOSTA_ID`.
5. `LOCAL_ID_PRINCIPAL`, `CNPJ_CPF` e `NOME_FANTASIA` permanecem vazios sem fonte homologada.
6. Nenhuma execucao escreve em `01_CLIENTES_MASTER`.

## Regressao da auditoria de qualidade - v0.9.2

1. `9999999999` permanece visivel em `CONTRATOS_OBSERVADOS_ORIGEM`.
2. A leitura historica inclui `CARTAO_POSTAGEM` e constroi associacoes usando contratos reais diferentes de `9999999999`.
3. Cartao associado a exatamente um contrato real resolve a ocorrencia 999 em memoria.
4. Cartao com dois ou mais contratos reais nao permite escolha automatica.
5. Cartao sem referencia e linha sem cartao permanecem nao resolvidos.
6. A soma `RESOLVIDAS_POR_CARTAO_UNIVOCO + CARTAO_AMBIGUO + CARTAO_SEM_REFERENCIA + SEM_CARTAO` deve ser exatamente `LINHAS_999_TOTAL`.
7. Contrato original diferente de `9999999999` nunca e substituido pela regra de cartao.
8. Somente contrato resolvido cadastrado em `02_CONTRATOS` como `PORTAL POSTAL` pode fornecer Razao Social oficial.
9. Contratos de outros intermediadores permanecem apenas como evidencia.
10. `BALCÃO` corretamente acentuado nao vira falso mojibake.
11. Colisao de nome final e autoridade multipla continuam `REVISAR_QUALIDADE`.
12. Nenhuma execucao escreve em `01_CLIENTES_MASTER`, `04_CLIENTES_CENTRO_LOCAL` ou fatos mensais.

## Regressao da validacao manual persistente - v0.9.3

1. `centralAgfPrepararValidacaoManualMaster()` so le linhas `REVISAR_QUALIDADE` de `24_AUDITORIA_QUALIDADE_MASTER`.
2. A rotina cria `26_VALIDACAO_MANUAL_MASTER` se a aba ainda nao existir.
3. No baseline atual, 23 linhas de colisao devem formar 11 casos por `CENTRO_ID + NOME_FINAL_SUGERIDO normalizado`.
4. As 4 linhas de autoridade multipla incluem uma linha que ja pertence a colisao; portanto o baseline esperado e aproximadamente 14 casos ativos no total.
5. Caso de colisao que tambem tenha autoridade multipla deve usar `TIPO_PENDENCIA=COLISAO_NOME_FINAL+AUTORIDADE_MULTIPLA`.
6. Autoridade multipla fora de colisao deve virar caso individual `AUTORIDADE_MULTIPLA`.
7. Qualquer pendencia residual nao conhecida deve virar `OUTRA_PENDENCIA`, nunca ser descartada.
8. `CASO_ID` deve ser deterministico e nao conter nome, CPF/CNPJ ou outro dado cadastral em texto aberto.
9. Reexecutar a rotina com a mesma auditoria deve preservar o mesmo `CASO_ID`.
10. Colunas humanas `DECISAO_MANUAL` ate `DECIDIDO_POR` devem ser preservadas por `CASO_ID` em toda reexecucao.
11. Caso que deixe de existir na auditoria atual deve permanecer na aba com `ATIVO_NA_AUDITORIA=NAO`; nao pode ser apagado.
12. A rotina deve abortar se encontrar a aba 26 com cabecalho incompatível, em vez de sobrescrever decisoes humanas.
13. `DECISAO_MANUAL` deve oferecer dropdown com `MESMO_CLIENTE`, `CLIENTES_DIFERENTES`, `MANTER_COMO_ESTA`, `CORRIGIR_NOME` e `PRECISA_VERIFICAR`.
14. `STATUS_VALIDACAO` deve oferecer `PENDENTE`, `VALIDADO` e `PRECISA_VERIFICAR`.
15. Evidencias tecnicas devem permanecer separadas das colunas humanas.
16. `CLIENTE_ID_MANTER` so e exigido quando a decisao for `MESMO_CLIENTE` e houver mais de um ID envolvido.
17. Nenhuma decisao da aba 26 e aplicada automaticamente na v0.9.3.
18. Nenhuma execucao pode escrever em `01_CLIENTES_MASTER`, `04_CLIENTES_CENTRO_LOCAL` ou fatos mensais.

## Criterio para avancar

So desenhar a persistencia efetiva depois de:

- invariantes historicas continuarem homologadas;
- lote seguro permanecer com 2.140 identidades e zero conflitos para o baseline atual;
- proposta de Cliente ID permanecer integralmente reconciliada;
- auditoria v0.9.2 permanecer reconciliada;
- `26_VALIDACAO_MANUAL_MASTER` ser gerada sem perder nenhuma das 26 linhas em revisao;
- todos os casos ativos receberem decisao humana suficiente;
- `STATUS_VALIDACAO=VALIDADO` em todos os casos aptos a persistencia;
- casos `PRECISA_VERIFICAR` permanecerem bloqueados fora da escrita;
- a futura escrita preservar `CLIENTE_ID` persistido como imutavel.
