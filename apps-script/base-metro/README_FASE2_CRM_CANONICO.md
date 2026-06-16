# CRM AGF — Fase 2: camada canônica de dados

Pacote aditivo para o projeto Apps Script **APP Total CF + Metro**.

## Objetivo desta fase

Criar a camada canônica em paralelo, preservar os fluxos atuais e preparar a migração segura do cadastro de clientes. Esta fase **não substitui o frontend atual**, **não remove COLETAS**, **não arquiva APP CRM Metrô** e **não instala sincronizações automáticas externas**.

## Ordem segura de execução

1. Faça backup do projeto Apps Script atual e das planilhas `APP Total CF + Metro` e `APP Etiquetas AGF`.
2. Publique este código como nova versão do projeto Apps Script mantendo a mesma URL `/exec`.
3. Execute `setupCrmCanonicoFase2()`.
4. Execute `auditMigracaoClientesFase2()`.
5. Revise a aba `CRM_MIGRACAO_RELATORIO`, especialmente linhas `BLOQUEANTE` e `ATENCAO`.
6. Execute `migrateClientesCadastroFase2()`.
7. Execute `validateMigracaoClientesFase2()`.
8. Execute `previewSyncClientesAppCompatFase2()` e confira o resumo retornado.
9. Somente se o preview estiver correto, execute `syncClientesAppCompatFase2()`.
10. Teste login, cotação e geração de etiqueta nos apps atuais.
11. Execute `auditVisitarLegadoFase2()`.
12. Execute `normalizeVisitarLegadoFase2()` para retirar `VISITAR` do lugar errado e reclassificar mídias legadas.
13. Execute novamente os testes atuais.
14. Somente após homologação, execute `enableCadastroCanonicoOverlayFase2()`.
15. Teste novamente e confira `getStatusCrmCanonicoFase2()`.

## Trava de segurança

Se a auditoria encontrar conflitos estruturais `BLOQUEANTE`, `enableCadastroCanonicoOverlayFase2()` interrompe a ativação.

Após revisar conscientemente os casos e decidir manter a estrutura mesmo assim, a ativação forçada exige chamada explícita:

```javascript
enableCadastroCanonicoOverlayFase2(true)
```

Não use a ativação forçada sem revisar `CRM_MIGRACAO_RELATORIO`.

## Reversão

1. Execute `disableCadastroCanonicoOverlayFase2()`.
2. Reimplante a versão anterior do Apps Script se necessário.
3. Não exclua as novas abas: versões antigas simplesmente as ignoram.

## Funções públicas desta fase

```javascript
setupCrmCanonicoFase2()
auditMigracaoClientesFase2()
migrateClientesCadastroFase2()
validateMigracaoClientesFase2()
previewSyncClientesAppCompatFase2()
syncClientesAppCompatFase2()
auditVisitarLegadoFase2()
normalizeVisitarLegadoFase2()
enableCadastroCanonicoOverlayFase2()
disableCadastroCanonicoOverlayFase2()
getStatusCrmCanonicoFase2()
```

## Observações importantes

- `CLIENTES_CADASTRO` inicia em paralelo e só passa a sobrepor dados cadastrais em `CLIENTES_MASTER` depois da ativação explícita do overlay.
- `APP Etiquetas AGF!CLIENTES_APP` não é apagada nem substituída automaticamente.
- `syncClientesAppCompatFase2()` atualiza a projeção de compatibilidade em uma única direção e preserva linhas legadas não migradas.
- Credenciais ficam isoladas em `CLIENTES_CREDENCIAIS_CWS`, com proteção em modo de aviso.
- `SENHA_APP_LEGACY` permanece temporariamente porque o app atual ainda depende dela. A retirada exige migração posterior da autenticação do app de etiquetas.
- `VISITAR` permanece apenas como tipo de atividade parametrizável (`ATV_VISITA`). As recomendações oficiais do motor continuam: `CONVERTER`, `RESGATAR`, `FIDELIZAR`, `MANTER`, `CANCELAR`.
