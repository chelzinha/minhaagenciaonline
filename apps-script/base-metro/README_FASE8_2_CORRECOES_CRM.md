# Fase 8.2 — Correções incrementais do CRM

Entrega aditiva e compatível com a Fase 8.1.

## Escopo
- correção do preenchimento de cartão de postagem no formulário de clientes;
- segmentos parametrizáveis em `CRM_SEGMENTOS`;
- campos diagnósticos adicionais no checklist comercial, sem reativar o módulo operacional de coletas;
- suporte ao frontend para drag-and-drop e edição de etapa;
- refinamento de exportação PNG e contenção visual das tabelas no frontend correspondente.

## Setup
Execute uma vez no Apps Script:

```javascript
setupCrmRefinamentoFase82()
```

Depois valide:

```javascript
smokeTestCrmRefinamentoFase82()
```

Resultado esperado: `ok: true`.

## Segmentos parametrizáveis
A aba `CRM_SEGMENTOS` será criada com os cabeçalhos:

```text
SEGMENTO_ID | NOME_EXIBICAO | ATIVO | ORDEM
```

Para acrescentar uma opção ao dropdown, inclua uma nova linha com ID estável, nome, `SIM` e a ordem desejada.
