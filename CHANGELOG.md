# Changelog

Todas as mudancas relevantes deste projeto serao registradas aqui.

## 2026-08-23 - Central AGF v0.8.0: proposta idempotente de Cliente ID

### Criado
- Nova rotina `centralAgfGerarPropostaClienteId()` em `apps-script/central-agf/12_PROPOSTA_CLIENTE_ID.gs`.
- Nova visao `21_PROPOSTA_CLIENTES_MASTER` com proposta de linhas para o Cadastro Mestre sem persistencia.
- Nova visao `22_CONFLITOS_PROPOSTA_ID` para isolar colisao de ID, chave duplicada ou conflito com registro ja existente no Master.
- Novo `23_RESUMO_PROPOSTA_ID` para reconciliar a quantidade do lote seguro entre propostas novas, registros ja existentes e conflitos.

### Regra de CLIENTE_ID
- Formato `CLI_` + 20 caracteres hexadecimais.
- Valor deterministico por SHA-256 sobre namespace tecnico fixo + `LOTE_ITEM_ID`.
- O ID nao carrega nome, Centro, CPF/CNPJ ou outro significado comercial visivel.
- Depois de persistido futuramente em `01_CLIENTES_MASTER`, o ID deve ser imutavel e nunca recalculado por mudanca de nome ou alias.

### Travas
- A proposta so executa quando `20_RESUMO_LOTE_SEGURO` estiver com zero conflitos residuais.
- `LOCAL_ID_PRINCIPAL` permanece vazio; origem historica de Local nao vira vinculo definitivo automaticamente.
- `RAZAO_SOCIAL_OFICIAL` so e preenchida automaticamente para identidade `AGF_RAZAO_SOCIAL`.
- `CNPJ_CPF` e `NOME_FANTASIA` nao sao inventados.
- Nenhuma linha e gravada em `01_CLIENTES_MASTER` nesta versao.

### Baseline que liberou a v0.8.0
- Lote seguro v0.7.1 homologado com 2.140 identidades.
- 1.106 identidades `CTR_AGF` e 1.034 `CTR_METRO`.
- 29 casos AGF Balcao + contrato consolidados pela mesma identidade canonica.
- Zero conflitos residuais.
- R$ 4.887.208,27 de faturamento preservado integralmente no lote seguro.

### Atencao sensivel
- A mudanca cria identificadores tecnicos derivados de identidade cadastral e usa faturamento apenas como evidencia de reconciliacao.
- Nenhum `CLIENTE_ID` e persistido ainda, nenhum Local final e definido e nenhum fato historico e alterado.
- Nenhum nome real, CPF/CNPJ, telefone, e-mail, endereco, ID privado ou credencial foi registrado neste changelog.

## 2026-08-23 - Central AGF v0.7.1: consolidacao AGF Balcao + contrato

### Corrigido
- `AGF_BALCAO_REMETENTE` e `AGF_RAZAO_SOCIAL` deixam de ser tratados como conflito quando pertencem ao mesmo `CTR_AGF` e ao mesmo nome canonico exato.
- Nesse caso, `AGF_RAZAO_SOCIAL` prevalece como identidade cadastral e a evidência de Balcao permanece preservada como alias/origem.
- Outras combinacoes de tipos continuam bloqueadas.

### Homologado
- 2.170 entradas `PRONTO_PREVIA` consolidadas em 2.140 identidades.
- 2.140 identidades no lote seguro e zero conflitos residuais.
- Faturamento de R$ 4.887.208,27 preservado integralmente.

## 2026-08-23 - Central AGF v0.7.0: lote seguro de migracao de clientes

