# Inteligência - Gerencial

**Module ID:** `inteligencia-gerencial`  
**Rota:** `/intra/inteligencia/gerencial`  
**Frontend:** `frontend/intra/inteligencia/gerencial`  
**Tipo:** interno analítico/gestão  
**Autenticação:** AGF_ACCESS confirmado  
**Backend/fontes:** NÃO MAPEADOS integralmente

## Finalidade

Consolidar indicadores gerenciais da operação para leitura rápida e tomada de decisão.

## Regras

- indicadores devem ter fórmula e período documentados;
- cards devem receber dados agregados;
- drill-down somente sob demanda;
- filtros devem ser consistentes entre visões.

## Segurança

Pode exibir dados estratégicos. Acesso deve respeitar perfil e escopo.

## Testes

- permissão;
- filtros/período;
- indicadores com base vazia;
- comparação com fonte;
- grande volume;
- desktop/mobile.

## Pendências

- mapear métricas, backend e planilhas;
- definir frequência de atualização/cache;
- confirmar module_id real.