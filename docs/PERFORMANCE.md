# PERFORMANCE

Documento tecnico em preparacao.

## CRM - performance de boot e loading inicial

Data: 2026-07-07

Diagnostico de entrada:
- Lighthouse anterior indicava performance em torno de 57.
- FCP era rapido, mas LCP ficava alto, em torno de 15s.
- Speed Index estava alto.
- DOM inicial passava de 36 mil elementos em cenarios com Kanban grande.
- O boot renderizava Home, Prospects, Clientes e Agenda mesmo quando a URL abria uma tela especifica.
- `get_crm_boot_v3` entregava todos os blocos principais em uma unica resposta.

Mudancas aplicadas:
- URL `view`/`sub` passa a ser aplicada antes do primeiro render pesado.
- Boot do frontend tenta `get_crm_boot_v4` por view, com fallback para v3 e fluxo antigo.
- Render inicial passa a montar somente a view ativa.
- Prospects e Clientes renderizam somente a subaba ativa.
- Kanban limita o DOM inicial a 80 cards por coluna e expande em blocos de 80 via "Ver mais".
- `get_crm_data` passa a carregar sob demanda para cadastros, modal de edicao/cadastro e busca de entidade na Agenda.
- Instrumentacao opcional de performance foi adicionada via `debugPerf=1` ou `localStorage.agfCrmPerf = '1'`.

Como medir:
- Abrir `/crm/?view=prospects&sub=prospects-funil&debugPerf=1`.
- Conferir logs `[CRM PERF]` no console.
- Medir `boot`, `api:get_crm_boot_v4`, `render:view:*`, `render:board:*`, `render:table:*` e `loadLegacyData`.
- Conferir contagem aproximada de elementos no DevTools antes/depois em telas de Kanban.
- Comparar payload/timing entre `get_crm_boot_v4` e fallback v3 quando publicado.

Checklist de teste:
- `/crm/`
- `/crm/?view=home`
- `/crm/?view=prospects&sub=prospects-funil`
- `/crm/?view=prospects&sub=prospects-cadastro`
- `/crm/?view=clientes&sub=clientes-dashboard`
- `/crm/?view=clientes&sub=clientes-cadastro`
- `/crm/?view=agenda`
- Filtros multiple select, selecionar todos, limpar filtro e badges.
- Botao "Ver mais" do Kanban.
- Drag and drop dos cards visiveis.
- Modais de cadastro/edicao e busca de entidade na Agenda.

Proximos passos recomendados:
- Medir LCP e DOM real apos publicar o Apps Script com `get_crm_boot_v4`.
- Avaliar paginação ou virtualização real do Kanban se o volume continuar crescendo.
- Avaliar payloads resumidos dedicados para dashboards.
- Avaliar cache no Apps Script para blocos de config e jornadas quando seguro.

## Modulo Reverso - pontos de performance

Chamadas que merecem atencao:
- getDashboard: pode ficar pesado se montar resumo lendo muitas linhas.
- getUserHistory: pode crescer com historico e deve considerar limite, filtro ou paginacao.
- readEtiqueta: deve evitar varredura ampla de planilha quando possivel.
- confirmDropoff: deve priorizar escrita objetiva e segura.
- getUnitBySlug e getUnitStatus: candidatas a cache curto.

Pontos positivos identificados:
- Uso de LockService em pontos de escrita/concorrencia.
- Uso de setValues e escrita em lote em alguns fluxos.
- Separacao entre camada API e regra de negocio.

Melhorias futuras recomendadas:
- Avaliar CacheService para unidade/status.
- Avaliar limite ou paginacao em historico.
- Avaliar aba-resumo ou cache para dashboard.
- Evitar getDataRange().getValues() em abas grandes quando houver consulta especifica.

Observacao:
- Nenhuma otimizacao de codigo foi aplicada nesta etapa. Este registro e diagnostico tecnico.

## Modulo /app - pontos de performance

Caracteristicas:
- SPA estatica com scripts e estilos proprios.
- PWA com service worker e cache do shell.
- Chamadas dinamicas para Apps Script e APIs Correios/CWS.
- Uso de PDF base64 para preview, download, reimpressao e merge.
- Importacao de NF-e envia PDF ao Web App externo em base64.

Pontos positivos identificados:
- App sem framework pesado.
- Rotas internas por hash evitam necessidade de rewrites para cada tela.
- Service worker do landing evita interferir em /app/.
- Service worker do /app precacheia shell e assets principais.
- API usa timeout e Content-Type text/plain para evitar preflight CORS.
- Autocomplete de destinatarios usa debounce.
- Reimpressao tenta recuperar PDF salvo no Drive, evitando gerar novamente quando possivel.

Chamadas que merecem atencao:
- cotarTodos: depende de Correios/CWS e pode ter latencia externa.
- criarEtiqueta e criarEtiquetaDireta: envolvem validacao, Correios/CWS, geracao de PDF, Drive e historico.
- reimprimirEtiqueta: pode buscar PDF no Drive ou regerar documentos.
- listarHistorico: pode crescer com o volume de etiquetas.
- listarDestinatarios: deve considerar limite, filtro ou paginacao se a base crescer.
- importarDestinatariosCsv: pode pressionar tempo de Apps Script em arquivos grandes.
- parseNfePdf: envia PDF em base64 e depende de conversao/OCR no Web App de NF-e.

Riscos de performance:
- Arquivos frontend grandes aumentam risco de manutencao e podem afetar carregamento inicial em rede lenta.
- PDF em base64 consome memoria no navegador e no Apps Script.
- Importacao CSV grande pode atingir limite de execucao.
- Falha de CDN da biblioteca de PDF pode impedir merge de PDFs, mesmo que PDFs individuais ainda funcionem.
- Cache PWA desatualizado pode manter usuario em versao antiga se o versionamento nao for atualizado em deploy.

Melhorias futuras recomendadas:
- Avaliar paginacao ou limite menor para destinatarios e historico.
- Definir limite documentado para importacao CSV.
- Medir tempo medio de cotarTodos, criarEtiqueta, reimprimirEtiqueta e parseNfePdf.
- Manter checklist de versionamento do service worker em qualquer mudanca de JS/CSS do /app.
- Avaliar reducao gradual de acoplamento em index.html, screens.css e telas maiores, sem reescrita ampla.

Observacao:
- Nenhuma otimizacao de codigo foi aplicada nesta etapa. Este registro e diagnostico tecnico.

## CRM — melhoria de percepção de performance da Agenda

### Escopo
Atualização de percepção de performance no frontend do CRM.

### O que mudou
- A Agenda renderiza imediatamente com os dados já disponíveis.
- Quando a janela de datas ainda não está carregada, a busca ocorre em background.
- Ao finalizar a busca, a Agenda e a Home são renderizadas novamente.
- A troca de modo Diário/Semanal/Mensal preserva a data atual em `state.agendaCursor`.

### Observação
Esta mudança melhora a sensação de resposta da interface, mas não representa uma migração estrutural de dados nem benchmark formal de performance.

### Pendência futura
A otimização estrutural de dados ainda deve ser tratada em evolução própria, considerando cache, dados resumidos, pré-processamento ou migração futura para banco de dados.
