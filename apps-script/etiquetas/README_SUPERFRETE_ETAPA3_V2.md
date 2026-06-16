# AGF SuperFrete — Etapa 3 v2

Correção pontual da emissão administrativa simulada.

## Correção

- Corrigido o destino do registro da DC-e/DACE simulada.
- Antes: `SF.SHEETS.DCE_DOCS` (constante inexistente, gerava erro `Aba SuperFrete não encontrada: undefined`).
- Agora: `SF.SHEETS.DCE_DOCUMENTOS` → aba `SF_DCE_DOCUMENTOS`.

## Arquivo alterado

- `38_SF_EMISSAO_SIMULADA.js`

Não houve alteração no `/app`, `/balcao`, login, cadastro, conta corrente ou frontend.
