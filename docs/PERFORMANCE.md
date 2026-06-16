# PERFORMANCE

Documento tecnico em preparacao.

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
