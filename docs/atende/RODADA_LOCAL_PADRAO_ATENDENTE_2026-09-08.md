# ATENDE - Local padrão por Atendente

Data: 2026-09-08
Branch: `feat/atende-csv-diario`

## Objetivo

Quando o Remetente/cliente mestre não tiver `local_padrao`, o painel deve usar o `local_padrao` cadastrado para o Atendente da postagem.

A edição manual do Local na própria postagem continua existindo e tem prioridade máxima.

## Ordem de prioridade

1. Local manual da postagem (`atende_postagem_overrides.local_codigo`)
2. Local padrão do Remetente (`atende_clientes.local_padrao`)
3. Local padrão do Atendente (`atende_atendentes.local_padrao`)
4. Vazio

Expressão lógica:

```sql
COALESCE(po.local_codigo, c.local_padrao, a.local_padrao, '')
```

## RAW

Nenhum campo do RAW dos Correios é alterado.

`CPF_MATRICULA_ATENDENTE`, `NOME_REMETENTE` e os demais campos originais continuam imutáveis em `atende_postagens_raw`.

## Banco

Migration:

`cloudflare/atende-api/migrations/0007_local_padrao_atendente.sql`

Adiciona:

```text
atende_atendentes.local_padrao
```

Valores aceitos:

- `AGF`
- `METRO`
- vazio/null

## Worker

O entrypoint passa a ser:

`src/local-defaults-wrapper.js`

Ele preserva a aplicação existente e acrescenta a camada de fallback de Local sem duplicar o painel.

Também amplia `/admin/attendant` para salvar `localPadrao` e `/admin/bootstrap` para devolver `local_padrao` dos atendentes.

## Painel administrativo

O patch:

`tools/atende/patch-atendente-local.ps1`

acrescenta a coluna `Local padrão` em Admin > Atendentes.

Cada código de atendente continua separado e pode ser associado a:

- Sem padrão
- AGF
- METRÔ

## Edição manual no painel

Permanece funcionando por `/admin/bulk-local` e `atende_postagem_overrides`.

Ao escolher um Local manualmente, esse valor prevalece sobre Remetente e Atendente.

Ao voltar para `Padrão`, o override é removido e a postagem volta a obedecer:

`Remetente > Atendente > vazio`.

## Implantação

Antes do Worker:

```powershell
cd C:\AGF-Codex\minhaagenciaonline
git pull origin feat/atende-csv-diario

cd .\cloudflare\atende-api
npx wrangler d1 migrations apply agf-atende --remote
npx wrangler deploy
```

Para habilitar o campo no Admin > Atendentes:

```powershell
cd C:\AGF-Codex\minhaagenciaonline
powershell -ExecutionPolicy Bypass -File .\tools\atende\patch-atendente-local.ps1

cd .\apps-script\atende
clasp push
clasp deploy -i AKfycbwCBAG4gBVHMHh7cHgnIG215RL8m8CbymvsAaHcs4bXhp0RCyPeP_cr6IA5iZtsch_m1g -d "Atende Local padrao por Atendente"
```

## Fora desta rodada

A carga definitiva dos aliases de Remetentes não faz parte desta rodada. Ela será realizada depois que a planilha de nomes comerciais estiver revisada.

A rotina diária do Consolidador/Cadastro Portal também permanece uma dimensão separada e não altera esta hierarquia de Local.
