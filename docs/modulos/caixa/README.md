# Caixa

**Module ID:** `caixa`  
**Tipo:** interno financeiro/operacional  
**Rota oficial:** `/caixa`  
**Frontend oficial:** `frontend/caixa`  
**Backend provável:** `apps-script/caixa`  
**PWA:** manifest + service worker confirmados em `/caixa`  
**Dados sensíveis:** SIM

## 1. Finalidade

Apoiar rotinas de caixa e controles financeiros/operacionais internos da AGF.

## 2. Decisão arquitetural vigente

Em 05/09/2026 foi definido que o Caixa oficial da Plataforma AGF é exclusivamente:

- rota: `/caixa/`;
- frontend: `frontend/caixa/`.

A antiga implementação `/intra/caixa/` foi classificada como legado sem uso e removida definitivamente da `main`.

Não existe política de compatibilidade ou redirecionamento para `/intra/caixa/`.

O card Caixa exibido no hub `/intra/` deve apontar diretamente para `/caixa/`.

## 3. Estrutura confirmada do frontend oficial

O frontend oficial contém:

- `frontend/caixa/index.html`;
- `frontend/caixa/legacy-index.html`;
- `frontend/caixa/manifest.webmanifest`;
- `frontend/caixa/sw.js`.

A coexistência de `index.html` e `legacy-index.html` indica histórico/transição interna dentro do próprio módulo `/caixa`. O arquivo `legacy-index.html` não deve ser confundido com a antiga rota `/intra/caixa/`, que já foi eliminada.

## 4. Arquitetura atual

```text
Usuário interno
↓
/caixa/
↓
frontend/caixa
↓
apps-script/caixa (vínculo detalhado ainda a confirmar)
↓
Planilhas/controles financeiros NÃO MAPEADOS nesta baseline
```

## 5. Autenticação e autorização

A configuração central `apps-script/autenticacao/00_CFG.js` registra o app `caixa` com:

- path `/caixa/`;
- módulo protegido;
- roles `admin`, `manager` e `user`.

Isso reforça `/caixa/` como rota oficial do módulo.

## 6. Segurança

**Atenção sensível máxima.** Valores, lançamentos, saldos e possíveis identificadores de clientes exigem autorização de backend, rastreabilidade e isolamento por perfil/unidade.

## 7. Concorrência

Rotinas de lançamento, baixa, sangria e fechamento devem avaliar `LockService`, idempotência e validação de estado antes da escrita.

## 8. UX/UI

O módulo oficial deve permanecer integrado à identidade visual AGF e aos componentes compartilhados sem reescrever regras financeiras funcionais.

O acesso ao Caixa a partir de outros hubs ou menus deve sempre usar URL absoluta `/caixa/` para evitar recriação acidental de caminhos relativos dentro de `/intra/`.

## 9. Performance e PWA

- evitar recarregar histórico financeiro completo;
- usar filtros por período/unidade;
- usar respostas agregadas para cards;
- cache apenas para leitura segura;
- nenhuma escrita financeira baseada em cache desatualizado;
- ao alterar rotas pré-cacheadas, incrementar a versão do service worker correspondente.

Na remoção de `/intra/caixa/`, a referência antiga foi retirada do service worker de `/intra` e a versão do cache foi incrementada para descartar o conteúdo legado em clientes existentes.

## 10. Testes mínimos

- autenticação e permissão em `/caixa/`;
- acesso direto pelo portal `/agf/`;
- acesso pelo card Caixa de `/intra/`;
- confirmar ausência de `/intra/caixa/`;
- lançamento/consulta/fechamento conforme funções existentes;
- concorrência e dupla submissão;
- estado vazio;
- erro de backend;
- desktop/mobile;
- cache/service worker do módulo;
- comparação com `legacy-index.html` somente quando necessária.

## 11. Pendências

- mapear actions do frontend oficial;
- mapear planilhas, abas, chaves e schemas do Caixa;
- confirmar integralmente frontend -> action -> Apps Script -> planilha;
- validar regras de permissão por unidade quando aplicável;
- classificar o módulo oficial em M0-M5;
- avaliar futuramente se `frontend/caixa/legacy-index.html` ainda precisa permanecer, sem relação com a antiga rota `/intra/caixa/`.