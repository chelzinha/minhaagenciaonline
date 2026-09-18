# DEPLOY

## 1. Objetivo

Este documento registra o fluxo oficial de publicação do projeto `minhaagenciaonline`.

Ele deve ser tratado como a referência canônica para evitar que configurações históricas de hospedagem sejam confundidas com o ambiente atual de produção.

## 2. Estado atual da produção

A Plataforma Digital AGF usa atualmente:

- **Git/GitHub** como fonte oficial do código;
- **branch `main`** como branch de produção;
- **Cloudflare** como hospedagem oficial do frontend principal;
- **Cloudflare Pages** para publicação do conteúdo estático da pasta `frontend`;
- **Cloudflare Workers** para APIs e wrappers que usam Worker;
- **Cloudflare D1** para os bancos dos módulos que já foram migrados para D1;
- **Google Apps Script** como backend complementar dos módulos que ainda dependem dele.

Domínio principal:

```text
www.minhaagenciaonline.com.br
```

Diretório principal do frontend:

```text
frontend/
```

## 3. Regra obrigatória de hospedagem

Para a plataforma principal:

```text
PRODUÇÃO DO FRONTEND = CLOUDFLARE
```

**Netlify não é o destino de deploy da plataforma principal.**

Arquivos como `netlify.toml`, referências históricas em changelogs ou um status de integração como `netlify/agfjb/deploy-preview` não devem ser interpretados como indicação do ambiente atual de produção.

Esses vestígios podem existir por três motivos:

1. histórico de uma hospedagem anterior;
2. configuração ainda conectada a um projeto antigo;
3. projetos isolados que continuam usando Netlify fora do frontend principal.

Antes de qualquer deploy, a hospedagem atual deve ser confirmada por esta documentação e pela configuração efetiva do Cloudflare.

## 4. Exceções isoladas

Alguns projetos ou rotas podem continuar apontando para aplicações independentes hospedadas fora do Cloudflare principal.

Exemplos documentados no repositório incluem redirecionamentos para projetos isolados de DC-e ou Logística Reversa.

Essas exceções:

- não transformam Netlify em hospedagem principal;
- não autorizam deploy do diretório `frontend` principal no Netlify;
- devem ser tratadas projeto a projeto.

## 5. Fluxo oficial de publicação do frontend

Fluxo esperado:

```text
alteração controlada
-> branch de trabalho
-> validação
-> pull request
-> merge em main
-> deploy no Cloudflare Pages
-> validação pós-deploy
-> documentação/registro
```

### Regra de segurança

Não inventar nome de projeto Cloudflare, Account ID, Project Name ou comando de produção.

Quando o nome real do projeto Pages não estiver documentado ou confirmado no ambiente autenticado, primeiro descobrir/confirmar a configuração e somente depois executar o deploy.

Exemplo de comando, **somente depois de confirmar o project name real**:

```powershell
npx wrangler pages deploy frontend --project-name <PROJECT_NAME_CONFIRMADO>
```

Se o projeto estiver configurado para deploy automático pelo GitHub no Cloudflare Pages, validar o deployment gerado pela `main` em vez de disparar um segundo deploy manual desnecessário.

## 6. Publicação por tipo de alteração

### Somente frontend estático

Publicar no **Cloudflare Pages**.

Exemplos:

- `frontend/agf`;
- `frontend/atende`;
- CSS compartilhado;
- manifest;
- service worker;
- shell visual.

### Google Apps Script

Usar o projeto Apps Script correto:

```text
clasp push
clasp deploy -i <deploymentId-existente>
```

Nunca inventar ou trocar o deployment ID de produção.

### Cloudflare Worker

Executar a partir da pasta do Worker correspondente.

No módulo técnico Atende/Visão 360:

```text
cloudflare/atende-api
```

Publicação:

```powershell
npx wrangler deploy
```

Quando houver ambientes separados, declarar explicitamente o ambiente correto.

### Cloudflare D1

Aplicar migrations somente quando a alteração realmente exigir schema novo.

Sempre validar a base alvo antes de executar migration remota.

## 7. Visão 360

O nome público atual do módulo é:

```text
Visão 360
```

Por segurança de regressão, permanecem técnicos:

```text
rota: /atende/
app key: atende
apps-script/atende/
ATENDE_*
agf-atende-api
tabelas atende_*
```

Troca de nome visual não autoriza renomear essas estruturas técnicas.

## 8. Checklist pós-deploy do frontend

Validar pelo menos:

1. domínio principal responde;
2. Portal AGF abre;
3. CSS e assets carregam;
4. autenticação continua funcionando;
5. módulo alterado abre sem erro;
6. service worker não mantém versão obsoleta;
7. desktop e mobile continuam utilizáveis;
8. rotas protegidas continuam protegidas;
9. nenhum dado sensível foi exposto;
10. Git local e `origin/main` permanecem sincronizados.

## 9. Histórico do Netlify

O repositório contém documentação histórica de uma fase em que o site foi publicado via Netlify e integrado ao GitHub.

Esse registro deve ser preservado apenas como histórico.

A partir do estado arquitetural atual:

```text
Cloudflare = produção da plataforma principal
Netlify = histórico, legado ou projeto isolado quando explicitamente documentado
```

Nenhum status automático do Netlify deve substituir essa regra de verdade documental.
