# Dashboard Interno

**Module ID:** `dashboard`  
**Tipo:** interno gerencial  
**Rota:** `/intra/dashboard`  
**Frontend:** `frontend/intra/dashboard`  
**Shell:** `frontend/intra/styles/app-shell.css`  
**Backend/fontes:** NÃO MAPEADOS integralmente  
**Dados sensíveis:** SIM, conforme indicadores exibidos

## 1. Finalidade

Oferecer visão gerencial com indicadores dentro do Portal Interno AGF.

## 2. Estrutura confirmada

A página usa o shell visual do `/intra` e possui tabs, filtros, KPIs, gráficos/tabelas e componentes responsivos.

## 3. Arquitetura esperada

```text
Usuário interno
↓
/intra/dashboard
↓
filtros/período
↓
endpoints de resumo
↓
bases operacionais
```

## 4. Performance

Dashboards não devem receber bases cruas completas. Priorizar agregações no backend, cache com TTL explícito e detalhe sob demanda.

## 5. Segurança

Indicadores gerenciais podem ser estratégicos. Backend deve validar perfil e escopo da unidade.

## 6. UX/UI

Deve permanecer aderente ao shell v10 do `/intra`, com tabs responsivas, filtros claros, gráficos sem overflow e estados de loading/erro/vazio.

## 7. Testes mínimos

- acesso autorizado/bloqueado;
- filtros e períodos;
- cards/KPIs;
- gráficos e tabelas;
- base vazia;
- grande volume;
- mobile/desktop.

## 8. Pendências

- mapear fontes, actions e planilhas;
- documentar fórmula de cada KPI;
- confirmar autenticação AGF_ACCESS no arquivo completo;
- definir política de cache e atualização.