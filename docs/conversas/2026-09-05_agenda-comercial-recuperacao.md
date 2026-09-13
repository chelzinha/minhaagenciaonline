# Revisão documental — recuperação da Agenda Comercial

**Data:** 2026-09-05  
**Módulo principal:** CRM  
**Área:** Agenda Comercial  
**Classificação:** DEV_PLANEJAMENTO + DEV_IMPLEMENTACAO + DEV_TESTE + DEV_AUDITORIA  
**Hospedagem atual do frontend:** Cloudflare  
**Backend:** Google Apps Script  
**Status:** recuperação em andamento sobre a `main` atual

## 1. Conclusão

A implementação histórica da Agenda Comercial Fase 1 permanece tecnicamente útil, mas a branch `feat/crm-agenda-avulsa-fase1` ficou significativamente divergente da `main` e não deve ser mergeada ou rebaseada automaticamente.

A decisão é recuperar a funcionalidade em uma nova branch criada a partir da `main` atual:

`feat/crm-agenda-avulsa-recovery`

O PR histórico #33 permanece Draft como fonte de evidência e referência da implementação anterior.

## 2. Objetivo funcional preservado

Permitir atividade comercial sem vínculo cadastral por meio de:

- `ENTIDADE_TIPO = AVULSA`;
- `ENTIDADE_ID` vazio;
- `TRATATIVA_ID` vazio;
- `TITULO` obrigatório para atividade AVULSA;
- nenhuma criação artificial de Cliente, Prospect ou Tratativa.

## 3. Implementação histórica identificada

A branch antiga contém:

- schema aditivo `TITULO` em `AGENDA_EXECUCAO`;
- `APLICA_AVULSA` em `CRM_TIPOS_ATIVIDADE`;
- backend específico de AVULSA;
- frontend isolado para atividade sem vínculo;
- duração padrão por `DURACAO_PADRAO_MIN`;
- workspace AVULSA enxuto;
- navegação em dias úteis;
- filtros consistentes de vencidas;
- atualização otimista sem recarregar jornadas/funis para AVULSA;
- QA frontend isolado histórico;
- helper de QA integrado exclusivo de homologação.

## 4. Homologação já realizada

Registrado nesta conversa:

- branch histórica carregada no Apps Script de HOMOLOGAÇÃO via `clasp push`;
- `AGF_SPREADSHEET_ID` configurado somente no projeto de homologação;
- `op_ambienteAtual()` confirmou `HOMOLOGACAO`;
- `setupCrmJornadaFase3()` executado com sucesso;
- `setupCrmAgendaAvulsaFase1()` executado com sucesso;
- schema sintético conferido com `TITULO` e `APLICA_AVULSA`.

### Não confirmado

Não há nesta conversa registro do resultado final da execução de:

`qaAgendaFase1HomologAvulsa()`

Portanto, o QA integrado continua PENDENTE.

## 5. Conflitos e sobreposições

### `frontend/crm/config.js`

A `main` ainda contém referências antigas de Netlify e permite fallback de homologação para produção quando `API_HOMOLOG` está vazio.

A branch histórica da Agenda contém uma correção fail-closed.

O PR #27 (`fix/crm-performance-no-regression`) também altera esse arquivo e possui lógica mais atual para previews Cloudflare.

Decisão: não copiar cegamente o `config.js` de nenhuma branch antiga. A integração deverá ser refeita sobre a `main` atual, usando Cloudflare como hospedagem atual e preservando fail-closed.

### `apps-script/base-metro/06_CRM_JORNADA_FASE3.js`

A branch histórica da Agenda altera esse arquivo para:

- reconhecer `AVULSA` explicitamente;
- impedir criação de Tratativa para AVULSA;
- delegar save/complete/cancel/delete ao backend específico de AVULSA;
- projetar `titulo`;
- excluir AVULSA dos indicadores comerciais na primeira versão.

Decisão: aplicar essas mudanças de forma seletiva sobre o arquivo atual da `main`, sem substituir o arquivo inteiro.

## 6. Estratégia de recuperação

1. partir da `main` atual;
2. portar arquivos isolados da Agenda que não conflitam;
3. integrar alterações mínimas em `06_CRM_JORNADA_FASE3.js`;
4. adaptar `config.js` ao padrão Cloudflare e fail-closed;
5. preservar performance, autenticação e permissões atuais do CRM;
6. repetir QA frontend;
7. repetir QA Apps Script em homologação;
8. testar Cliente QA, Prospect QA e AVULSA;
9. validar `canViewTeam` e `agendaScope`;
10. testar o risco legado `openActivityModal()` x `agendaWin.items`;
11. revisar desktop/mobile;
12. atualizar documentação e CHANGELOG;
13. somente depois considerar merge e deploy.

## 7. Atenção sensível

SIM.

Motivo:

- Agenda pode conter dados comerciais e pessoais em título, local e observação;
- homologação usa Script Properties;
- permissões do CRM precisam ser preservadas;
- nenhum segredo, token ou credencial deve ser registrado no Git.

## 8. Documentação relacionada

Atualizar durante a recuperação:

- `CHANGELOG.md`;
- `docs/modulos/crm/README.md`;
- `docs/modulos/crm/TESTES.md`;
- `docs/modulos/crm/DECISOES.md`;
- `docs/APPS_SCRIPT.md`;
- `docs/FRONTEND.md`;
- `docs/PLANILHAS_E_DADOS.md`;
- `docs/PERFORMANCE.md`, se houver mudança de carregamento;
- `docs/REGISTRO_DE_MUDANCAS_SENSIVEIS.md`, quando aplicável.

## 9. Status dos itens

- [x] estado atual do PR histórico revisado;
- [x] hospedagem atual corrigida para Cloudflare na documentação do PR;
- [x] estratégia de recuperação definida;
- [x] nova branch criada a partir da `main` atual;
- [ ] portar código AVULSA para a branch nova;
- [ ] repetir QA integrado;
- [ ] homologar fluxos vinculados e AVULSA;
- [ ] validar permissões;
- [ ] revisar UX/UI desktop/mobile;
- [ ] atualizar documentação final e CHANGELOG;
- [ ] deploy Cloudflare e validação pós-deploy, somente quando aprovado.
