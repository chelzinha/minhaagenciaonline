# Acesso AGF

**Module ID:** `agf`  
**Tipo:** interno / acesso e utilitários  
**Rota:** `/agf`  
**Frontend:** `frontend/agf`  
**Backend provável:** autenticação + atende  
**Dados sensíveis:** depende da tela

## 1. Finalidade

Área interna histórica/operacional da AGF. A home pública ainda aponta para `/agf/` como “Acesso interno”, mas a arquitetura atual também define `/intra` como hub interno principal.

## 2. Situação arquitetural

Existe risco de sobreposição de responsabilidade entre `/agf` e `/intra`.

A documentação deve tratar esta relação como **NÃO CONFIRMADA** até decidir:

- `/agf` permanece como portal interno oficial;
- `/agf` é acesso legado/atalho;
- `/agf` redirecionará para `/intra`;
- ambos terão papéis distintos.

## 3. Evidências

O repositório possui `frontend/agf`, incluindo biblioteca de ícones em `/agf/icones` com autenticação compartilhada.

## 4. Segurança

Qualquer rota interna deve usar autenticação AGF e autorização de backend quando acessar dados/ações sensíveis.

## 5. UX/UI

Se `/agf` permanecer ativo, deve adotar o mesmo shell, avatar, logout, navegação e tokens visuais de `/intra` para evitar duas experiências internas divergentes.

## 6. Testes mínimos

- acesso a partir da home pública;
- login e logout;
- rotas internas;
- bloqueio sem permissão;
- navegação para `/intra` quando aplicável;
- mobile/desktop.

## 7. Pendências

- definir papel oficial de `/agf` x `/intra`;
- inventariar subrotas ativas;
- mapear backend e permissões;
- classificar como M0-M5 após decisão arquitetural.