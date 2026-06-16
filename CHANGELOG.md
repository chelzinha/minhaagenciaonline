# Changelog

Todas as mudancas relevantes deste projeto serao registradas aqui.

## 2026-06-16

### Criado

- Estrutura inicial do repositorio tecnico minhaagenciaonline.
- Pastas base para frontend, Apps Script, documentacao, previews e releases.
- Primeiro commit tecnico do projeto.
- Frontend atual adicionado ao repositorio GitHub.
- Deploy de producao conectado ao GitHub pela branch main.
- Netlify configurado para publicar a pasta frontend.

### Observacoes

- Antes desta migracao, o site era publicado por deploy manual no Netlify.
- A partir desta etapa, o repositorio GitHub passa a ser a fonte viva do frontend.
- O site www.minhaagenciaonline.com.br foi validado visualmente apos o deploy inicial pelo GitHub.

## 2026-06-16 - Apps Script do projeto

- Adicionados ao repositorio os Apps Script vinculados ao projeto minhaagenciaonline.
- Criado .gitignore para impedir versionamento de arquivos .clasp.json.
- Realizada verificacao inicial para evitar envio de segredos reais.
- Commit relacionado: badf763.

## Auditoria tecnica - Modulo Reverso

- Documentada auditoria inicial do modulo Reverso.
- Mapeadas telas do frontend, camada API, Apps Script, dados, planilhas, riscos e melhorias futuras.
- Consolidados pontos principais em APPS_SCRIPT, PLANILHAS_E_DADOS, PERFORMANCE e SEGURANCA_E_DADOS.
- Nenhuma alteracao funcional aplicada nesta etapa.

## Melhoria UX - mensagens do Reverso

- Ajustadas mensagens de loading e erro no frontend do modulo Reverso.
- Melhoradas mensagens de autenticacao, validacao de etiqueta, servidor e carregamento de unidade.
- Nenhuma regra de negocio, endpoint, planilha ou Apps Script foi alterado.

## Melhoria UI - mobile Reverso

- Ajustados botoes, loading, toast e estado vazio no frontend do modulo Reverso.
- Melhoria restrita a CSS, sem alteracao de backend, API, planilhas ou regras de negocio.
