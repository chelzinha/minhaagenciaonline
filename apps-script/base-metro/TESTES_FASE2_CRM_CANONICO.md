# Testes executados — Fase 2 CRM Canônico

## Validação estática

- sintaxe validada com `node --check` em todos os arquivos `.js` do projeto;
- funções CRM prefixadas verificadas contra as respectivas declarações;
- schemas verificados contra cabeçalhos duplicados;
- locks revisados para impedir aninhamento durante setup, migração, sync, ativação e normalização;
- lista oficial de recomendações confirmada: `CONVERTER`, `RESGATAR`, `FIDELIZAR`, `MANTER`, `CANCELAR`.

## Smoke test funcional em ambiente simulado

Fluxo executado com planilhas simuladas:

1. `setupCrmCanonicoFase2()`;
2. `auditMigracaoClientesFase2()`;
3. `migrateClientesCadastroFase2()`;
4. `previewSyncClientesAppCompatFase2()`;
5. `syncClientesAppCompatFase2()`;
6. `normalizeVisitarLegadoFase2()`;
7. `enableCadastroCanonicoOverlayFase2()`;
8. `disableCadastroCanonicoOverlayFase2()`.

Resultado: aprovado.

## Teste da trava de conflito

Foi simulado um CNPJ/CPF vinculado a dois `CLIENTE_ID`s diferentes.

Resultado esperado e obtido:

- auditoria registrou conflito `BLOQUEANTE`;
- ativação normal do overlay foi interrompida;
- ativação somente ocorreu com chamada explícita `enableCadastroCanonicoOverlayFase2(true)`.
