# Reverso - Coleta

**Module ID:** `reverso-coleta`  
**Rota:** `/reverso-coleta`  
**Frontend:** `frontend/reverso-coleta`  
**Backend:** `apps-script/logistica`  
**Tipo:** interno operacional / coleta  
**Dados sensíveis:** SIM

## Finalidade

Permitir que coletadores/equipe operacional registrem coleta, leitura de etiquetas e movimentações do fluxo reverso.

## UX obrigatória

- prioridade mobile;
- botões grandes;
- leitura rápida de etiqueta;
- feedback imediato;
- erro fácil de resolver;
- operação tolerante a rede móvel instável quando possível.

## Segurança

Validar usuário, unidade/rota e permissão da movimentação no backend. Não aceitar mudança de estado apenas porque a tela expôs um botão.

## Consistência

Mudança de estado e leitura repetida devem ser idempotentes ou detectadas para evitar duplicidade.

## Testes

1. autenticação/permissão;
2. leitura válida;
3. leitura repetida;
4. objeto fora do escopo;
5. falha de rede/retry;
6. feedback de sucesso/erro;
7. mobile real.

## Pendências

- confirmar mecanismo de scanner/leitura;
- documentar estados aceitos antes/depois da coleta;
- confirmar uso de LockService/idempotência.