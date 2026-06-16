# Patch v1.1.5 — IE emitente e número do barcode de protocolo

## Backend
- Reforça a recuperação da IE do emitente dentro do bloco fiscal estrito anterior a DESTINATÁRIO / REMETENTE.
- Mantém a limpeza da IE opcional do destinatário para descartar horário e texto de pagamento.
- Preserva em `nota.protocoloCodigoBarras` a sequência numérica distinta do protocolo de autorização.

## Frontend correspondente
- Usa nova chave de storage para descartar prévias antigas.
- Mescla fallback de `parsed.emitente` e `parsed.destinatario` quando a prévia simplificada vier incompleta.
- Imprime a sequência numérica do barcode do protocolo abaixo do respectivo código de barras.
