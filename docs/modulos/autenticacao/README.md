# Autenticação AGF

**Module ID:** `autenticacao`  
**Tipo:** técnico compartilhado  
**Frontend compartilhado:** `frontend/shared/auth`  
**Backend:** `apps-script/autenticacao`  
**Dados sensíveis:** SIM

## 1. Finalidade

Centralizar login, sessão, identificação do usuário, autorização por perfil/módulo e route guard dos módulos internos.

## 2. Componentes confirmados

- `frontend/shared/auth/agf-auth-config.js`
- `frontend/shared/auth/agf-auth-client.js`
- `frontend/shared/auth/agf-route-guard.js`
- declarações `window.AGF_ACCESS` nas páginas protegidas.

O route guard aceita `roles` e `app`. O cliente compartilhado possui lógica de verificação de roles/apps documentada no repositório.

## 3. Regra de autorização

```text
Frontend pode ocultar/bloquear UI
+
Backend deve validar autorização real
```

A URL do Web App nunca deve ser tratada como segredo.

Para action sensível, validar:

- sessão;
- usuário;
- perfil;
- módulo/app;
- unidade/escopo;
- ownership quando aplicável;
- permissão de escrita/exclusão/exportação.

## 4. Segurança

**Atenção sensível máxima.** Não registrar tokens de sessão, secrets, senhas ou dados pessoais em logs. Sessões devem ter TTL e falhar de forma segura.

## 5. Dependências

Consumido por módulos como SLA, Atende, Reverso Admin/Expedição, Inteligência e outras páginas internas.

## 6. Testes mínimos

- login válido/inválido;
- sessão expirada;
- role permitida/bloqueada;
- app permitido/bloqueado;
- logout;
- chamada direta ao backend sem autorização;
- usuário de unidade diferente;
- mensagens públicas sem stack/secret.

## 7. Pendências

- mapear fonte de usuários/permissões;
- documentar TTL e chaves de sessão sem valores sensíveis;
- inventariar todas as páginas ainda sem `AGF_ACCESS`;
- confirmar se toda action privada valida autorização no servidor.