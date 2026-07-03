# FRONTEND

Documento tecnico em preparacao.

## Modulo /nuvem - Minhas Postagens Nuvemshop

Tipo de modulo:
- SPA/PWA publica de Minhas Postagens Nuvemshop.
- Frontend estatico com login proprio e rotas internas por hash.
- Integra pedidos pagos da Nuvemshop com o fluxo de geracao de etiquetas.

Entrada principal:
- frontend/nuvem/index.html

Arquivos principais:
- frontend/nuvem/js/config.js: configuracao do frontend, nome do app, versao, Web App e chaves locais.
- frontend/nuvem/js/api.js: cliente HTTP para Apps Script.
- frontend/nuvem/js/app.js: bootstrap, login, sessao, logout e registro PWA.
- frontend/nuvem/js/router.js: hash router da SPA.
- frontend/nuvem/js/ui.js: loading, toast, modal, formatadores, PDF e reparo de scroll lock.
- frontend/nuvem/js/screens/pedidos.js: fila de pedidos pagos, chips, selecao e geracao de etiqueta.
- frontend/nuvem/js/screens/historico.js: etiquetas emitidas, PDF, DC-e, PLP, rastreio e WhatsApp.
- frontend/nuvem/styles/base.css: base visual, loading, modal, toast e polimento responsivo do modulo.
- frontend/nuvem/styles/screens.css: estrutura das telas, cards, toolbar, bottom nav e listas.

Rotas internas:
- /nuvem/#/pedidos: fila de pedidos pagos elegiveis para gerar etiqueta.
- /nuvem/#/revisar/:orderId: revisao de servico, formato, peso, dimensoes e valor declarado.
- /nuvem/#/emitidas: etiquetas geradas, reimpressao, DC-e, lista de postagem, rastreio e WhatsApp.
- /nuvem/#/conta: dados resumidos da conta conectada.

Mudancas aplicadas nesta revisao:
- Cards de pedidos exibem valor do pedido quando o backend retorna TOTAL.
- Chips de pagamento ganharam cores por estado: pago, autorizado, pendente, cancelado e estornado.
- Chips de servico ganharam cores por categoria: PAC, SEDEX e outro.
- Pedidos sem pagamento confirmado ou cancelados ficam nao elegiveis no frontend.
- Checkbox e botao Gerar etiqueta ficam bloqueados para pedido nao elegivel.
- Botao de sincronizar passou a solicitar lote menor para reduzir tempo de importacao.
- Loading/toast/modal receberam reparo de scroll lock para evitar rolagem travada no desktop.
- CSS recebeu reforco mobile para botoes, cards, chips e bottom nav.

O que nao deve ser alterado sem novo mapeamento:
- Nomes das actions em frontend/nuvem/js/api.js.
- Nomes das rotas hash.
- IDs de templates e inputs usados pelos scripts de tela.
- Chaves de localStorage.
- Fluxo de autenticacao.
- URL completa do Web App em documentacao.

Checklist visual:
- Desktop: confirmar rolagem apos login, sincronizacao, modal de rastreio e erro controlado.
- Desktop: confirmar cards com chips coloridos e valor do pedido.
- Mobile: testar larguras 390px e 430px.
- Mobile: confirmar botoes sem corte e sem rolagem horizontal.
- Mobile: confirmar que bottom nav nao cobre acoes.
- Fluxo: confirmar que pedido cancelado ou nao pago nao aparece como pronto para gerar.

## Modulo Reverso - melhoria de mensagens

Tipo de ajuste:
- Melhoria de UX em mensagens de loading, erro e orientacao.

