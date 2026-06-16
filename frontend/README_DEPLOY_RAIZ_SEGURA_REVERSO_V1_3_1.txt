DEPLOY DIRETO NO NETLIFY — SITE COMPLETO COM RAIZ PRESERVADA

Este ZIP deve ser enviado inteiro ao mesmo projeto do Netlify.
Não publique somente a pasta /reverso e não altere o diretório de publicação.

Validações desta versão:
- A raiz / mantém a landing page pública AGF José Bonifácio.
- /reverso/ mantém o app público de logística reversa.
- /reverso-admin/ mantém o painel administrativo.
- /reverso-coleta/ mantém o app do coletador.
- /reverso-interno/ mantém o seletor de perfil interno.
- Não existe netlify.toml alterando publish para /reverso.
- Os redirects são limitados somente às rotas do módulo Reverso.

Após publicar:
1. Abra https://minhaagenciaonline.com.br/ e confirme a home pública.
2. Abra https://minhaagenciaonline.com.br/reverso/ e confirme o app público.
3. Use Ctrl+F5. Se necessário, limpe o service worker antigo no navegador.
