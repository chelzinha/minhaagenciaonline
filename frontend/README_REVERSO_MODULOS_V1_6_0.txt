REVERSO MÓDULOS INTERNOS v1.6.0
==================================

Alterações entregues:
- /agf/ não usa mais o atalho unificado /reverso-interno/.
- Nova seção no portal: LOGÍSTICA REVERSA.
- Cards separados: /reverso-admin/, /reverso-coleta/ e /reverso-expedicao/.
- /reverso-expedicao/ criado como módulo interno próprio, protegido por app permission reverso-expedicao.
- A aba Expedição permanece dentro de /reverso-admin/ para não quebrar o fluxo administrativo existente.
- /reverso-interno/* redireciona para /agf/ por segurança de bookmarks antigos.
- netlify.toml corrigido para publish = ".", preservando o site completo e evitando publicar apenas /reverso/.
- shared/auth reconhece a nova rota e bloqueia acesso direto sem permissão.
- /agf/usuarios/ exibe Expedição Reverso em Aplicativos permitidos.

Backend de autenticação:
- Inclua a chave reverso-expedicao no catálogo AGF_AUTH_CFG.APPS antes de homologar usuários da expedição.

Teste rápido:
1. Publicar o zip completo no Netlify.
2. Entrar em /agf/ como admin.
3. Confirmar a seção LOGÍSTICA REVERSA com os 3 cards.
4. Em /agf/usuarios/, marcar Expedição Reverso para um usuário sem marcar Admin Reverso.
5. Fazer login com esse usuário e confirmar que apenas /reverso-expedicao/ aparece quando só essa permissão estiver marcada.
6. Acessar /reverso-admin/ com o mesmo usuário e confirmar bloqueio se reverso-admin não estiver marcado.
7. Acessar /reverso-expedicao/ e confirmar carregamento da tela Expedição.
