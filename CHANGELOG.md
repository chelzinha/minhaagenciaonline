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

## Documentacao - checklist de testes Reverso

- Adicionado checklist manual para validar o modulo /reverso.
- Checklist cobre carregamento inicial, unidade, login, etiqueta, camera, drop-off, historico, painel AGF, mobile e seguranca visual.
- Nenhuma alteracao funcional aplicada.

## 2026-06-16 - Atende Correios Atende

- Criada estrutura modular do backend Apps Script do `/atende`.
- Adicionado `setupInicial()` para criar planilha, abas e cabecalhos automaticamente.
- Preparada importacao dos dois JSONs do Correios Atende: atendimentos/resumo e objetos captados.
- Mantida a aba principal `Postagens` com os campos usados pelo front atual.
- Adicionadas abas RAW, eventos, logs de importacao e erros.
- Preparados `doGet` de consulta por data e `doPost` protegido por `INGEST_TOKEN`.
- Mudanca marcada como ATENCAO SENSIVEL por processar dados pessoais de remetente/destinatario.

## 2026-06-16 - Fix performance Atende

- Corrigido erro "Argument too large: value" apos importacoes do `/atende`.
- `buildImportResponse_` deixou de retornar a tabela completa apos cada importacao.
- Importacoes agora retornam apenas resumo pequeno com criados, atualizados e ignorados.
- `buscarDadosPorData_` passou a usar `CacheService` somente quando houver filtro de data.
- Payloads maiores que 90 KB nao sao salvos no cache.
- Cache do Atende e invalidado apos importacoes.
- O front do Apps Script passou a recarregar a tabela em chamada separada apos uma importacao bem-sucedida.
