# Changelog

Todas as mudancas relevantes deste projeto serao registradas aqui.

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
- O site www.minhaagenciaonline.com.br foi validado visualmente apos o deploy inicial pelo GitHub.

## 2026-06-16 - Apps Script do projeto

- Adicionados ao repositorio os Apps Script vinculados ao projeto minhaagenciaonline.
- Criado .gitignore para impedir versionamento de arquivos .clasp.json.
- Realizada verificacao inicial para evitar envio de segredos reais.
- Commit relacionado: badf763.

## Auditoria tecnica - Modulo Reverso

- Documentada auditoria inicial do modulo Reverso.
- Mapeadas telas do frontend, camada API, Apps Script, dados, planilhas, riscos e melhorias futuras.
- Consolidados pontos principais em APPS_SCRIPT, PLANILHAS_E_DADOS, PERFORMANCE e SEGURANCA_E_DADOS.
- Nenhuma alteracao funcional aplicada nesta etapa.

## Melhoria UX - mensagens do Reverso

- Ajustadas mensagens de loading e erro no frontend do modulo Reverso.
- Melhoradas mensagens de autenticacao, validacao de etiqueta, servidor e carregamento de unidade.
- Nenhuma regra de negocio, endpoint, planilha ou Apps Script foi alterado.

## Melhoria UI - mobile Reverso

- Ajustados botoes, loading, toast e estado vazio no frontend do modulo Reverso.
- Melhoria restrita a CSS, sem alteracao de backend, API, planilhas ou regras de negocio.

## Documentacao - checklist de testes Reverso

- Adicionado checklist manual para validar o modulo /reverso.
- Checklist cobre carregamento inicial, unidade, login, etiqueta, camera, drop-off, historico, painel AGF, mobile e seguranca visual.
- Nenhuma alteracao funcional aplicada.

## Documentacao - Modulo /app Minhas Postagens

- Documentado o modulo /app como SPA/PWA publica de Minhas Postagens.
- Mapeados frontend, rotas internas, actions, Apps Script, planilhas, dados sensiveis, riscos e pontos de performance.
- Registrados cuidados para nao expor URLs completas de Web App, IDs de planilha, IDs de Drive, tokens ou dados reais.
- Nenhuma alteracao funcional aplicada.

## Documentacao - checklist de seguranca /app

- Criado checklist de seguranca do modulo /app por prioridade: critica, alta, media e baixa.
- Documentadas validacoes esperadas para sessao, Web Apps, actions, payloads, logs, diagnostico, NF-e/DANFE, PDFs, Drive, planilhas e Correios/CWS.
- Registradas orientacoes de teste seguro para Rachel, sem expor URLs completas, IDs reais, tokens, credenciais ou dados reais.
- Nenhuma alteracao funcional aplicada.

## Documentacao - mapa de actions e payloads /app

- Mapeadas actions consumidas pelo frontend do /app, suas origens, funcoes Apps Script relacionadas, payloads resumidos e respostas esperadas.
- Registrados dados sensiveis envolvidos e riscos de regressao por action.
- Adicionada relacao entre actions, planilhas, dados e pontos de seguranca.
- Nenhuma alteracao funcional aplicada.
