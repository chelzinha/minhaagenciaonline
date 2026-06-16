# Reverso v1.6.6

Ajustes na tela pública de autenticação:

- as logos permanecem lado a lado no card superior;
- removido o texto de apoio de dentro do card das logos;
- texto “Entre com seu CPF ou faça seu primeiro acesso.” movido para abaixo do seletor Entrar / Primeiro acesso;
- tela de autenticação passa a atualizar os dados da unidade antes do login para evitar localStorage antigo sem logo;
- ampliado o reconhecimento de nomes de campos de logo vindos do backend.

Arquivos alterados:

- reverso/index.html
- reverso/js/screens/auth.js
- reverso/js/unitBrand.js
- reverso/styles/screens.css
- service-worker.js
