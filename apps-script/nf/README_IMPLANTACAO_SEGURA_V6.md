# Extrator NF-e externo v6 — implantação segura

## Atualização recomendada em ambiente já configurado

Use o ZIP de patch que preserva o seu `00_NFE_CFG.js`. Assim a URL `AUTH.MAIN_APP_GAS_URL` já configurada não é sobrescrita.

## Atualização completa

Ao substituir o projeto inteiro, revise obrigatoriamente em `00_NFE_CFG.js`:

```js
AUTH: {
  MAIN_APP_GAS_URL: 'URL_DO_BACKEND_PRINCIPAL_TERMINANDO_EM_EXEC',
  ALLOW_WITHOUT_AUTH_WHEN_UNCONFIGURED: false
}
```

## Novo escopo

O módulo de auditoria cria uma planilha no Drive na primeira amostra registrada. O manifesto passou a exigir:

```txt
https://www.googleapis.com/auth/spreadsheets
```

Autorize o novo escopo quando solicitado e publique uma nova versão do Web App.
