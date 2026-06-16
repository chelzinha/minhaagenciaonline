# TESTES

Documento tecnico em preparacao.

## Checklist manual - Modulo Reverso

Objetivo:
- Validar o fluxo principal do modulo /reverso depois de ajustes visuais, mensagens ou pequenas melhorias.
- Este checklist nao substitui testes automatizados. Ele serve como roteiro pratico de validacao manual.

Escopo:
- Frontend: frontend/reverso
- Backend relacionado: apps-script/logistica
- Dados relacionados: planilhas operacionais do Reverso

Antes de testar:
- Confirmar que a branch foi mergeada na main.
- Confirmar que o Netlify publicou a versao mais recente.
- Abrir o /reverso em janela anonima ou limpar cache se necessario.
- Testar em desktop e em modo mobile pelo DevTools ou celular real.

1. Teste de carregamento inicial
- Abrir a rota /reverso.
- Confirmar que a tela inicial carrega sem erro visual.
- Confirmar que o loading aparece com mensagem clara.
- Confirmar que nao ha tela branca permanente.
- Confirmar que logos, cards e botoes estao alinhados.

2. Teste de unidade/slug
- Acessar fluxo com slug/codigo de unidade valido.
- Confirmar que a unidade e localizada.
- Confirmar que mensagem de erro aparece se o slug/codigo estiver ausente ou invalido.
- Confirmar que a mensagem nao expoe detalhe tecnico, endpoint ou stack trace.

3. Teste de login ou primeiro acesso
- Informar dados de usuario de teste.
- Confirmar que o loading aparece durante a autenticacao.
- Confirmar que erro de dados invalidos e claro.
- Confirmar que sucesso direciona para a proxima tela esperada.
- Confirmar que o fluxo nao quebra no mobile.

4. Teste de tela inicial do usuario
- Confirmar que status/disponibilidade da unidade carrega.
- Confirmar que botoes principais sao visiveis e tocaveis.
- Confirmar que cards nao ficam apertados em celular.
- Confirmar que estado de erro nao quebra layout.

5. Teste de leitura/validacao de etiqueta
- Testar digitacao manual de codigo de etiqueta.
- Confirmar que campo vazio exibe orientacao clara.
- Confirmar que etiqueta invalida mostra erro compreensivel.
- Confirmar que etiqueta valida segue para o fluxo correto.
- Confirmar que o loading de validacao aparece e some corretamente.

6. Teste de camera/QR, quando aplicavel
- Acionar leitura por camera em celular ou navegador permitido.
- Confirmar mensagem quando a camera nao for autorizada.
- Confirmar alternativa de digitacao manual.
- Confirmar que a tela nao trava se o leitor QR falhar.

7. Teste de confirmacao de drop-off
- Confirmar que o checklist obrigatorio impede continuar sem marcacao.
- Confirmar que a entrega/drop-off e registrada com loading claro.
- Confirmar que sucesso leva para a tela esperada.
- Confirmar que erro de registro mostra mensagem humana.

8. Teste de historico
- Abrir historico do usuario.
- Confirmar que carrega lista ou estado vazio.
- Confirmar que erro de carregamento nao quebra a tela.
- Confirmar legibilidade em celular.

9. Teste de painel AGF, quando aplicavel
- Abrir painel operacional se o perfil tiver acesso.
- Confirmar que cards de resumo carregam.
- Confirmar que erro de dashboard aparece como estado vazio amigavel.
- Observar tempo de carregamento.

10. Checklist visual mobile
- Botoes com altura confortavel para toque.
- Toast sem cortar texto nas bordas.
- Loading-card centralizado e legivel.
- Inputs sem zoom excessivo no celular.
- Estados vazios com texto legivel.
- Tela de sucesso alinhada.

11. Checklist de seguranca visual
- Nenhum erro deve mostrar URL completa do Web App.
- Nenhum erro deve mostrar ID de planilha.
- Nenhum erro deve mostrar token, chave ou detalhe interno.
- Nenhum log visual deve mostrar CPF, telefone ou e-mail completo sem necessidade.

12. Resultado esperado
- Fluxo principal funciona.
- Mensagens estao claras.
- Mobile esta confortavel.
- Nenhuma regra de negocio foi alterada.
- Nenhuma planilha foi alterada apenas por abrir telas.

Como registrar problema encontrado:
- Tela afetada:
- Passo executado:
- Resultado esperado:
- Resultado obtido:
- Print ou descricao:
- Navegador/dispositivo:
- Horario aproximado:
- Usuario de teste usado, sem dados sensiveis:
