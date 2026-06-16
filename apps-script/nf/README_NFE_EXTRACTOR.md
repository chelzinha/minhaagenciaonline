# AGF NFE PDF EXTRACTOR — v1.1

Web App isolado para extrair dados de DANFE/NF-e em PDF.

## Ajuste v1.1
A validação de sessão aceita somente actions de leitura autorizadas:
- `/app`: `me`
- `/superfrete`: `sfClientDashboard`

Configure `NFE_CFG.AUTH.MAIN_APP_GAS_URL` com a URL `/exec` do backend principal antes de produção.
