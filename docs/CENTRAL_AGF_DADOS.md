# CENTRAL AGF - arquitetura de dados

## Status

Estrutura inicial criada em homologacao em 2026-08-22. Nenhuma planilha atual de producao foi desativada ou alterada por esta etapa.

Motor de homologacao atual: `v0.7.1`, na branch `feat/central-agf-motor-v1`.

## Objetivo

Separar o processamento de postagens, o cadastro mestre de clientes, o historico de fatos e as consultas/auditorias para eliminar o crescimento de uma unica planilha monolitica e reduzir conferencia manual.

## Camadas

1. `01_FONTES_CORREIOS`: arquivos diarios Atende e Consolidador, preservados como fontes brutas.
2. `02_PROCESSAMENTO_POSTAGENS`: processamento, catalogos vivos de servicos/contratos e controle de cargas.
3. `03_FATOS_POSTAGENS`: historico particionado por mes, com AGF e METRO na mesma estrutura logica e `CENTRO` como dimensao.
4. `04_CADASTRO_MESTRE_CLIENTES`: identidade, aliases, Centro/Local, grupos analiticos, regras e filas de excecao.
5. `05_CONSULTAS_E_AUDITORIA`: materializacao sob demanda de todas as colunas e periodos, mais resumos leves para front/gestao.
6. `06_DOCUMENTACAO`: mapas e inventario tecnico.
7. `99_LEGADO_E_BACKUPS`: reservado para estruturas aposentadas depois de homologacao.

## Invariantes atuais

- O Consolidador continua sendo a referencia da quantidade de linhas e do faturamento do processamento diario.
- O Atende enriquece registros rastreaveis pelo codigo SRO.
- `SEM_REGISTRO` e `PRODUTO_ECT` permanecem fatos validos; podem ter quantidade, valor e razao social, mesmo sem SRO real.
- `SEM_REGISTRO`, `PRODUTO_ECT` e outros fatos sem SRO real nao entram na identificacao nem na contagem de clientes; continuam integralmente no faturamento e historico.
- O historico mensal nao deve recalcular nem inventar identidade de cliente.
- Campos finais de `CLIENTE_ID`, `CENTRO_ID_FINAL` e `LOCAL_ID_FINAL` permanecem pendentes ate a homologacao do Cadastro Mestre.
- `RAZAO_SOCIAL=BALCÃO` identifica o contexto AGF.
- `RAZAO_SOCIAL=GAS SHOPPING METRO` identifica o contexto METRO.
- Cadastro confirmado manualmente deve vencer fallbacks automaticos nos demais casos.
- Para cliente novo, regras por Razao Social e depois CX/atendente podem sugerir Centro/Local; fallbacks devem ficar marcados como provisorios.
- O historico mensal e fonte de fatos; a planilha de consulta e apenas uma materializacao temporaria para auditoria.

## Consulta de todas as colunas e periodos

O Apps Script `apps-script/central-agf` implementa o primeiro motor de consulta. Ele le o catalogo de particoes, seleciona somente os meses que intersectam o periodo solicitado e grava em lote as linhas filtradas em `CONSULTA_HISTORICA_POSTAGENS!03_POSTAGENS`.

Isso permite abrir, filtrar, ordenar e criar tabela dinamica sobre todo o historico solicitado sem manter permanentemente todas as linhas em uma unica planilha fisica.

## Homologacao do historico

Antes de usar as particoes como fonte para Cadastro Mestre ou front, executar `centralAgfValidarHistorico()`.

A rotina e somente leitura sobre `FATOS_POSTAGENS_AAAA_MM` e grava o resultado em `CONSULTA_HISTORICA_POSTAGENS!07_HOMOLOGACAO`.

Ela valida:

- linhas reais versus catalogo;
- faturamento real versus catalogo;
- data minima/maxima versus periodo cadastrado;
- SRO duplicado na mesma particao ou entre meses;
- `FATO_ID` duplicado na mesma particao ou entre meses;
- contagem separada de `SEM_REGISTRO`, `PRODUTO_ECT` e outros objetos sem padrao SRO.

Para liberar o diagnostico somente leitura, todas as particoes precisam ter `STATUS_LINHAS=OK`, `STATUS_FATURAMENTO=OK` e `STATUS_PERIODO=OK`.

Duplicidades de SRO/FATO_ID podem manter a particao em estado geral de revisao. Elas continuam registradas em `07_HOMOLOGACAO` e `09_RECONCILIACAO_FONTES`, mas nao bloqueiam o diagnostico de identidade porque nenhuma linha e apagada, mesclada ou deduplicada automaticamente.

## Diagnostico de identidade

Depois da homologacao estrutural, financeira e de periodo, `centralAgfGerarDiagnosticoIdentidade()` gera a aba derivada `CADASTRO_MESTRE_CLIENTES!13_DIAGNOSTICO_IDENTIDADE`.

