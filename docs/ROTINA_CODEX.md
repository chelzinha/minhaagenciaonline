# Rotina Codex - Projeto minhaagenciaonline

## Objetivo

Definir como Rachel deve usar o Codex neste repositorio para trabalhar de forma mais dinamica, com menos comandos manuais e menor risco de regressao.

## Fluxo recomendado

Codex local no VS Code

-> analisa arquivos

-> altera localmente quando autorizado

-> mostra diff

-> Rachel revisa

-> commit apenas depois da revisao

-> push apenas depois da aprovacao

## Modos de uso

### 1. Analise sem alterar

Usar quando Rachel quiser entender uma tela, modulo, bug ou fluxo.

Regras:

* Nao editar arquivos.

* Nao commitar.

* Nao fazer push.

* Entregar resumo, riscos e plano.

### 2. Edicao local segura

Usar para ajustes pequenos em frontend, documentacao, UX ou textos.

Regras:

* Criar mudancas pequenas.

* Atualizar docs proporcionais.

* Mostrar git diff antes de commit.

* Nao fazer push sem autorizacao.

### 3. Preparar commit

Usar depois que Rachel revisar o diff.

Regras:

* Conferir git status.

* Conferir se nao ha arquivos temporarios.

* Conferir se nao ha segredo.

* Criar commit claro.

### 4. Enviar para GitHub

Usar apenas quando Rachel autorizar.

Regras:

* Push somente da branch atual.

* Informar link ou instrucao de Pull Request.

* Nao fazer merge automaticamente.

## Proibido sem autorizacao explicita

* Alterar Apps Script.

* Alterar planilhas.

* Alterar endpoints.

* Alterar actions da API.

* Alterar nomes de abas ou colunas.

* Publicar no Netlify.

* Fazer merge.

* Apagar arquivos.

* Registrar token, senha, chave, URL completa de Web App, ID de planilha ou dado real.

## Documentacao obrigatoria

Quando houver alteracao:

* Atualizar CHANGELOG.md.

* Atualizar docs relacionado ao impacto.

* Atualizar docs/FRONTEND.md se mexer em frontend.

* Atualizar docs/APPS_SCRIPT.md se mexer em Apps Script.

* Atualizar docs/PLANILHAS_E_DADOS.md se envolver dados, abas ou colunas.

* Atualizar docs/PERFORMANCE.md se envolver lentidao, cache ou otimizacao.

* Atualizar docs/SEGURANCA_E_DADOS.md se envolver dados sensiveis, permissao, payload, logs ou credenciais.

## Checklist antes de finalizar

* git status --short revisado.

* git diff --stat revisado.

* Nenhum arquivo temporario.

* Nenhum segredo.

* Nenhuma URL completa sensivel.

* Nenhum dado real de cliente.

* Documentacao atualizada.

* Checklist de teste informado.