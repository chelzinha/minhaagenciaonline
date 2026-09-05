# CRM AGF

**Module ID:** `crm`  
**Tipo:** interno comercial/gestão  
**Rota:** `/crm`  
**Frontend:** `frontend/crm`  
**Backend principal:** `apps-script/base-metro`  
**Dados sensíveis:** SIM  
**Status de produção:** NÃO CONFIRMADO nesta baseline

## 1. Finalidade

Centralizar visão geral, prospects, clientes, agenda, funil, tratativas e ações comerciais da AGF.

## 2. Estrutura confirmada

Arquivos principais:

- `frontend/crm/index.html`
- `frontend/crm/app.js`
- `frontend/crm/config.js`
- `frontend/crm/styles.css`
- `frontend/crm/acoes/`

O `app.js` é grande e concentra parte relevante da lógica do frontend, o que exige cuidado com regressão e performance.

## 3. Views e carregamento

A documentação atual registra boot por view ativa, com `get_crm_boot_v4`, fallback para v3 e depois fluxo antigo. Home, Prospects, Clientes e Agenda devem renderizar apenas a view ativa; dados detalhados são carregados sob demanda.

O Kanban limita a renderização inicial a blocos de cards para evitar DOM excessivo.

## 4. Performance

É módulo crítico de performance. Regras obrigatórias:

- não carregar base inteira na abertura;
- manter lazy data por view/subview;
- preservar paginação/limites de Kanban;
- evitar `getValue/setValue` em loop no Apps Script;
- logs de performance somente com métricas agregadas, sem dados pessoais.

## 5. Segurança

**Atenção sensível.** Pode conter nomes de clientes/prospects, contatos, histórico comercial e dados operacionais. Backend deve validar sessão, perfil e escopo.

## 6. UX/UI

O CRM é referência visual para outras telas internas. Deve preservar cabeçalhos, tabs, filtros, chips, cards, agenda, responsividade e estados de loading/erro.

## 7. Testes mínimos

- login/permissão;
- Home;
- Prospects e subabas;
- Clientes e subabas;
- Agenda diária/semanal/mensal;
- criação/edição de cadastro;
- Kanban e drag-and-drop;
- filtros;
- boot com v4 e fallback;
- debug de performance sem PII;
- mobile e desktop.

## 8. Pendências

- mapear planilhas/abas do `base-metro` por função;
- mapear actions completas e contratos de resposta;
- confirmar escopos por usuário/unidade;
- revisar modularização futura do `app.js` sem refatoração ampla imediata.