# Patch v1.1.7 — IE do emitente por OCR complementar

## Problema
Alguns DANFEs digitais são convertidos pelo Google Docs com texto suficiente para preencher quase todos os campos, mas a coluna isolada de IE do emitente desaparece da leitura normal. Como o texto total era suficiente, o fallback OCR não era executado.

## Solução
- Mantém a conversão sem OCR como caminho principal.
- Se a IE do emitente continuar ausente, faz uma segunda conversão OCR complementar.
- Consolida apenas campos obrigatórios ausentes, sem sobrescrever dados confiáveis já encontrados.
- Recalcula as validações do DANFE Simplificado depois do merge.

## Configuração
`NFE_CFG.PDF.TRY_OCR_SUPPLEMENT_FOR_MISSING_IE: true`
