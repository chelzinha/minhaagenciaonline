# Reverso - Expedição

**Module ID:** `reverso-expedicao`  
**Rota:** `/reverso-expedicao`  
**Frontend:** `frontend/reverso-expedicao`  
**Backend:** `apps-script/logistica`  
**Tipo:** interno operacional / expedição  
**Autenticação:** AGF_ACCESS confirmado  
**Dados sensíveis:** SIM

## Finalidade

Organizar a etapa de expedição, fechamento, comunicação e rastreio dos pacotes recebidos no fluxo reverso.

## Segurança

Validar no backend sessão, perfil, módulo e estado atual do pacote antes de aceitar transição ou fechamento.

## Consistência

Evitar duplicidade de expedição e alterações concorrentes de estado. Operações críticas devem considerar idempotência e `LockService`.

## UX

Organização por status, consulta rápida, ações claras, confirmação para mudanças irreversíveis e shell AGF padronizado.

## Testes

1. autenticação/permissão;
2. lista por status;
3. transição válida/inválida;
4. dupla submissão;
5. rastreio/comunicação quando aplicável;
6. erro de backend;
7. desktop/mobile.

## Pendências

- mapear actions e estados do fluxo;
- mapear integrações de rastreio/comunicação;
- confirmar logs e auditoria de movimentações;
- classificar M0-M5.