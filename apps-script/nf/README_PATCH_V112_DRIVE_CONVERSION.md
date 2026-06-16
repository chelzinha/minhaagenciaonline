# Patch v1.1.2 — conversão PDF sem regressão

## Erro corrigido

`OCR is not supported for files of type application/vnd.google-apps.document`

## Causa

O conversor enviava `mimeType: application/vnd.google-apps.document` no metadata ao mesmo tempo em que solicitava OCR. O Drive passou a rejeitar essa combinação.

## Correção

- DANFE eletrônico: conversão para Google Docs sem OCR primeiro.
- PDF escaneado: OCR somente como fallback.
- Metadata de inserção sem `mimeType` forçado.
- Mantidos todos os ajustes do parser DANFE 10x15 v1.1.1.
