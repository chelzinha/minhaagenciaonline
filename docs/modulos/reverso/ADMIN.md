# Reverso - Admin

**Module ID:** `reverso-admin`  
**Rota:** `/reverso-admin`  
**Frontend:** `frontend/reverso-admin`  
**Backend:** `apps-script/logistica`  
**Tipo:** interno administrativo  
**Autenticação:** AGF_ACCESS confirmado  
**Dados sensíveis:** SIM

## Finalidade

Administrar cadastros, unidades, pontos de coleta, etiquetas, status e operação de logística reversa.

## Segurança

O frontend usa autenticação compartilhada, mas toda action administrativa precisa validar sessão, perfil, módulo, unidade e permissão de escrita/exclusão no backend.

## UX

Tabelas rápidas, filtros claros, status visuais, ações seguras e shell AGF padronizado.

## Performance

Paginar listas, evitar base inteira na abertura e carregar detalhe sob demanda.

## Testes

1. acesso autorizado/bloqueado;
2. filtros e pesquisa;
3. alterações de status;
4. cadastro/edição quando aplicável;
5. concorrência/duplicidade;
6. logs sem PII desnecessária;
7. desktop/mobile.

## Pendências

- mapear actions administrativas;
- mapear planilhas e ownership;
- confirmar papéis com exclusão/exportação;
- classificar M0-M5.