### Criado
- Nova rotina `centralAgfGerarLoteSeguroMigracaoClientes()` em `apps-script/central-agf/11_LOTE_SEGURO_MIGRACAO_CLIENTES.gs`.
- Nova visao derivada `18_LOTE_SEGURO_CLIENTES` para consolidar apenas candidatos `PRONTO_PREVIA` por Centro + nome canonico normalizado.
- Nova visao `19_CONFLITOS_LOTE_SEGURO` para retirar automaticamente do lote qualquer colisao de Centro, tipo, estrategia ou canonico.
- Novo `20_RESUMO_LOTE_SEGURO` para reconciliar quantidade e faturamento da entrada entre lote seguro e conflitos.
- `LOTE_ITEM_ID` deterministico para rastrear a mesma identidade derivada entre reconstrucoes sem criar `CLIENTE_ID`.

### Travas
- O mesmo canonico em mais de um Centro nao e unificado automaticamente.
- `AGF_BALCAO_REMETENTE` e `AGF_RAZAO_SOCIAL` so sao aceitos com `CTR_AGF`.
- `METRO_REMETENTE` so e aceito com `CTR_METRO`.
- Somente `ALIAS_MANUAL_LEGADO`, `ALIAS_EXATO_NORM_LEGADO` e `RAZAO_SOCIAL_AGF` entram no lote seguro.
- Canonico vazio/placeholder e Centro desconhecido ficam fora do lote.
- A aba 18 e totalmente rebuildable e nao recebe campos persistentes de aprovacao humana.

### Atencao sensivel
- A rotina manipula identidade cadastral derivada e faturamento agregado, mas nao grava em `01_CLIENTES_MASTER`, nao cria `CLIENTE_ID`, nao altera Centro/Local final e nao muda fatos mensais.
- Nenhum nome real, CPF/CNPJ, telefone, e-mail, endereco, ID privado ou credencial foi registrado no repositorio.

## 2026-08-23 - Central AGF v0.6.0: revisao assistida de identidade

### Criado
- `16_RESUMO_IDENTIDADE` com contagens agregadas da previa e da fila de revisao.
- `17_FILA_REVISAO_ASSISTIDA` com ate tres sugestoes locais por candidato, ordenada por impacto financeiro.
- Sugestoes deterministicas por correspondencia compacta e retirada de sufixo numerico, alem de evidencias legadas usadas apenas como assistencia.

### Baseline homologado
- 6.548 casos em revisao.
- 385 com alias confiavel retido por outro motivo.
- 34 sugestoes deterministicas.
- 72 sugestoes legadas fortes.
- 24 sugestoes legadas de alta confianca.
- 30 sugestoes legadas medias.
- 6.003 sem sugestao confiavel.

### Regra
- Nenhuma sugestao fuzzy/score promove automaticamente um cliente.
- A fila continua somente leitura para a identidade final e nao escreve no Cadastro Mestre.

## 2026-08-23 - Central AGF v0.5.0: previa de migracao de clientes

### Criado
- `14_PREVIA_MIGRACAO_CLIENTES` e `15_FILA_REVISAO_IDENTIDADE`.
- Reaproveitamento automatico apenas de alias manual, `EXATO_NORM` score 100 e identidade AGF contratada por Razao Social.

### Baseline homologado
- 8.724 candidatos totais.
- 2.170 `PRONTO_PREVIA`.
- 6.548 `REVISAR`.
- 6 `NAO_CRIAR_CLIENTE`.

### Regra
- A previa nao cria `CLIENTE_ID` e nao grava no Cadastro Mestre.

## 2026-08-23 - Central AGF v0.4.2: correcao da regra BALCAO x METRO

### Corrigido
- `RAZAO_SOCIAL=BALCÃO` e regra comercial explicita de AGF e vence `CENTRO_ORIGEM`.
- `RAZAO_SOCIAL=GAS SHOPPING METRO` e regra comercial explicita de METRO e vence `CENTRO_ORIGEM`.
- Para demais identidades, `CENTRO_ID_FINAL` confirmado vence fallbacks e, na ausencia dele, `CENTRO_ORIGEM` pode orientar provisoriamente.

