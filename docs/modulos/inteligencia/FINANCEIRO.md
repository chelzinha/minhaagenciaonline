# Inteligência - Financeiro

**Module ID:** `inteligencia-financeiro`  
**Rota:** `/intra/inteligencia/financeiro`  
**Frontend:** `frontend/intra/inteligencia/financeiro`  
**Tipo:** interno analítico/financeiro  
**Autenticação:** AGF_ACCESS confirmado  
**Backend/fontes:** NÃO MAPEADOS integralmente  
**Dados sensíveis:** SIM

## Finalidade

Apresentar indicadores financeiros consolidados para leitura gerencial, sem transformar o frontend em fonte de verdade financeira.

## Regras

- cálculos críticos devem ser feitos/validados na camada de dados/backend;
- cards devem consumir agregados;
- períodos e fórmulas precisam ser explícitos;
- evitar cache inadequado para dados transacionais.

## Segurança

**Atenção sensível.** Restringir acesso por perfil/escopo e evitar exposição de valores detalhados fora da necessidade operacional.

## Testes

- permissão;
- período/filtros;
- totais versus fonte;
- base vazia;
- atualização após mudança de dados;
- desktop/mobile.

## Pendências

- mapear origem dos dados;
- documentar fórmulas/competência;
- definir TTL/cache;
- confirmar relação com módulo Caixa.