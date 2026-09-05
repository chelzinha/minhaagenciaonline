# Logística Interna

**Module ID:** `logistica-interna`  
**Tipo:** interno operacional/analítico  
**Rota:** `/intra/logistica`  
**Frontend:** `frontend/intra/logistica`  
**Backend/fontes:** NÃO MAPEADOS integralmente  
**Dados sensíveis:** SIM, conforme rotas e volumes exibidos

## 1. Finalidade

Apresentar capacidade por janela, rotas e indicadores logísticos para apoio à operação interna.

## 2. Evidências confirmadas

O hub `/intra` descreve o módulo como “Capacidade por janela e rotas”. O frontend possui filtros, KPIs, painéis, heatmap/tabelas e componentes gráficos próprios.

## 3. Distinção importante

Este módulo não deve ser confundido com `apps-script/logistica`, que atende a família de Logística Reversa. O vínculo entre ambos é **NÃO CONFIRMADO**.

## 4. Performance

- dados agregados por janela/rota;
- filtros server-side quando o volume crescer;
- evitar histórico bruto na abertura;
- cache com TTL e invalidação explícitos.

## 5. Segurança

Rotas, capacidade e indicadores operacionais podem ser estratégicos. Validar perfil/unidade no backend.

## 6. UX/UI

Deve convergir ao shell `/intra`, reduzindo CSS duplicado quando houver componentes equivalentes no design system compartilhado.

## 7. Testes mínimos

- permissão;
- filtros;
- KPIs;
- capacidade por janela;
- rotas;
- heatmap/gráficos;
- base vazia;
- mobile/desktop.

## 8. Pendências

- mapear backend, actions e planilhas;
- confirmar se há relação com coleta/reverso;
- documentar fórmulas de capacidade;
- revisar duplicação de CSS frente ao shell compartilhado.