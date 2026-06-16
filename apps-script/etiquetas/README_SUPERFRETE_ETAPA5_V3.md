# AGF SuperFrete — Etapa 5 v3

Correções e melhorias:

1. Corrige erro `Cannot read properties of undefined (reading 'valorDeclarado')` no fluxo de pedido real Sandbox.
2. Inclui `OPTIONS` na normalização do payload de emissão.
3. Altera o peso do painel admin para entrada em gramas (`pesoG`).
4. Mantém conversão interna para kg apenas no payload enviado à API SuperFrete.
5. Inclui action `sfAdminLookupCep` para busca de endereço por CEP no cadastro do destinatário.
6. A busca de CEP usa cache de 24h e fontes públicas com fallback, sem acoplar o login SuperFrete ao CWS do app atual.

Arquivos alterados/adicionados:

- 38_SF_EMISSAO_SIMULADA.js
- 39_SF_SUPERFRETE_API.js
- 40_SF_PEDIDO_REAL.js
- 41_SF_CEP.js
- 99_ROUTER.js

Teste rápido:

1. Atualize os arquivos acima no Apps Script.
2. Faça nova implantação do Web App.
3. Suba o frontend Etapa 5 v3 no Netlify.
4. Abra `/superfrete-admin` em aba anônima.
5. Confira versão `0.5.2-etapa5-v3`.
6. Faça login admin.
7. Em Emitir etiqueta, digite CEP do destinatário e clique na lupa.
8. Informe peso em gramas, por exemplo `300`.
9. Faça cotação SuperFrete.
10. Crie pedido real Sandbox.

