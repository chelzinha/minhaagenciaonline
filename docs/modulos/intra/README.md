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
- indicação de ambiente fora de produção.

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

## 4. Submódulos e atalhos confirmados

Há rotas em `/intra/sla` e `/intra/inteligencia`, além de módulos de Inteligência especializados.

O card **Caixa** aparece na home `/intra`, mas não representa um submódulo em `/intra/caixa`.

A regra vigente é:

```text
/intra
  ↓ card Caixa
/caixa/
```

A antiga implementação `/intra/caixa/` foi removida definitivamente em 05/09/2026. O link do card deve permanecer absoluto como `/caixa/`.

## 5. UX/UI

É a referência oficial para consistência visual interna. Novos módulos não devem criar header, logout, avatar ou padrões de card isolados sem necessidade.

Cards que apontam para módulos fora do namespace `/intra/` devem usar URL absoluta para evitar criação acidental de rotas relativas inexistentes.

## 6. Performance e service worker

A home deve carregar apenas catálogo/permissões e informações necessárias para navegação. Não deve pré-carregar bases pesadas de todos os módulos.

O service worker de `/intra` deve pré-cachear somente rotas válidas do próprio portal. Na remoção do Caixa legado, `/intra/caixa/` foi retirado do `PRECACHE_URLS` e a versão do cache foi incrementada.

## 7. Testes mínimos

- login;
- cards visíveis por permissão;
- bloqueio de módulo não autorizado;
- navegação e retorno;
- card Caixa abrindo `/caixa/`;
- ausência da rota `/intra/caixa/`;
- logout;
- mobile/desktop;
- usuário sem módulos liberados;
- falha de sessão.

## 8. Pendências

- inventariar catálogo completo de cards/rotas atuais;
- documentar fonte de permissões e Apps liberados;
- confirmar se `/agf` ainda é entrada paralela ou deve convergir para `/intra`;
- classificar visualmente todos os módulos internos contra este padrão.