# CENTRAL AGF - Motor V1

Projeto Apps Script destinado a `CONSULTA_HISTORICA_POSTAGENS` e às visões derivadas do `CADASTRO_MESTRE_CLIENTES`.

## Escopo atual - v0.9.3

- Descobrir por nome, uma unica vez, as planilhas tecnicas e salvar seus IDs em Script Properties.
- Sincronizar o catalogo de particoes mensais a partir de `CONTROLE_CARGAS_POSTAGENS!03_PARTICOES`.
- Auditar as particoes historicas antes de qualquer substituicao da producao.
- Materializar, sob demanda, todos os fatos de um periodo em `03_POSTAGENS`, preservando todas as colunas.
- Gerar diagnostico, previa, revisao assistida e lote seguro de identidade sem alterar fatos.
- Gerar proposta idempotente de `CLIENTE_ID` sem escrever em `01_CLIENTES_MASTER`.
- Auditar qualidade cadastral antes de qualquer persistencia.
- Recuperar contrato importado como `9999999999` quando o `CARTAO_POSTAGEM` possuir associacao historica univoca com um unico contrato real.
- Consolidar as excecoes finais em uma fila persistente de validacao humana, sem perder decisoes em reexecucoes.

## Regras de Centro confirmadas

1. `RAZAO_SOCIAL = BALCÃO` -> `CTR_AGF`, identidade por `NOME_REMETENTE`.
2. `RAZAO_SOCIAL = GAS SHOPPING METRO` -> `CTR_METRO`, identidade por `NOME_REMETENTE`.
3. Essas duas regras comerciais vencem `CENTRO_ORIGEM`.
4. Para as demais identidades, `CENTRO_ID_FINAL` confirmado vence fallbacks.
5. Sem Centro final, `CENTRO_ORIGEM` reconhecido pode orientar provisoriamente.

## Homologacao historica

`centralAgfValidarHistorico()` valida linhas, faturamento, periodo, SRO/FATO_ID repetidos e fatos especiais. Para liberar as visoes de identidade, todas as particoes precisam ter `STATUS_LINHAS=OK`, `STATUS_FATURAMENTO=OK` e `STATUS_PERIODO=OK`.

Duplicidades de SRO/FATO_ID permanecem registradas em `07_HOMOLOGACAO` e `09_RECONCILIACAO_FONTES`; nenhuma deduplicacao automatica e autorizada.

## Camadas derivadas de identidade

- `13_DIAGNOSTICO_IDENTIDADE`: inventario de candidatos.
- `14_PREVIA_MIGRACAO_CLIENTES`: separa pronto, revisar e nao criar.
- `15_FILA_REVISAO_IDENTIDADE`: pendencias.
- `16_RESUMO_IDENTIDADE` e `17_FILA_REVISAO_ASSISTIDA`: assistencia local, sem decisao automatica por fuzzy.
- `18_LOTE_SEGURO_CLIENTES`, `19_CONFLITOS_LOTE_SEGURO` e `20_RESUMO_LOTE_SEGURO`: consolidacao segura.
- `21_PROPOSTA_CLIENTES_MASTER`, `22_CONFLITOS_PROPOSTA_ID` e `23_RESUMO_PROPOSTA_ID`: proposta de `CLIENTE_ID`, ainda sem escrita.
- `24_AUDITORIA_QUALIDADE_MASTER` e `25_RESUMO_QUALIDADE_MASTER`: qualidade cadastral antes da persistencia, incluindo diagnostico da resolucao do contrato `9999999999` por Cartao de Postagem.
- `26_VALIDACAO_MANUAL_MASTER`: fila persistente com apenas os casos finais que exigem decisao humana.

## Lote seguro - v0.7.1

`centralAgfGerarLoteSeguroMigracaoClientes()` consolida apenas `PRONTO_PREVIA`. No `CTR_AGF`, o mesmo canonico exato visto como `AGF_BALCAO_REMETENTE` e `AGF_RAZAO_SOCIAL` representa canais/evidencias da mesma identidade; `AGF_RAZAO_SOCIAL` prevalece como identidade cadastral.

