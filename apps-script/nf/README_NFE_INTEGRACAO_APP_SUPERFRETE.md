# AGF NFE PDF Extractor — integração /app e /superfrete

Este backend é um Web App Apps Script separado, responsável apenas por ler PDF de NF-e/DANFE e devolver JSON estruturado para os aplicativos.

## Actions

- `ping`
- `parseNfePdf`

## Requisitos

No Apps Script deste projeto, ative o Serviço Avançado:

- Drive API v2

O `appsscript.json` já contém a dependência e os escopos necessários.

## Configuração recomendada

Em `00_NFE_CFG.js`:

```js
NFE_CFG.AUTH.MAIN_APP_GAS_URL = 'URL_DO_WEB_APP_DO_BACKEND_DE_ETIQUETAS';
```

O extrator tentará validar a sessão usando:

- `me` para o app `/app`
- `sfClientDashboard` para o app `/superfrete`

Enquanto `MAIN_APP_GAS_URL` estiver vazio e não houver `NFE_API_SECRET`, o serviço aceita chamadas para facilitar testes, mas isso deve ser fechado antes de produção.

## Frontend

Configure a URL deste Web App nos dois frontends:

- `/app/js/config.js` → `NFE_WEBAPP_URL`
- `/superfrete/js/config.js` → `NFE_WEBAPP_URL`

