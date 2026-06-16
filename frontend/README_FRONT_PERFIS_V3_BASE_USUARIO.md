# Front AGF — Perfis V3 sobre a base enviada pela usuária

Esta versão foi criada a partir do arquivo `agf.zip` recebido nesta conversa.
Foram aplicadas somente as mudanças de front-end necessárias para suportar o terceiro perfil:

- `admin`: administrador do portal; acessa tudo.
- `manager`: gestor; acessa `/intra/` e aplicativos, mas não administra usuários nem ícones.
- `user`: usuário comum; acessa apenas aplicativos operacionais.

A URL real de autenticação existente em `/shared/auth/agf-auth-config.js` foi preservada.

Para funcionar integralmente, o projeto Apps Script `AGF_AUTH` também precisa estar atualizado para a V3.
