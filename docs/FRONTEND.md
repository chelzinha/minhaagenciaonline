# FRONTEND

Documento tecnico em preparacao.

## Modulo Reverso - melhoria de mensagens

Tipo de ajuste:
- Melhoria de UX em mensagens de loading, erro e orientacao.

Arquivos afetados:
- frontend/reverso/index.html
- frontend/reverso/js/ui.js
- frontend/reverso/js/screens/*.js
- frontend/reverso/services/api.js

O que mudou:
- Mensagens tecnicas foram suavizadas.
- Loadings ficaram mais claros para o usuario.
- Erros de autenticacao, servidor e etiqueta ficaram mais orientativos.

O que nao mudou:
- Nenhuma regra de negocio.
- Nenhuma action da API.
- Nenhum endpoint.
- Nenhuma planilha.
- Nenhum Apps Script.

Checklist visual:
- Testar login/primeiro acesso.
- Testar leitura manual de etiqueta.
- Testar erro de etiqueta invalida.
- Testar historico.
- Testar tela inicial no mobile.

## Modulo Reverso - revisao visual mobile

Tipo de ajuste:
- Melhoria visual leve em componentes compartilhados do Reverso.

Arquivo afetado:
- frontend/reverso/styles/components.css

O que mudou:
- Botoes ficaram mais confortaveis para toque no mobile.
- Loading-card ganhou largura mais segura em telas pequenas.
- Toast ficou mais legivel em celular.
- Empty-state recebeu ajuste leve de espacamento e leitura.

O que nao mudou:
- Nenhuma regra de negocio.
- Nenhum JavaScript.
- Nenhuma action de API.
- Nenhum Apps Script.
- Nenhuma planilha.

Checklist visual:
- Abrir /reverso em largura mobile.
- Conferir botoes principais.
- Conferir loading.
- Conferir toast de erro/sucesso.
- Conferir estados vazios.
- Conferir se desktop nao perdeu alinhamento.
