# Portal AGF — Fase 1: autenticação e vínculo CRM

## O que foi alterado

Esta entrega acompanha `autenticacao_v5_crm.zip` e prepara o portal para o novo CRM sem publicar ainda o módulo `/crm/`.

### Portal `/agf/`
- O card **Painel interno** foi renomeado para **Gerencial**.
- A descrição foi ajustada para refletir foco financeiro, operacional e quantitativo.
- Os cards agora respeitam a lista individual de aplicativos permitidos para o usuário.

### Administração `/agf/usuarios/`
- Exibe checkboxes para selecionar os aplicativos liberados por usuário.
- Exibe seção opcional **Vínculo com CRM**.
- Permite definir escopo da Agenda e permissões comerciais.
- Inclui botão **Sincronizar responsáveis CRM**.

### Guarda de rotas
- A guarda compartilhada passou a aceitar `app` além de `roles`.
- Rotas protegidas atuais receberam a chave do aplicativo correspondente.
- Usuários sem permissão individual não conseguem entrar digitando a URL diretamente.

### Cache
- Cache PWA do portal incrementado para `agf-portal-v2`.
- Cache da landing incrementado para `agf-landing-v4`.
- Arquivos em `/shared/auth/` passam a ser carregados sem cache pelo service worker raiz.

## O que deliberadamente ainda não foi ativado
- Nenhum card CRM foi inserido no portal.
- Nenhuma rota `/crm/` foi publicada.
- Nenhuma aba do Dashboard Gerencial foi removida.
- Nenhuma funcionalidade antiga foi apagada.

O módulo CRM só deve ficar visível depois de a base canônica e o frontend `/crm/` estarem homologados.

## Implantação
1. Publique primeiro o backend `autenticacao_v5_crm.zip` preservando a URL `/exec` atual.
2. Execute `migrateAgfAuthV5()` no Apps Script.
3. Confira a criação de `APP Total CF + Metro!CRM_RESPONSAVEIS`.
4. Publique este frontend completo no Netlify.
5. Faça logout e login novamente.
6. Abra `/agf/usuarios/` e teste a edição de um usuário.

## Reversão
1. Reimplante a versão anterior do backend AGF_AUTH.
2. Republique o frontend anterior no Netlify.
3. Não é necessário remover as colunas CRM adicionadas ao final da aba `Usuarios`.
4. A aba `CRM_RESPONSAVEIS` pode permanecer sem afetar versões antigas.
