# Caixa

**Module ID:** `caixa`  
**Tipo:** interno financeiro/operacional  
**Rotas confirmadas no repositório:** `/caixa` e `/intra/caixa`  
**Frontends:** `frontend/caixa` e `frontend/intra/caixa`  
**Backend provável:** `apps-script/caixa`  
**PWA em `/caixa`:** manifest + service worker confirmados  
**Dados sensíveis:** SIM

## 1. Finalidade

Apoiar rotinas de caixa e controles financeiros/operacionais internos da AGF.

## 2. Estrutura confirmada

### Rota `/caixa`

O frontend contém:

- `frontend/caixa/index.html`;
- `frontend/caixa/legacy-index.html`;
- `frontend/caixa/manifest.webmanifest`;
- `frontend/caixa/sw.js`.

A coexistência de `index.html` e `legacy-index.html` indica histórico/transição de versão e exige cuidado para não reintroduzir comportamento antigo por engano.

### Rota `/intra/caixa`

Existe uma implementação própria em `frontend/intra/caixa/index.html`, apresentada pelo hub `/intra` como “Módulo financeiro”. Ela usa o shell visual interno.

## 3. Atenção arquitetural

Hoje existem **duas implementações de frontend para Caixa**. Esta baseline não assume qual é a canônica.

Antes de qualquer consolidação:

1. comparar funções e chamadas de API;
2. identificar qual está publicada/operacional;
3. identificar se uma é legado, preview ou substituta;
4. preservar fluxo funcional;
5. só depois decidir redirecionamento/arquivamento.

## 4. Arquitetura provável

```text
Usuário interno
↓
/caixa ou /intra/caixa
↓
frontend correspondente
↓
apps-script/caixa (vínculo a confirmar por rota)
↓
Planilhas/controles financeiros NÃO MAPEADOS nesta baseline
```

## 5. Segurança

**Atenção sensível máxima.** Valores, lançamentos, saldos e possíveis identificadores de clientes exigem autorização de backend, rastreabilidade e isolamento por perfil/unidade.

## 6. Concorrência

Rotinas de lançamento/baixa/fechamento devem avaliar `LockService`, idempotência e validação de estado antes da escrita.

## 7. UX/UI

A implementação que permanecer canônica deve convergir para shell AGF, avatar, logout, topbar e componentes compartilhados sem reescrever regra funcional.

## 8. Performance

- evitar recarregar histórico financeiro completo;
- usar filtros por período/unidade;
- respostas agregadas para cards;
- cache apenas para leitura segura;
- nenhuma escrita financeira baseada em cache desatualizado.

## 9. Testes mínimos

- autenticação/permissão nas duas rotas;
- comparar funções disponíveis;
- lançamento/consulta/fechamento conforme funções existentes;
- concorrência e dupla submissão;
- estado vazio;
- erro de backend;
- desktop/mobile;
- cache/service worker em `/caixa`;
- comparação com `legacy-index.html` somente quando necessária.

## 10. Pendências

- definir rota/frontend canônico;
- mapear actions, planilhas, abas e chaves de cada implementação;
- confirmar autenticação AGF;
- classificar cada implementação M0-M5;
- definir política de remoção futura do legado apenas após comprovar ausência de dependências.