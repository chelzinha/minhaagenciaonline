# SLA

**Module ID:** `sla`  
**Tipo:** interno operacional / análise de entregas  
**Rota:** `/sla`  
**Frontend:** `frontend/sla` e espelho/integração em `/intra/sla`  
**Backend:** `apps-script/sla`  
**Autenticação:** AGF_ACCESS confirmado  
**Dados sensíveis:** SIM

## 1. Finalidade

Apoiar análise de objetos, prazos e desempenho de entregas, com foco operacional e apresentação clara de atrasos/resultados.

## 2. Regras conhecidas

- prazos dos Correios devem considerar dias úteis quando a regra do módulo assim exigir;
- tabelas devem ser compactas e legíveis, evitando scroll horizontal excessivo;
- relatórios/PDFs destinados a clientes devem privilegiar análise objetiva e não misturar objetos fora do escopo definido;
- alterações de cálculo precisam preservar a regra de negócio vigente e ser testadas com datas-limite.

## 3. Arquitetura

```text
Usuário interno
↓
frontend/sla ou /intra/sla
↓
Autenticação AGF
↓
apps-script/sla
↓
Base de objetos/postagens NÃO IDENTIFICADA nesta baseline
```

## 4. Segurança

**Atenção sensível.** Rastreios, destinatários e dados de postagem não devem aparecer em logs desnecessários ou ser expostos fora do escopo do usuário.

## 5. Performance

Filtrar e resumir no backend. Evitar enviar base completa ao navegador para montar apenas indicadores ou uma página curta.

## 6. Testes mínimos

- login/permissão;
- importação/consulta de dados no formato aceito;
- cálculo de dias úteis;
- objetos sem prazo estimado;
- status e filtros;
- relatório/PDF;
- mobile/desktop;
- dados vazios e grande volume.

## 7. Pendências

- documentar schema de entrada e planilha fonte;
- confirmar cálculo oficial de dias úteis implementado hoje;
- mapear actions e contrato de resposta;
- confirmar qual das rotas é canônica e se existe duplicação/legado.