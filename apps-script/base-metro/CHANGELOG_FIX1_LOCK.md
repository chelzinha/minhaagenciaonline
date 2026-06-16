# Fase 2 — Fix 1: lock em projeto Apps Script independente

Correção aplicada em `op_withDocumentLock_()`.

Quando o projeto Apps Script não está vinculado diretamente a uma planilha, `LockService.getDocumentLock()` retorna `null`. O helper agora utiliza `LockService.getScriptLock()` como fallback, preservando proteção contra concorrência.

Nenhuma regra de negócio foi alterada.
