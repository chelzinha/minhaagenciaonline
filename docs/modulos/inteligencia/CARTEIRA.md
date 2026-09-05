# Inteligência - Carteira

**Module ID:** `inteligencia-carteira`  
**Rota:** `/intra/inteligencia/carteira`  
**Frontend:** `frontend/intra/inteligencia/carteira`  
**Tipo:** interno analítico  
**Autenticação:** AGF_ACCESS confirmado  
**Backend/fontes:** NÃO MAPEADOS integralmente

## Finalidade

Apresentar visão analítica da carteira de clientes para apoio comercial e gerencial.

## Regras

- cards e listas devem usar dados agregados quando possível;
- detalhes devem carregar sob demanda;
- filtros precisam respeitar unidade/perfil;
- métricas e fórmulas devem ser documentadas antes de qualquer alteração de regra.

## Segurança

Pode conter dados estratégicos e de clientes. Backend deve validar escopo.

## Testes

- permissão;
- filtros;
- período vazio;
- totais e métricas;
- grande volume;
- mobile/desktop.

## Pendências

- mapear backend/planilhas;
- documentar indicadores e fórmulas;
- confirmar module_id usado na autenticação.