Baseline homologado: 2.170 entradas -> 2.140 identidades seguras, zero conflitos residuais, 1.106 AGF e 1.034 METRO, com R$ 4.887.208,27 preservados.

## Proposta de Cliente ID - v0.8.0

`centralAgfGerarPropostaClienteId()` gera `CLIENTE_ID_PROPOSTO` no formato `CLI_` + 20 caracteres hexadecimais por SHA-256 sobre namespace tecnico fixo + `LOTE_ITEM_ID`.

O ID nao codifica nome, Centro, contrato ou CPF/CNPJ. Depois de persistido, deve ser imutavel. `LOCAL_ID_PRINCIPAL`, `CNPJ_CPF` e `NOME_FANTASIA` permanecem vazios sem fonte homologada.

Baseline homologado: 2.140 propostas, zero conflitos e zero escritas em `01_CLIENTES_MASTER`.

## Auditoria de qualidade do Master - v0.9.2

`centralAgfAuditarQualidadePropostaMaster()` gera `24_AUDITORIA_QUALIDADE_MASTER` e `25_RESUMO_QUALIDADE_MASTER`.

A v0.9.1 restringiu corretamente a autoridade cadastral a contratos `INTERMEDIADOR=PORTAL POSTAL`, mas tratou `9999999999` como se fosse apenas uma sentinela descartavel. Essa interpretacao foi corrigida na v0.9.2.

### Regra de recuperacao do contrato 9999999999

`9999999999` e preservado como valor recebido da fonte. Antes de usar contratos como evidencia cadastral, o motor constroi no historico o chaveamento `CARTAO_POSTAGEM -> NUMERO_CONTRATO real`.

- se o mesmo Cartao de Postagem estiver associado a exatamente um contrato real diferente de `9999999999`, as ocorrencias `9999999999` daquele cartao sao resolvidas para esse contrato;
- se o cartao estiver associado a mais de um contrato real, nenhuma escolha automatica e feita;
- se o cartao nao possuir contrato real de referencia, nenhuma escolha automatica e feita;
- se a linha `9999999999` nao possuir Cartao de Postagem, nenhuma escolha automatica e feita;
- contratos originais diferentes de `9999999999` nunca sao sobrescritos por essa regra;
- a resolucao acontece em memoria durante a auditoria; os fatos mensais permanecem inalterados.

A aba `24_AUDITORIA_QUALIDADE_MASTER` preserva separadamente contratos de origem, Cartoes observados, contratos resolvidos e o status da resolucao do `9999999999`. A aba `25_RESUMO_QUALIDADE_MASTER` reconcilia todas as linhas historicas `9999999999` entre resolvidas por cartao, cartao ambiguo, cartao sem referencia e sem cartao.

Depois da resolucao contratual, somente contratos resolvidos presentes em `PROCESSAMENTO_POSTAGENS_CORREIOS!02_CONTRATOS` com `INTERMEDIADOR=PORTAL POSTAL` podem atuar como autoridade de Razao Social. Contratos de outros intermediadores continuam apenas como evidencia historica.

`BALCÃO` corretamente acentuado nao e tratado como mojibake; problemas reais de codificacao continuam sinalizados. Limpezas automaticas continuam limitadas a padroes deterministas de prefixo CNPJ/raiz/lista de codigos. Se duas propostas do mesmo Centro convergirem para o mesmo nome final, ambas permanecem `REVISAR_QUALIDADE`.

Baseline homologado em runtime da v0.9.2:

- 2.140 propostas auditadas / R$ 4.887.208,27;
- 2.041 `PRONTO_SEM_AJUSTE`;
- 63 `PRONTO_COM_AUTORIDADE_CONTRATO`;
- 10 `PRONTO_COM_LIMPEZA_DETERMINISTICA`;
- 26 `REVISAR_QUALIDADE`;
- 3.663 ocorrencias `9999999999`: 1.709 resolvidas por cartao univoco, 1.436 em cartao ambiguo, 73 sem referencia e 445 sem cartao;
- 23 linhas em colisao, agrupadas em 11 grupos;
- 4 linhas com multiplas Razoes Sociais de Portal Postal, sendo uma delas tambem parte de um grupo de colisao;
- zero escrita em `01_CLIENTES_MASTER`.

