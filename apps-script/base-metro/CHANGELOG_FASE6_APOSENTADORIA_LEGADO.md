# Changelog — Fase 6: aposentadoria do CRM legado

## Objetivo
Desativar de forma reversível o menu/sidebar CRM Lateral antigo da planilha principal, preservando o novo módulo `/crm/` como experiência oficial.

## Alterações
- Novo arquivo `08_CRM_APOSENTADORIA_LEGADO_FASE6.js`.
- Flag `CRM_LATERAL_SIDEBAR_ENABLED` em Script Properties.
- Preview, aposentadoria, auditoria, status e restauração do sidebar antigo.
- Remoção seletiva de triggers instaláveis relacionados ao sidebar legado.
- Guardas em `25_CRM_LATERAL.js` para bloquear reabertura quando aposentado.

## Compatibilidade
- Nenhuma rota web foi removida do backend principal.
- Nenhuma aba é apagada.
- A reversão usa `restaurarCrmLateralFase6()`.
