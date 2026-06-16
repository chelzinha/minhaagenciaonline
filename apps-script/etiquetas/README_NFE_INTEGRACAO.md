# Integração com o importador de NF-e PDF

Este backend de etiquetas não precisou receber novas actions para a importação de NF-e em PDF.

A leitura do PDF acontece em um Web App Apps Script separado (`nfs.zip`), porque ele usa Drive API avançada para converter PDF/DANFE em texto.

O frontend chama o extrator NFE diretamente e usa os dados extraídos para preencher:

- destinatário;
- NF-e: número, série, valor e chave;
- valor declarado sugerido;
- itens da declaração de conteúdo.

Configurar no frontend:

- `/app/js/config.js` → `NFE_WEBAPP_URL`
- `/superfrete/js/config.js` → `NFE_WEBAPP_URL`

Se quiser validar sessão no extrator NFE, configure no projeto `nfs.zip`:

```js
NFE_CFG.AUTH.MAIN_APP_GAS_URL = 'URL_DO_WEB_APP_DESTE_BACKEND';
```
