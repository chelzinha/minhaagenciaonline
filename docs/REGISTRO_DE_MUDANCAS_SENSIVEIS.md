# REGISTRO_DE_MUDANCAS_SENSIVEIS

Documento tecnico em preparacao.

## 2026-06-16 - Versionamento inicial dos Apps Script

Mudanca sensivel registrada: os Apps Script do projeto foram adicionados ao repositorio GitHub.

Risco: exposicao acidental de identificadores, credenciais, tokens, URLs ou dados operacionais.

Controle aplicado: arquivos .clasp.json ignorados via .gitignore e verificacao inicial por termos sensiveis antes do commit.

Commit relacionado: badf763.

## 2026-06-16 - Backend Atende / Correios Atende

Mudanca sensivel registrada: criada estrutura Apps Script para importar JSONs do Correios Atende, armazenar RAWs e alimentar a aba `Postagens`.

Risco: os JSONs podem conter dados pessoais de remetente/destinatario, documentos, telefones, enderecos, contratos, cartao de postagem e informacoes operacionais.

Controles aplicados:
- `INGEST_TOKEN` e `SPREADSHEET_ID` via `PropertiesService`.
- `doPost` protegido por token.
- Logs sem payload completo.
- Mascara de CPF, CNPJ e telefone em logs de erro.
- Abas RAW separadas para preservar evidencias sem misturar com logs resumidos.
- Uso de `LockService` em importacoes para reduzir risco de escrita concorrente.