### Observacao
- Esta versao substitui a interpretacao intermediaria registrada na v0.4.1 abaixo. A v0.4.1 permanece no historico apenas para rastreabilidade e nao deve ser usada como regra atual.

## 2026-08-23 - Central AGF v0.4.1: prioridade de Centro no diagnostico de identidade [SUPERADA PELA v0.4.2]

### Corrigido
- `centralAgfClassificarIdentidade_()` passa a respeitar `CENTRO_ID_FINAL` como evidencia de maior prioridade.
- Sem Centro final, `RAZAO_SOCIAL = GAS SHOPPING METRO` permanece regra forte de Metro.
- Sem Centro final nem regra forte Metro, `CENTRO_ORIGEM` reconhecido passa a orientar a classificacao antes do fallback generico `RAZAO_SOCIAL = BALCÃO`.
- `RAZAO_SOCIAL = BALCÃO` so sugere AGF quando nenhum Centro reconhecido estiver disponivel.
- Fatos com origem Metro e Razao Social generica `BALCÃO` deixam de ser deslocados indevidamente para `AGF_BALCAO_REMETENTE`.
- Versao do Motor V1 atualizada para `0.4.1`.

### Evidencia de homologacao
- A revisao da aba derivada `13_DIAGNOSTICO_IDENTIDADE` encontrou identidades Metro divididas entre grupos AGF e Metro apenas porque alguns fatos traziam `RAZAO_SOCIAL=BALCÃO`.
- A conferencia da fonte mensal confirmou que esses fatos preservavam `CENTRO_ORIGEM=METRO`; portanto, a classificacao antiga dava prioridade excessiva a uma Razao Social generica.
- Nenhum fato mensal foi alterado durante a investigacao.

### Atencao sensivel
- A mudanca afeta inferencia de identidade/centro de clientes e, portanto, deve ser homologada antes de qualquer migracao para `01_CLIENTES_MASTER`.
- A rotina continua somente leitura sobre os fatos e nao grava `CLIENTE_ID`, `CENTRO_ID_FINAL` ou `LOCAL_ID_FINAL`.
- Nenhum nome real, CPF/CNPJ, telefone, e-mail, endereco, ID privado ou credencial foi registrado neste changelog.

## 2026-08-23 - Central AGF: ajuste da homologacao de identidade

### Corrigido
- `centralAgfAssertHistoricoHomologado_()` nao exige mais `STATUS_GERAL=OK`, porque a auditoria historica usa os estados `OK_LEGADO` e `REVISAR`.
- O diagnostico de identidade passa a bloquear apenas divergencias que comprometem a leitura historica: contagem de linhas, faturamento ou periodo.
- Alertas de SRO/FATO_ID repetido permanecem registrados e visiveis, mas nao bloqueiam o diagnostico somente leitura.
- Nenhuma linha e deduplicada, excluida ou alterada automaticamente.

### Motivo
- A auditoria confirmou 152.364 linhas e R$ 9.526.566,49 preservados, mas cinco particoes possuem SRO/FATO_ID repetido e precisam continuar em reconciliacao de fonte.
- O bloqueio anterior tratava inclusive `OK_LEGADO` como erro, fazendo as 10 particoes serem recusadas indevidamente.

### Atencao sensivel
- A mudanca afeta somente a regra de liberacao do diagnostico derivado de identidade.
- Os fatos mensais continuam somente leitura e as duplicidades continuam sinalizadas para reconciliacao; nenhuma decisao financeira ou cadastral e aplicada automaticamente.

## 2026-08-22 - Central AGF: estrutura de dados e Motor V1

