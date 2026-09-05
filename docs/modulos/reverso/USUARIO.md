# Reverso - Usuário

**Module ID:** `reverso`  
**Rota:** `/reverso`  
**Frontend:** `frontend/reverso`  
**Backend:** `apps-script/logistica`  
**Tipo:** cliente/usuário externo  
**Dados sensíveis:** SIM

## Finalidade

Permitir primeiro acesso/login, identificação da devolução, consulta e entrega do pacote conforme o fluxo da AGF.

## UX obrigatória

- mobile-first;
- CPF/telefone com máscara quando usados;
- leitura/QR/etiqueta clara;
- mensagens humanas;
- loading e erro orientativos;
- sem zoom indevido em inputs;
- logo/unidade proporcionais.

## Segurança

Validar dados no backend e evitar exposição de CPF, telefone, endereço e rastreio em logs.

## Testes

1. primeiro acesso;
2. login;
3. etiqueta válida/inválida;
4. leitura manual/QR quando aplicável;
5. histórico;
6. estado vazio;
7. falha de rede;
8. mobile.

## Pendências

- mapear actions específicas desta experiência;
- documentar estados possíveis da devolução;
- confirmar política de sessão e recuperação de acesso.