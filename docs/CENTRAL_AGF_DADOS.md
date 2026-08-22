# CENTRAL AGF - arquitetura de dados

## Status

Estrutura inicial criada em homologacao em 2026-08-22. Nenhuma planilha atual de producao foi desativada ou alterada por esta etapa.

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
- O historico mensal nao deve recalcular nem inventar identidade de cliente.
- Campos finais de `CLIENTE_ID`, `CENTRO_ID_FINAL` e `LOCAL_ID_FINAL` permanecem pendentes ate a homologacao do Cadastro Mestre.
- Cadastro confirmado manualmente deve vencer fallbacks automaticos.
- Para cliente novo, regras por Razao Social e depois CX/atendente podem sugerir Centro/Local; fallbacks devem ficar marcados como provisorios.
- O historico mensal e fonte de fatos; a planilha de consulta e apenas uma materializacao temporaria para auditoria.

## Consulta de todas as colunas e periodos

O Apps Script `apps-script/central-agf` implementa o primeiro motor de consulta. Ele le o catalogo de particoes, seleciona somente os meses que intersectam o periodo solicitado e grava em lote as linhas filtradas em `CONSULTA_HISTORICA_POSTAGENS!03_POSTAGENS`.

Isso permite abrir, filtrar, ordenar e criar tabela dinamica sobre todo o historico solicitado sem manter permanentemente todas as linhas em uma unica planilha fisica.

## Performance

- Particoes mensais evitam crescimento infinito de uma unica planilha.
- A consulta processa uma particao por vez e escreve em blocos.
- O frontend futuro deve usar resumos/pre-processamento para periodo total e consultar fatos detalhados apenas sob demanda.
- A materializacao completa existe para auditoria humana e nao deve ser o caminho padrao do front.

## Atencao sensivel

As estruturas envolvem nomes de remetentes, razao social, contratos, historico de postagens e faturamento. IDs reais de arquivos/planilhas e dados pessoais nao devem ser documentados no repositorio. O Motor V1 resolve IDs por nome e os mantem em Script Properties.

## Fora do escopo desta etapa

- Senhas e autenticacao de clientes.
- Caixa diario usando `MODALIDADE_PAGAMENTO` e `FORMA_PAGAMENTO`.
- Integracoes com arquivos de apoio comercial.
- Curva ABC como visao do CRM.
- Automacao/agente para download diario de Atende e Consolidador.
- Substituicao do merge atual Atende + Consolidador antes de sua regra ser homologada no novo motor.