### Criado
- Estrutura inicial `CENTRAL AGF` no Google Drive para separar fontes, processamento, fatos mensais, cadastro mestre, consultas e documentacao.
- Historico de postagens particionado por mes, preservando AGF e METRO na mesma estrutura logica e Centro/Local como dimensoes.
- Novo modulo `apps-script/central-agf` para materializar sob demanda todos os fatos de um periodo em `CONSULTA_HISTORICA_POSTAGENS`, preservando todas as colunas.
- Catalogo de particoes e configuracao via Script Properties, sem IDs privados versionados.
- Documento `docs/CENTRAL_AGF_DADOS.md` com arquitetura, invariantes e escopo.

### Performance
- A consulta historica deixa de depender de uma planilha fisica unica e crescente.
- O Motor V1 processa particoes mensais sequencialmente e grava em blocos.
- A materializacao completa fica reservada para auditoria; o front futuro deve priorizar dados resumidos/pre-processados.

### Atencao sensivel
- A nova camada trata nomes de remetentes, razao social, contratos, historico de postagens e faturamento.
- Nenhum ID privado de planilha/pasta, token, senha ou dado real de cliente foi registrado no repositorio.
- Nenhuma planilha atual de producao foi desativada ou substituida nesta etapa.

## 2026-08-18 - Acesso ao emissor DC-e

### Criado
- Adicionada a rota publica `/dce`, que redireciona temporariamente para o projeto isolado `agf-dce-facil` no Netlify.
- O redirecionamento usa HTTP 302 para permitir futura troca por um subdominio proprio sem cache permanente.

### Escopo
- Apenas roteamento do site principal.
- Nao altera autenticacao existente, Apps Script, planilhas, dados, regras fiscais ou o codigo do emissor.

## 2026-07-07 - CRM performance de boot e loading

### Melhorado
- Boot do CRM passa a priorizar a view ativa.
- Renderizacao inicial evita montar telas invisiveis.
- Kanban passa a limitar cards iniciais por coluna com opcao de "Ver mais".
- Dados cadastrais detalhados passam a carregar sob demanda quando possivel.
- Adicionada instrumentacao segura de performance via `debugPerf=1`.

### Escopo
- Frontend do CRM.
- Apps Script somente para rota de boot otimizada.
- Nao altera planilhas, dados ou autenticacao.

## [nao versionado] - 2026-07-03
### Alterado
- Nuvemshop (/nuvem): tela de Pedidos passou a priorizar pedidos pagos, com chips visuais por pagamento, servico PAC/SEDEX e valor do pedido no card.
- Nuvemshop (/nuvem): botao de sincronizacao do frontend agora solicita lote menor para reduzir tempo de importacao.
- Nuvemshop (/nuvem): adicionado reparo de scroll lock para evitar travamento da rolagem no desktop apos loading/modal.
- Nuvemshop Apps Script: criada sincronizacao incremental de pedidos pagos usando cursor tecnico em LAST_SYNC_AT, com bloqueio para pedidos cancelados ou sem pagamento confirmado.
- Nuvemshop Apps Script: geracao individual e em lote passa a bloquear pedido nao pago ou cancelado antes de enviar para o App de Postagens.
- Nuvemshop Apps Script: webhook de pedido passa a processar apenas pedidos pagos e registra tambem evento order/paid quando a rotina de registro for executada.

### Atencao sensivel
- A mudanca envolve pedidos Nuvemshop, status de pagamento, dados de destinatario, rastreio, Apps Script, planilhas e tokens armazenados em PropertiesService.
- Nenhum token, URL completa de Web App, ID real de planilha, payload bruto ou dado real de cliente foi registrado neste changelog.

## [nao versionado] - 2026-06-30
### Corrigido
- CRM/Prospects: barra de filtros passou a usar escopo de prospect. Local agora
  vem de config.prospectLocais e a secao Prospects nao exibe mais "Todas as
  curvas (clientes)". Clientes/Home/Agenda seguem com Local de CRM + curvas.
  Arquivo: frontend/crm/app.js.
