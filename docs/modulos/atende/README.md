# Atende

**Module ID:** `atende`  
**Tipo:** interno operacional  
**Rota:** `/atende`  
**Frontend:** `frontend/atende`  
**Backend:** `apps-script/atende`  
**Autenticação:** AGF_ACCESS confirmado no frontend  
**Dados sensíveis:** SIM

## 1. Finalidade

Apoiar rotinas internas de atendimento e consulta operacional da AGF. O escopo funcional completo precisa ser consolidado a partir do backend e das planilhas.

## 2. Integração com a plataforma

O frontend carrega `agf-ui.css`, cliente de autenticação compartilhado e declara `window.AGF_ACCESS` com `app: "atende"`, confirmando uso do controle por módulo.

## 3. Arquitetura

```text
Usuário interno
↓
Autenticação AGF / route guard
↓
frontend/atende
↓
apps-script/atende
↓
Planilhas/serviços NÃO IDENTIFICADOS nesta baseline
```

## 4. Segurança

**Atenção sensível.** O backend deve validar sessão, perfil, módulo e escopo do dado. Não confiar apenas na route guard do navegador.

## 5. UX/UI

Como módulo interno, deve seguir Barra AGF/shell visual, botão sair, identificação do usuário e padrões compartilhados.

## 6. Performance

Mapear volume de dados carregado na abertura e evitar leituras integrais de planilha sem necessidade.

## 7. Testes mínimos

- login e bloqueio sem permissão;
- abertura da rota;
- principais consultas/ações do módulo;
- estados vazio/erro/loading;
- logout;
- mobile e desktop.

## 8. Pendências

- documentar finalidade detalhada de cada action;
- mapear planilhas, abas, chaves e dados sensíveis;
- confirmar status de produção;
- classificar M0-M5.