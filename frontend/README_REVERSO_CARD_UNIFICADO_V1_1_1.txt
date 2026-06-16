REVERSO — card interno unificado v1.1.1

Alterações:
- Portal /agf/ agora mostra um único card "Reverso" com badge "Interno".
- Card aparece para usuários com pelo menos uma permissão: reverso-admin ou reverso-coleta.
- Nova rota /reverso-interno/ encaminha automaticamente:
  - somente reverso-admin -> /reverso-admin/
  - somente reverso-coleta -> /reverso-coleta/
  - ambos -> tela de escolha entre os dois módulos
- Mantidas as permissões separadas na tela /agf/usuarios/.
- Fluxo público /reverso/ preservado sem alteração.
