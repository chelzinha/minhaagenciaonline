# Frontend — Importação de NF-e PDF integrada

Rotas alteradas:

- `/app`
- `/superfrete`

Arquivos novos:

- `/app/js/nfe-import.js`
- `/app/styles/nfe-import.css`
- `/superfrete/js/nfe-import.js`
- `/superfrete/styles/nfe-import.css`

Configuração obrigatória:

- `/app/js/config.js` → preencher `NFE_WEBAPP_URL` com a URL do Web App do projeto `nfs.zip`.
- `/superfrete/js/config.js` → preencher `NFE_WEBAPP_URL` com a mesma URL.

Fluxo esperado:

1. Usuário seleciona o PDF da NF-e/DANFE.
2. Clica em Importar PDF.
3. O app chama o Web App NFE.
4. O app preenche destinatário, valor declarado e itens.
5. O usuário revisa os dados e gera a etiqueta.

Observação:

No `/app`, se o valor declarado for preenchido após uma cotação já feita, o usuário deve recotar para que o valor declarado entre no preço. No `/superfrete`, o card de importação fica na aba Cotação para evitar esse problema.


## Correção v3 — vínculo dos botões na Etapa 2
- O módulo do importador agora é exposto explicitamente em `window.NfeImport` no `/app`.
- O módulo do importador agora é exposto explicitamente em `window.SfNfeImport` no `/superfrete`.
- Isso garante que os eventos dos botões **Importar PDF** sejam associados após o carregamento/montagem das telas.
- O importador permanece antes de **Destinatário** na Etapa 2.

Após publicar o Web App do extrator, preencher `NFE_WEBAPP_URL` em:
- `/app/js/config.js`
- `/superfrete/js/config.js`


## Correção v4 — escopo das configurações
- As URLs devem ser preenchidas somente em `/app/js/config.js` e `/superfrete/js/config.js`.
- A pasta `/js` principal pertence a uma cópia legada/root e não alimenta os módulos `/app` e `/superfrete`.
- Os objetos de configuração agora também são expostos em `window` para o importador NF-e.
