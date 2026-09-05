# Inteligência AGF

**Module ID:** `inteligencia`  
**Tipo:** interno gerencial/comercial/operacional  
**Rota base:** `/intra/inteligencia`  
**Frontend:** `frontend/intra/inteligencia`  
**Backend:** múltiplas fontes - NÃO MAPEADO integralmente nesta baseline  
**Autenticação:** AGF_ACCESS confirmado nas páginas revisadas  
**Dados sensíveis:** SIM

## 1. Finalidade

Concentrar visões analíticas da operação AGF dentro do portal interno, separadas por finalidade gerencial e área de negócio.

## 2. Submódulos confirmados no repositório

- `/intra/inteligencia/carteira`
- `/intra/inteligencia/gerencial`
- `/intra/inteligencia/comercial`
- `/intra/inteligencia/financeiro`
- `/intra/inteligencia/atendimento`
- `/intra/inteligencia/operacional`

Esses submódulos devem ser tratados como uma família visual e arquitetural única, mesmo quando consultarem fontes distintas.

## 3. Arquitetura esperada

```text
Usuário interno
↓
/intra/inteligencia
↓
Permissão por módulo/submódulo
↓
Visão analítica específica
↓
Endpoints resumidos
↓
Bases operacionais
```

## 4. Segurança

**Atenção sensível.** Visões financeiras, comerciais, carteira de clientes e indicadores operacionais podem expor dados estratégicos. O backend deve validar perfil e escopo, não apenas a rota.

## 5. Performance

Dashboards devem receber dados agregados/pré-processados. Não carregar bases cruas inteiras para calcular cards e gráficos no navegador.

Priorizar:

- endpoints de resumo;
- cache com TTL adequado;
- filtros server-side;
- lazy load de detalhes;
- histórico sob demanda.

## 6. UX/UI

Todos os submódulos devem usar o mesmo shell, topbar, avatar, logout, cards, filtros, tabelas, estados vazios e feedback de loading/erro.

## 7. Testes mínimos

- permissão por área;
- cards e indicadores;
- filtros;
- período vazio;
- grande volume;
- dados agregados coerentes;
- navegação entre submódulos;
- mobile/desktop.

## 8. Pendências

- mapear backend e planilhas de cada submódulo;
- definir se cada submódulo terá `module_id` próprio no controle de permissões;
- registrar métricas e fórmulas principais;
- classificar cada submódulo M0-M5.