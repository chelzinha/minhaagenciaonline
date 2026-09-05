# Inteligência - Comercial

**Module ID:** `inteligencia-comercial`  
**Rota:** `/intra/inteligencia/comercial`  
**Frontend:** `frontend/intra/inteligencia/comercial`  
**Tipo:** interno analítico/comercial  
**Autenticação:** AGF_ACCESS confirmado  
**Backend/fontes:** NÃO MAPEADOS integralmente

## Finalidade

Apoiar acompanhamento comercial por meio de indicadores, carteira, atividade e desempenho de clientes/prospects quando aplicável.

## Regras

- usar dados agregados para cards;
- preservar filtros de unidade/responsável;
- detalhar registros somente sob demanda;
- alinhar conceitos com o CRM para evitar métricas com definições diferentes.

## Segurança

Pode conter dados de clientes/prospects e informações estratégicas. Backend deve validar escopo.

## Testes

- permissão;
- filtros;
- indicadores;
- consistência com CRM/base fonte;
- período vazio;
- mobile/desktop.

## Pendências

- mapear relação com CRM/base-metro;
- documentar fórmulas e nomenclaturas;
- confirmar cache e frequência de atualização.