- CRM/Locais (backend): crm3_apiGetConfig_ e crm83_getActiveLocals_ blindados.
  Uma falha de Locais nao derruba mais o bootstrap do CRM. Versao 8.3.2.
  Arquivos: apps-script/base-metro/06_CRM_JORNADA_FASE3.js e 12_CRM_LOCAIS_FASE83.js.

## Documentacao - CRM_LOCAIS por EXIBIR_EM

- Documentada a correcao funcional ja aplicada para separar locais de CRM/clientes e Prospects pela coluna `EXIBIR_EM` da aba unica `CRM_LOCAIS`.
- Registrado que `EXIBIR_EM=CRM` alimenta filtros e configuracoes de CRM/clientes, enquanto `EXIBIR_EM=PROSPECTS` alimenta filtros e cadastro de Prospects.
- Registrados tambem os valores aceitos `CRM`, `PROSPECTS`, `CRM;PROSPECTS`, `AMBOS` e `TODOS`.
- Reforcado que nao existe aba separada `PROSPECTS_LOCAIS` e que a constante `PROSPECTS_LOCAIS` nao deve ser recriada.
- Objetivo: evitar regressao em que locais de clientes, como CF e METRO, aparecam em Prospects; Prospects devem usar locais configurados para `PROSPECTS`, como ESTACAO FASHION, SHOPPING PARANGABA e REVERSA.
- Nenhuma alteracao funcional aplicada nesta etapa de documentacao.

## Documentacao - correcao conceitual MIDIAS_CRM x Manuais

- Corrigida a documentacao para registrar que `MIDIAS_CRM` e a biblioteca estrategica de conteudos usados pelas acoes do CRM.
- Corrigida a documentacao para registrar que `Manuais` e uma biblioteca mais ampla da tela `/intra/manuais/`, podendo incluir conteudos proprios e tambem conteudos vinculados ou equivalentes a `MIDIAS_CRM`.
- Adicionada proposta de colunas `ORIGEM_CONTEUDO` e `MIDIA_CRM_ID` para permitir relacao entre as duas estruturas sem fundir as abas.
- Nenhuma alteracao funcional aplicada nesta etapa.

## Documentacao - mapa inicial APP Total CF + Metro

- Criado `docs/PLANILHA_APP_TOTAL_CF_METRO.md` para registrar a planilha APP Total CF + Metro como fonte viva das regras de CRM, agenda, visitas, materiais e manuais.
- Registrado o achado inicial de que `/intra/manuais/` deve ser alimentado pela aba `Manuais`, nao pela estrutura fixa de acoes/midias do CRM.
- Proposta estrutura de colunas opcionais para vincular cada manual a `ACAO_CRM`, `FILTRO_CLIENTE`, publico, curva, status, tendencia, contrato e outros filtros comerciais.
- Atualizado `docs/PLANILHAS_E_DADOS.md` com referencia ao novo mapa e regra de manutencao.
- Nenhuma alteracao funcional aplicada nesta etapa.

## Setup Codex do projeto

* Adicionada estrutura local `.codex/` para apoio ao uso do Codex no projeto.
* Criado arquivo `.codex/config.toml` com regras locais seguras, sem credenciais.
* Criado prompt padrão em `.codex/prompts/trabalho-local-seguro.md`.
* Criado documento `docs/ROTINA_CODEX.md` com o fluxo recomendado de uso do Codex.
* Nenhuma alteração funcional aplicada.

## 2026-06-16

### Criado

- Estrutura inicial do repositorio tecnico minhaagenciaonline.
- Pastas base para frontend, Apps Script, documentacao, previews e releases.
- Primeiro commit tecnico do projeto.
- Frontend atual adicionado ao repositorio GitHub.
- Deploy de producao conectado ao GitHub pela branch main.
- Netlify configurado para publicar a pasta frontend.

### Observacoes

- Antes desta migracao, o site era publicado por deploy manual no Netlify.
- A partir desta etapa, o repositorio GitHub passa a ser a fonte viva do frontend.
