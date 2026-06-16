REVERSO BACKEND v1.5.1

Desempenho:
- Novo endpoint getAdminBootstrap.
- O endpoint lê as abas principais uma vez por ciclo e monta em memória os joins, indicadores e status por unidade.
- Cache curto de 12 segundos via CacheService; o frontend pode usar force=1 ao atualizar manualmente.
- getDashboard e listUnidades reutilizam o snapshot agregado.
- getCollectorHome deixou de executar leituras repetidas por unidade para calcular ocupação.

Compatibilidade:
- Endpoints anteriores preservados.
- Não há nova migração de planilha nesta versão.
- O fluxo de postagem continua enviando e-mail automaticamente após confirmação do SRO.
- O WhatsApp continua assistido por link preenchido com nome do usuário e SRO.

Deploy:
1. Executar clasp push.
2. Publicar nova versão da mesma implantação Web App, preservando a URL /exec.
3. Não é necessário executar migração de planilha.