## Validacao manual persistente - v0.9.3

`centralAgfPrepararValidacaoManualMaster()` le somente os casos `REVISAR_QUALIDADE` da aba 24 e cria/sincroniza `26_VALIDACAO_MANUAL_MASTER`.

A fila e diferente das visoes derivadas anteriores: as colunas de decisao humana sao persistentes. Reexecutar a rotina atualiza evidencias tecnicas, mas preserva as decisoes ja registradas pelo `CASO_ID`. Casos que deixarem de aparecer na auditoria ficam preservados com `ATIVO_NA_AUDITORIA=NAO` para manter rastreabilidade.

Agrupamento atual:

- linhas com `COLISAO_APOS_NOME_FINAL_SUGERIDO` sao agrupadas por `CENTRO_ID + NOME_FINAL_SUGERIDO normalizado`;
- se o mesmo grupo tambem tiver `MULTIPLAS_RAZOES_PORTAL_POSTAL_PARA_CONTRATOS_RESOLVIDOS`, o caso recebe os dois tipos de pendencia;
- linhas de autoridade multipla fora de colisao viram casos individuais;
- qualquer outra pendencia residual vira caso individual, sem decisao automatica.

Campos humanos principais:

- `DECISAO_MANUAL`;
- `CLIENTE_ID_MANTER`;
- `NOME_EXIBICAO_CONFIRMADO`;
- `RAZAO_SOCIAL_CONFIRMADA`;
- `OBSERVACAO`;
- `STATUS_VALIDACAO`;
- `DECIDIDO_EM`;
- `DECIDIDO_POR`.

Opcoes de `DECISAO_MANUAL`:

- `MESMO_CLIENTE`;
- `CLIENTES_DIFERENTES`;
- `MANTER_COMO_ESTA`;
- `CORRIGIR_NOME`;
- `PRECISA_VERIFICAR`.

A v0.9.3 nao interpreta nem aplica automaticamente essas decisoes. Ela apenas cria a camada persistente e segura para homologacao humana antes da futura escrita no Cadastro Mestre.

## Ordem de homologacao

1. `centralAgfAutoConfigurar()`.
2. `centralAgfSincronizarCatalogoParticoes()`.
3. `centralAgfValidarHistorico()`.
4. `centralAgfGerarDiagnosticoIdentidade()`.
5. `centralAgfGerarPreviaMigracaoClientes()`.
6. `centralAgfGerarAssistenciaRevisaoIdentidade()`.
7. `centralAgfGerarLoteSeguroMigracaoClientes()` e exigir zero conflitos.
8. `centralAgfGerarPropostaClienteId()` e exigir zero conflitos.
9. `centralAgfAuditarQualidadePropostaMaster()`.
10. Revisar `25_RESUMO_QUALIDADE_MASTER` e exigir reconciliacao do bloco `CONTRATO_999`.
11. `centralAgfPrepararValidacaoManualMaster()`.
12. Preencher os casos ativos de `26_VALIDACAO_MANUAL_MASTER` e marcar `STATUS_VALIDACAO=VALIDADO` quando a decisao estiver completa.
13. Somente depois desenhar/aplicar a persistencia efetiva no Master.

## Nao faz nesta versao

- Nao altera `APP MODELO_AGF` atual.
- Nao processa Atende + Consolidador.
- Nao escreve em `01_CLIENTES_MASTER`.
- Nao regrava contrato resolvido nos fatos historicos.
- Nao aplica automaticamente decisao humana da aba 26.
- Nao ativa cliente no Cadastro Mestre.
- Nao define Local principal automaticamente.
- Nao altera Centro/Local nos fatos.
- Nao publica nada em producao.
- Nao usa IA externa com nomes de clientes.

## Seguranca

IDs de planilhas nao ficam versionados. O setup resolve arquivos por nome e mantem IDs somente em Script Properties. As visoes derivadas e a fila manual contem dados cadastrais, contratuais e financeiros e nao devem ser publicadas no frontend nem copiadas para documentacao com exemplos reais.