Objetivo: transformar 150k+ fatos em um inventario menor de candidatos de identidade, variantes e excecoes sem criar `CLIENTE_ID` automaticamente.

**Elegibilidade:** somente fatos com SRO real entram como evidencia/candidato de cliente. Linhas `SEM_REGISTRO`, `PRODUTO_ECT` e outros registros sem SRO permanecem na base financeira, mas sao ignoradas nessa etapa de identidade.

### Regras de Centro e identidade

1. `RAZAO_SOCIAL = BALCÃO` pertence ao Centro AGF e a identidade preliminar usa `NOME_REMETENTE`.
2. `RAZAO_SOCIAL = GAS SHOPPING METRO` pertence ao Centro METRO e a identidade preliminar usa `NOME_REMETENTE`.
3. Essas duas regras comerciais explicitas vencem `CENTRO_ORIGEM`.
4. Para as demais razoes sociais, `CENTRO_ID_FINAL` reconhecido e a evidencia mais forte e vence fallbacks automaticos.
5. Sem Centro final e sem uma das duas regras comerciais explicitas, `CENTRO_ORIGEM` reconhecido pode orientar AGF/Metro de forma provisoria.
6. Casos sem regra forte ficam `INDEFINIDO` para revisao.

Regras de identidade por Centro:

- Metro: identidade preliminar baseada em `NOME_REMETENTE`.
- AGF Balcao: identidade preliminar baseada em `NOME_REMETENTE`.
- AGF fora do Balcao: identidade preliminar baseada em `RAZAO_SOCIAL`.
- Fato com `RAZAO_SOCIAL=BALCÃO` continua AGF mesmo que `CENTRO_ORIGEM` esteja como Metro.
- Fato com `RAZAO_SOCIAL=GAS SHOPPING METRO` continua Metro mesmo que `CENTRO_ORIGEM` esteja divergente.

## Lote seguro de Cadastro Mestre

A v0.7.x consolida somente candidatos `PRONTO_PREVIA` por `CENTRO_SUGERIDO + NOME_CANONICO normalizado` nas abas derivadas `18_LOTE_SEGURO_CLIENTES`, `19_CONFLITOS_LOTE_SEGURO` e `20_RESUMO_LOTE_SEGURO`.

A primeira execucao da v0.7.0 mostrou 2.170 entradas prontas, consolidadas em 2.140 identidades. Dessas, 29 foram inicialmente separadas porque a mesma identidade AGF aparecia pelos dois tipos `AGF_BALCAO_REMETENTE` e `AGF_RAZAO_SOCIAL`.

A v0.7.1 corrige essa interpretacao: no mesmo `CTR_AGF` e com o mesmo canonico, Balcao e contrato sao canais/evidencias da mesma entidade, nao identidades diferentes. Quando ambos existem, `AGF_RAZAO_SOCIAL` prevalece como identidade cadastral oficial e o nome usado no Balcao permanece como alias/evidencia. A regra nao atravessa Centros e nao afrouxa fuzzy/score.

Nenhuma rotina da v0.7.x cria `CLIENTE_ID`, grava Centro/Local final ou altera os fatos mensais.

## Centro e Local

A autoridade futura deve ser o Cadastro Mestre, respeitando as duas regras comerciais de origem acima.

Ordem conceitual:

1. regras comerciais explicitas `BALCÃO -> AGF` e `GAS SHOPPING METRO -> METRO`;
2. vinculo manual/confirmado no Master para as demais identidades;
3. regra forte por identidade/cadastro;
4. fallback de cliente novo por Razao Social;
5. fallback por CX/atendente apenas quando ainda nao existir vinculo;
6. resultado do fallback fica provisorio ate validacao.

## Performance

- Particoes mensais evitam crescimento infinito de uma unica planilha.
- A consulta processa uma particao por vez e escreve em blocos.
- O frontend futuro deve usar resumos/pre-processamento para periodo total e consultar fatos detalhados apenas sob demanda.
- A materializacao completa existe para auditoria humana e nao deve ser o caminho padrao do front.
- Todas as planilhas novas foram padronizadas para timezone `America/Sao_Paulo` para evitar deslocamento de datas.

## Atencao sensivel

As estruturas envolvem nomes de remetentes, razao social, contratos, historico de postagens e faturamento. IDs reais de arquivos/planilhas e dados pessoais nao devem ser documentados no repositorio. O Motor V1 resolve IDs por nome e os mantem em Script Properties.

O diagnostico e o lote seguro nao devem expor dados no frontend e nao devem ser usados para IA externa antes da definicao de minimizacao de dados.

## Fora do escopo desta etapa

- Senhas e autenticacao de clientes.
- Caixa diario usando `MODALIDADE_PAGAMENTO` e `FORMA_PAGAMENTO`.
- Integracoes com arquivos de apoio comercial.
- Curva ABC como visao do CRM.
- Automacao/agente para download diario de Atende e Consolidador.
- Substituicao do merge atual Atende + Consolidador antes de sua regra ser homologada no novo motor.
