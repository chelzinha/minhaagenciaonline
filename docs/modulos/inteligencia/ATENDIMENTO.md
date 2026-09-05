# Inteligência - Atendimento

**Module ID:** `inteligencia-atendimento`  
**Rota:** `/intra/inteligencia/atendimento`  
**Frontend:** `frontend/intra/inteligencia/atendimento`  
**Tipo:** interno analítico/atendimento  
**Autenticação:** AGF_ACCESS confirmado  
**Backend/fontes:** NÃO MAPEADOS integralmente

## Finalidade

Apresentar indicadores relacionados ao atendimento e à operação de relacionamento da AGF.

## Regras

- indicadores devem ter definição objetiva;
- dados pessoais não devem ser necessários para cards agregados;
- detalhe individual só deve carregar sob demanda e conforme permissão;
- nomenclaturas devem ser coerentes com Atende/CRM quando houver sobreposição.

## Segurança

Pode envolver dados de clientes e histórico de atendimento. Backend deve validar escopo e minimizar PII.

## Testes

- permissão;
- filtros/período;
- consistência com fonte;
- base vazia;
- grande volume;
- desktop/mobile.

## Pendências

- mapear relação com `/atende` e CRM;
- documentar métricas;
- identificar backend e planilhas.