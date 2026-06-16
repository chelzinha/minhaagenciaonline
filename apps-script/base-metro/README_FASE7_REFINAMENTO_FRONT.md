# Fase 7 — Refinamento UX/UI do CRM

## Objetivo
Adicionar suporte seguro ao refinamento visual do módulo `/crm/`, restaurar o Checklist Correios no modal dos cards e manter todas as rotas anteriores ativas.

## Alterações backend
- Nova rota GET `get_entity_checklists_v7`.
- Nova função `setupCrmRefinamentoFase7()` para acrescentar cabeçalhos aditivos em `CRM_VISITA_CHECKLIST`.
- Nova função `smokeTestCrmRefinamentoFase7()`.
- Idempotência opcional no salvamento de checklist por `REQUEST_ID`.
- Auditoria complementar via `CRM_EVENTOS` quando disponível.

## Implantação
1. Faça backup do projeto Apps Script atual.
2. Substitua os arquivos pelo pacote completo da Fase 7.
3. Execute `setupCrmRefinamentoFase7()`.
4. Execute `smokeTestCrmRefinamentoFase7()` e confirme `ok: true`.
5. Publique nova versão mantendo a mesma URL `/exec`.
6. Publique o frontend completo da Fase 7 no Netlify.

## Reversão
Reimplante a versão anterior do Web App e o frontend anterior. Os cabeçalhos adicionados são inofensivos para versões anteriores.
