# TESTES - CENTRAL AGF Motor V1 v0.9.1

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

## Regressao da auditoria de qualidade - v0.9.1

A v0.9.0 foi executada e serviu como diagnostico, mas revelou que contratos compartilhados de intermediadores estavam sendo tratados indevidamente como autoridade cadastral. A v0.9.1 substitui essa regra antes de qualquer persistencia.

Testes obrigatorios:

1. `centralAgfAutoConfigurar()` deve resolver `PROCESSAMENTO_POSTAGENS_CORREIOS` e manter o ID somente em Script Properties.
2. `02_CONTRATOS` deve conter `NUMERO_CONTRATO`, `RAZAO_SOCIAL` e `INTERMEDIADOR`.
3. Somente linhas com `INTERMEDIADOR=PORTAL POSTAL` podem atuar como autoridade de Razao Social para `AGF_RAZAO_SOCIAL`.
4. Contratos com intermediadores como SuperFrete, Locaweb, Mercado Livre ou outros nao podem substituir o nome do cliente; sao apenas evidencia historica.
5. Valores sentinela `null`, `SEM CONTRATO` e `9999999999` nao podem entrar como contrato de autoridade.
6. Um `BALCÃO` corretamente acentuado nao pode ser marcado como `POSSIVEL_CODIFICACAO_CORROMPIDA` apenas por conter a letra `Ã`.
7. Mojibake real ou caractere de substituicao deve continuar sinalizado.
8. Limpeza automatica pode remover apenas padroes deterministas: CNPJ completo, CNPJ sem mascara, raiz/codigo cadastral e lista numerica operacional prefixando o nome.
9. Se uma unica Razao Social de Portal Postal estiver ligada aos contratos observados, ela pode ser usada como nome oficial proposto.
10. Se mais de uma Razao Social de Portal Postal permanecer para a mesma identidade, o caso deve ficar `REVISAR_QUALIDADE`.
11. Se dois `CLIENTE_ID_PROPOSTO` do mesmo Centro convergirem para o mesmo nome final, ambos devem ficar `REVISAR_QUALIDADE`.
12. O resumo deve distinguir linhas em colisao de grupos de colisao.
13. `24_AUDITORIA_QUALIDADE_MASTER` e `25_RESUMO_QUALIDADE_MASTER` devem ser rebuildable.
14. Nenhuma execucao pode escrever em `01_CLIENTES_MASTER`, `04_CLIENTES_CENTRO_LOCAL` ou fatos mensais.

## Criterio para avancar

So desenhar a persistencia efetiva depois de:

- invariantes historicas continuarem homologadas;
- lote seguro permanecer com 2.140 identidades e zero conflitos para o baseline atual;
- proposta de Cliente ID permanecer integralmente reconciliada;
- auditoria v0.9.1 ser reexecutada;
- falsas colisoes causadas por contratos compartilhados deixarem de existir;
- colisoes reais de identidade restantes serem analisadas/consolidadas explicitamente;
- qualquer `REVISAR_QUALIDADE` residual ser tratado sem fuzzy automatico;
- a futura escrita preservar `CLIENTE_ID` ja persistido como imutavel.
