# Caixa

**Module ID:** `caixa`  
**Tipo:** interno financeiro/operacional  
**Rota:** `/caixa`  
**Frontend:** `frontend/caixa`  
**Backend:** `apps-script/caixa`  
**PWA:** manifest + service worker confirmados  
**Dados sensíveis:** SIM

## 1. Finalidade

Apoiar rotinas de caixa e controles financeiros/operacionais internos da AGF.

## 2. Estrutura confirmada

O frontend contém:

- `frontend/caixa/index.html` - versão atual;
- `frontend/caixa/legacy-index.html` - versão legada preservada;
- `frontend/caixa/manifest.webmanifest`;
- `frontend/caixa/sw.js`.

A coexistência de `index.html` e `legacy-index.html` indica transição de versão e exige cuidado para não reintroduzir comportamento antigo por engano.

## 3. Arquitetura

```text
Usuário interno
↓
/caixa
↓
frontend PWA
↓
apps-script/caixa
↓
Planilhas/controles financeiros NÃO MAPEADOS nesta baseline
```

## 4. Segurança

**Atenção sensível máxima.** Valores, lançamentos, saldos e possíveis identificadores de clientes exigem autorização de backend, rastreabilidade e isolamento por perfil/unidade.

## 5. Concorrência

Rotinas de lançamento/baixa/fechamento devem avaliar `LockService`, idempotência e validação de estado antes da escrita.

## 6. UX/UI

O módulo já foi identificado no contexto arquitetural como candidato a padronização visual. Deve convergir para shell AGF, avatar, logout, topbar e componentes compartilhados sem reescrever regra funcional.

## 7. Performance

- evitar recarregar histórico financeiro completo;
- usar filtros por período/unidade;
- respostas agregadas para cards;
- cache apenas para leitura segura;
- nenhuma escrita financeira baseada em cache desatualizado.

## 8. Testes mínimos

- autenticação/permissão;
- abertura PWA sem cache antigo;
- lançamento/consulta/fechamento conforme funções existentes;
- concorrência e dupla submissão;
- estado vazio;
- erro de backend;
- desktop/mobile;
- comparação com comportamento legado quando necessário.

## 9. Pendências

- mapear actions, planilhas, abas e chaves;
- confirmar se autenticação AGF já está integrada;
- classificar M1/M2 após auditoria visual/técnica;
- definir política de remoção futura do `legacy-index.html` somente após comprovar ausência de dependências.