REVERSO — SEPARAÇÃO DE PERFIS V2
================================

Rotas entregues
---------------
/reverso/         Aplicativo público do usuário final. Cadastro por unidade, etiqueta, autorização, drop-off e histórico.
/reverso-admin/   Painel interno administrativo protegido pelo Portal AGF.
/reverso-coleta/  App interno simplificado do coletador protegido pelo Portal AGF.

Controle de acesso
------------------
As páginas internas utilizam o mesmo cliente de autenticação já existente em /shared/auth/.
Chaves previstas em Aplicativos permitidos:
- reverso-admin  -> label visual: Admin Reverso
- reverso-coleta -> label visual: Coleta Reverso

A tela /agf/usuarios/ recebeu os dois checkboxes visuais sem remover os aplicativos existentes.
O cliente compartilhado de autenticação reconhece as novas rotas e bloqueia acesso direto quando o usuário não possui a chave correspondente.

Ponto de validação do backend AGF_AUTH
--------------------------------------
O frontend foi preparado para salvar os novos vínculos pelo fluxo existente de adminSaveUser.
Após o deploy, edite um usuário em /agf/usuarios/, marque um dos módulos, salve e recarregue a tela.
- Se a seleção persistir: o backend atual já aceita novas chaves de app e não exige alteração.
- Se a seleção desaparecer: o backend AGF_AUTH possui whitelist própria. Nesse caso, inclua reverso-admin e reverso-coleta no catálogo do backend antes de homologar os acessos internos.

Segurança
---------
A separação impede mistura de perfis na interface e aplica guarda de rota nos HTMLs internos.
Como os endpoints operacionais do backend REVERSA ainda são tecnicamente acessíveis por URL, o endurecimento final deve validar o token AGF_AUTH também no Apps Script REVERSA antes da produção ampla.

Teste rápido
------------
1. Publicar o ZIP completo no Netlify.
2. Abrir /reverso/ e validar que só aparecem Início, Nova devolução e Histórico.
3. Entrar no Portal /agf/ como admin e abrir /agf/usuarios/.
4. Marcar Admin Reverso ou Coleta Reverso para um usuário e salvar.
5. Fazer logout/login com esse usuário.
6. Confirmar que o Portal mostra apenas os cards permitidos.
7. Acessar /reverso-admin/ e /reverso-coleta/ diretamente para testar bloqueio/liberação.
