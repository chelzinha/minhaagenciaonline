# AGENTS.md - Minha Agencia Online

## Projeto

Plataforma Digital AGF Jose Bonifacio.

## Regra principal

Preservar o que ja funciona, evitar regressao e documentar toda mudanca tecnica relevante.

## Estrutura

- frontend/
- apps-script/
- docs/
- previews/
- releases/

## Documentacao obrigatoria

Toda alteracao deve avaliar impacto em:

1. CHANGELOG.md
2. README.md
3. docs/FRONTEND.md
4. docs/APPS_SCRIPT.md
5. docs/PLANILHAS_E_DADOS.md
6. docs/PERFORMANCE.md
7. docs/SEGURANCA_E_DADOS.md
8. docs/REGISTRO_DE_MUDANCAS_SENSIVEIS.md

## Dados sensiveis

Nunca expor tokens, senhas, chaves, credenciais, CPF, CNPJ, telefone, e-mail ou dados pessoais sem necessidade tecnica.

## UX/UI

Toda tela deve ser limpa, responsiva, profissional, clara e adequada para mobile.

## Performance

Evitar carregamento pesado de planilhas no frontend. Priorizar cache, paginacao, dados resumidos e carregamento progressivo.

## Commit

Usar mensagens claras:

- feat:
- fix:
- ui:
- docs:
- refactor:
- perf:
- security:
- chore:
- deploy:
