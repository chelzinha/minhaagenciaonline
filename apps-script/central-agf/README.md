# CENTRAL AGF - Motor V1

Projeto Apps Script destinado a `CONSULTA_HISTORICA_POSTAGENS` e às visões derivadas do `CADASTRO_MESTRE_CLIENTES`.

## Escopo atual - v0.9.1

- Descobrir por nome, uma unica vez, as planilhas tecnicas e salvar seus IDs em Script Properties.
- Sincronizar o catalogo de particoes mensais a partir de `CONTROLE_CARGAS_POSTAGENS!03_PARTICOES`.
- Auditar as particoes historicas antes de qualquer substituicao da producao.
- Materializar, sob demanda, todos os fatos de um periodo em `03_POSTAGENS`, preservando todas as colunas.
- Gerar diagnostico, previa, revisao assistida e lote seguro de identidade sem alterar fatos.
- Gerar proposta idempotente de `CLIENTE_ID` sem escrever em `01_CLIENTES_MASTER`.
- Auditar qualidade cadastral antes de qualquer persistencia.

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
- `24_AUDITORIA_QUALIDADE_MASTER` e `25_RESUMO_QUALIDADE_MASTER`: qualidade cadastral antes da persistencia.

## Lote seguro - v0.7.1

`centralAgfGerarLoteSeguroMigracaoClientes()` consolida apenas `PRONTO_PREVIA`. No `CTR_AGF`, o mesmo canonico exato visto como `AGF_BALCAO_REMETENTE` e `AGF_RAZAO_SOCIAL` representa canais/evidencias da mesma identidade; `AGF_RAZAO_SOCIAL` prevalece como identidade cadastral.

Baseline homologado: 2.170 entradas -> 2.140 identidades seguras, zero conflitos residuais, 1.106 AGF e 1.034 METRO, com R$ 4.887.208,27 preservados.

## Proposta de Cliente ID - v0.8.0

`centralAgfGerarPropostaClienteId()` gera `CLIENTE_ID_PROPOSTO` no formato `CLI_` + 20 caracteres hexadecimais por SHA-256 sobre namespace tecnico fixo + `LOTE_ITEM_ID`.

O ID nao codifica nome, Centro, contrato ou CPF/CNPJ. Depois de persistido, deve ser imutavel. `LOCAL_ID_PRINCIPAL`, `CNPJ_CPF` e `NOME_FANTASIA` permanecem vazios sem fonte homologada.

Baseline homologado: 2.140 propostas, zero conflitos e zero escritas em `01_CLIENTES_MASTER`.

## Auditoria de qualidade do Master - v0.9.1

`centralAgfAuditarQualidadePropostaMaster()` gera `24_AUDITORIA_QUALIDADE_MASTER` e `25_RESUMO_QUALIDADE_MASTER`.

A primeira execucao da v0.9.0 revelou uma regra incorreta: todos os contratos observados estavam sendo tratados como autoridade cadastral. Isso incluia contratos compartilhados de intermediadores como SuperFrete, Locaweb e Mercado Livre, capazes de aparecer em muitos clientes e provocar falsas substituicoes de nome e falsas colisoes.

A v0.9.1 corrige a autoridade:

- para `AGF_RAZAO_SOCIAL`, somente `PROCESSAMENTO_POSTAGENS_CORREIOS!02_CONTRATOS` com `INTERMEDIADOR=PORTAL POSTAL` pode substituir/propor a Razao Social oficial;
- contratos de outros intermediadores permanecem apenas como evidencia historica e nunca substituem a identidade do cliente;
- sentinelas como `null`, `SEM CONTRATO` e `9999999999` nao entram como contrato de autoridade;
- `BALCÃO` com acento normal nao e mais confundido com corrupcao de codificacao;
- problemas reais de mojibake continuam sinalizados;
- limpezas automaticas continuam limitadas a padroes deterministas de prefixo CNPJ/raiz/lista de codigos;
- se duas propostas do mesmo Centro convergirem para o mesmo nome final, ambas permanecem `REVISAR_QUALIDADE`.

Nenhuma linha e gravada em `01_CLIENTES_MASTER` nesta etapa.

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
10. Revisar `25_RESUMO_QUALIDADE_MASTER` e os casos `REVISAR_QUALIDADE` antes de qualquer escrita no Master.

## Nao faz nesta versao

- Nao altera `APP MODELO_AGF` atual.
- Nao processa Atende + Consolidador.
- Nao escreve em `01_CLIENTES_MASTER`.
- Nao ativa cliente no Cadastro Mestre.
- Nao define Local principal automaticamente.
- Nao altera Centro/Local nos fatos.
- Nao publica nada em producao.
- Nao usa IA externa com nomes de clientes.

## Seguranca

IDs de planilhas nao ficam versionados. O setup resolve arquivos por nome e mantem IDs somente em Script Properties. As visoes derivadas contem dados cadastrais e financeiros e nao devem ser publicadas no frontend nem copiadas para documentacao com exemplos reais.
