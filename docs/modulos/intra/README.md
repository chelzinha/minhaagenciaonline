# Portal Interno AGF

**Module ID:** `intra`  
**Tipo:** interno / shell e hub operacional  
**Rota:** `/intra`  
**Frontend:** `frontend/intra`  
**Backend:** compartilhado entre módulos internos  
**Autenticação:** AGF compartilhada  
**Dados sensíveis:** depende do módulo acessado

## 1. Finalidade

Ser a home operacional da Plataforma AGF para usuários internos, centralizando navegação, permissões e identidade visual dos módulos.

## 2. Papel arquitetural

`/intra` é referência de shell visual e navegação. Módulos internos devem convergir para:

- topbar/cabeçalho padrão;
- identificação do usuário/avatar;
- botão sair padronizado;
- cards e navegação por permissão;
- retorno consistente para a home interna;
- indication de ambiente fora de produção.

## 3. Permissões

O acesso deve obedecer:

```text
usuário autenticado
+
perfil autorizado
+
módulo liberado
=
acesso permitido
```

O backend continua responsável por validar autorização real das actions sensíveis.

## 4. Submódulos confirmados

Há rotas em `/intra/sla` e `/intra/inteligencia`, além de módulos de Inteligência especializados.

## 5. UX/UI

É a referência oficial para consistência visual interna. Novos módulos não devem criar header, logout, avatar ou padrões de card isolados sem necessidade.

## 6. Performance

A home deve carregar apenas catálogo/permissões e informações necessárias para navegação. Não deve pré-carregar bases pesadas de todos os módulos.

## 7. Testes mínimos

- login;
- cards visíveis por permissão;
- bloqueio de módulo não autorizado;
- navegação e retorno;
- logout;
- mobile/desktop;
- usuário sem módulos liberados;
- falha de sessão.

## 8. Pendências

- inventariar catálogo completo de cards/rotas atuais;
- documentar fonte de permissões e Apps liberados;
- confirmar se `/agf` ainda é entrada paralela ou deve convergir para `/intra`;
- classificar visualmente todos os módulos internos contra este padrão.