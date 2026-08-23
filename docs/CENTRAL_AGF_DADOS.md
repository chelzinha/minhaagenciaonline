# CENTRAL AGF - arquitetura de dados

## Status

Estrutura inicial criada em homologacao em 2026-08-22. Nenhuma planilha atual de producao foi desativada ou alterada por esta etapa.

Motor de homologacao atual: `v0.4.1`, na branch `feat/central-agf-motor-v1`.

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
- Cadastro confirmado manualmente deve vencer fallbacks automaticos.
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

### Prioridade de evidencias - v0.4.1

A classificacao deve respeitar esta ordem:

1. `CENTRO_ID_FINAL` reconhecido e a evidencia mais forte e vence fallbacks automaticos.
2. Sem Centro final, `RAZAO_SOCIAL = GAS SHOPPING METRO` permanece regra forte para Metro e usa `NOME_REMETENTE` como identidade preliminar.
3. Sem Centro final nem regra forte Metro, `CENTRO_ORIGEM` reconhecido orienta AGF/Metro de forma provisoria.
4. `RAZAO_SOCIAL = BALCÃO` so sugere AGF por fallback quando nenhum Centro reconhecido estiver disponivel.
5. Casos sem regra forte ficam `INDEFINIDO` para revisao.

Regras de identidade por Centro:

- Metro: identidade preliminar baseada em `NOME_REMETENTE`.
- AGF Balcao: identidade preliminar baseada em `NOME_REMETENTE`.
- AGF fora do Balcao: identidade preliminar baseada em `RAZAO_SOCIAL`.
- Fato com `CENTRO_ORIGEM=METRO` e `RAZAO_SOCIAL=BALCÃO` deve permanecer no diagnostico Metro; a palavra `BALCÃO` isoladamente nao pode deslocar o fato para AGF.

O Centro de origem continua sendo evidencia provisoria; nao substitui Cadastro Mestre confirmado nem `CENTRO_ID_FINAL` existente.

A aba de diagnostico guarda ocorrencias, quantidade, faturamento, primeira/ultima postagem, variantes de Razao Social/Remetente e Centros/Locais/atendentes observados. Ela e rebuildable e nao e fonte de verdade.

## Centro e Local

A autoridade futura deve ser o Cadastro Mestre.

Ordem conceitual:

1. vinculo manual/confirmado no Master;
2. regra forte por identidade/cadastro;
3. fallback de cliente novo por Razao Social;
4. fallback por CX/atendente apenas quando ainda nao existir vinculo;
5. resultado do fallback fica provisorio ate validacao.

## Performance

- Particoes mensais evitam crescimento infinito de uma unica planilha.
- A consulta processa uma particao por vez e escreve em blocos.
- O frontend futuro deve usar resumos/pre-processamento para periodo total e consultar fatos detalhados apenas sob demanda.
- A materializacao completa existe para auditoria humana e nao deve ser o caminho padrao do front.
- Todas as planilhas novas foram padronizadas para timezone `America/Sao_Paulo` para evitar deslocamento de datas.

## Atencao sensivel

As estruturas envolvem nomes de remetentes, razao social, contratos, historico de postagens e faturamento. IDs reais de arquivos/planilhas e dados pessoais nao devem ser documentados no repositorio. O Motor V1 resolve IDs por nome e os mantem em Script Properties.

A v0.4.1 altera somente a prioridade das evidencias usadas para gerar uma visao diagnostica. Ela nao grava Centro final, Local final ou Cliente ID e nao altera fatos mensais.

O diagnostico de identidade nao deve expor dados no frontend e nao deve ser usado para IA externa antes da definicao de minimizacao de dados.

## Fora do escopo desta etapa

- Senhas e autenticacao de clientes.
- Caixa diario usando `MODALIDADE_PAGAMENTO` e `FORMA_PAGAMENTO`.
- Integracoes com arquivos de apoio comercial.
- Curva ABC como visao do CRM.
- Automacao/agente para download diario de Atende e Consolidador.
- Substituicao do merge atual Atende + Consolidador antes de sua regra ser homologada no novo motor.