Arquivos afetados:
- frontend/reverso/index.html
- frontend/reverso/js/ui.js
- frontend/reverso/js/screens/*.js
- frontend/reverso/services/api.js

O que mudou:
- Mensagens tecnicas foram suavizadas.
- Loadings ficaram mais claros para o usuario.
- Erros de autenticacao, validacao de etiqueta, servidor e carregamento de unidade ficaram mais orientativos.

O que nao mudou:
- Nenhuma regra de negocio.
- Nenhuma action da API.
- Nenhum endpoint.
- Nenhuma planilha.
- Nenhum Apps Script.

Checklist visual:
- Testar login/primeiro acesso.
- Testar leitura manual de etiqueta.
- Testar erro de etiqueta invalida.
- Testar historico.
- Testar tela inicial no mobile.

## Modulo Reverso - revisao visual mobile

Tipo de ajuste:
- Melhoria visual leve em componentes compartilhados do Reverso.

Arquivo afetado:
- frontend/reverso/styles/components.css

O que mudou:
- Botoes ficaram mais confortaveis para toque no mobile.
- Loading-card ganhou largura mais segura em telas pequenas.
- Toast ficou mais legivel em celular.
- Empty-state recebeu ajuste leve de espacamento e leitura.

O que nao mudou:
- Nenhuma regra de negocio.
- Nenhum JavaScript.
- Nenhuma action de API.
- Nenhum Apps Script.
- Nenhuma planilha.

Checklist visual:
- Abrir /reverso em largura mobile.
- Conferir botoes principais.
- Conferir loading.
- Conferir toast de erro/sucesso.
- Conferir estados vazios.
- Conferir se desktop nao perdeu alinhamento.

## Modulo /app - Minhas Postagens

Tipo de modulo:
- SPA publica de Minhas Postagens.
- PWA com manifest, icones e service worker proprios.
- Portal operacional do cliente para cotacao, emissao de etiquetas, historico, destinatarios e configuracao.

Entrada principal:
- frontend/app/index.html

Arquivos principais:
- frontend/app/js/config.js: configuracao do frontend, nome do app, versao, URLs de Web Apps e chaves locais.
- frontend/app/js/api.js: cliente HTTP para Apps Script.
- frontend/app/js/app.js: bootstrap, login, sessao, logout e registro PWA.
- frontend/app/js/router.js: hash router da SPA.
- frontend/app/js/ui.js: loading, toast, modal, formatadores e utilitarios de PDF.
- frontend/app/js/nfe-import.js: importacao de NF-e/DANFE em PDF.
- frontend/app/js/screens/*.js: telas internas do modulo.
- frontend/app/styles/*.css: tokens, base, componentes, telas e importacao de NF-e.
- frontend/app/manifest.webmanifest: configuracao PWA.
- frontend/app/service-worker.js: cache do shell do app.
- frontend/app/modelos/modelo_importacao_destinatarios.csv: modelo de importacao de destinatarios.

Rotas internas:
- /app/#/nova: cotacao e emissao de etiqueta.
- /app/#/etiqueta: etiqueta direta.
- /app/#/sucesso: resultado, preview, download e compartilhamento de PDF.
- /app/#/historico: historico, reimpressao, cancelamento e rastreio.
- /app/#/destinatarios: cadastro, busca e importacao de destinatarios.
- /app/#/config: dados da conta, teste de conexao e diagnostico.

Fluxo resumido:
- Usuario acessa /app/.
- O frontend tenta validar sessao salva.
- Sem sessao valida, exibe login.
- Com sessao valida, monta a SPA e navega pelas rotas hash.
- As telas chamam Api.*, que envia actions para o Web App Apps Script.

Integracoes de frontend:
- Apps Script principal de etiquetas via Web App.
- Web App separado para leitura de NF-e/DANFE em PDF.
- Biblioteca externa de PDF carregada sob demanda para unir PDFs quando necessario.
- Portal publico raiz aponta para /app como acesso principal de postagens.
- Portal interno lista /app como "Minhas Postagens", mas o modulo usa login proprio.

Cuidados de UX/UI:
- Manter fluxo mobile-first.
- Preservar fontes de 16px em inputs para evitar zoom indesejado no celular.
- Testar bottom nav, topbar, loading, toast e modal em telas pequenas.
- Em importacao de NF-e, manter mensagem clara para revisar os dados antes de gerar etiqueta.
- Em historico, garantir que cancelar, reimprimir, rastrear e compartilhar fiquem claros e seguros para toque.

O que nao deve ser alterado sem mapeamento:
- Nomes de rotas hash.
- IDs de templates no index.html.
- IDs de campos usados pelos scripts de tela.
- Ordem de carregamento dos scripts.
- Chaves de localStorage.
- Nomes de actions consumidas em frontend/app/js/api.js.

### Mapa de origem das actions - /app

Arquivo central:
- frontend/app/js/api.js define os atalhos Api.* para o Web App principal de etiquetas.

Origens por tela:
- frontend/app/js/app.js: login, me e logout.
- frontend/app/js/screens/nova.js: cep, cotarTodos, buscarDestinatarios e criarEtiqueta.
- frontend/app/js/screens/etiqueta.js: cep, buscarDestinatarios e criarEtiquetaDireta.
- frontend/app/js/screens/historico.js: listarHistorico, reimprimirEtiqueta, cancelarEtiqueta e rastrearObjeto.
- frontend/app/js/screens/destinatarios.js: cep, listarDestinatarios, salvarDestinatario, excluirDestinatario e importarDestinatariosCsv.
- frontend/app/js/screens/config.js: testarTokenCws e diagnostico.
- frontend/app/js/nfe-import.js: parseNfePdf no Web App externo de NF-e e salvarDestinatario como apoio ao cadastro importado.

Actions disponiveis no cliente:
- ping
- login
- me
- logout
- cep
- cotar
- cotarTodos
- criarEtiqueta
- criarEtiquetaDireta
- cancelarEtiqueta
- reimprimirEtiqueta
- listarHistorico
- detalheEtiqueta
- rastrearObjeto
- buscarDestinatarios
- listarDestinatarios
- salvarDestinatario
- excluirDestinatario
- importarDestinatariosCsv
- testarTokenCws
- diagnostico
- parseNfePdf no Web App externo de NF-e

Cuidados de regressao no frontend:
- Nao renomear Api.* sem revisar todas as telas.
- Nao trocar IDs de inputs/templates sem revisar os scripts de tela.
- Nao mudar a estrutura da resposta sem revisar renderizacao, toasts, loading, tela de sucesso e historico.
- Nao alterar o fluxo de NF-e sem manter a orientacao de revisar dados antes de gerar etiqueta.
