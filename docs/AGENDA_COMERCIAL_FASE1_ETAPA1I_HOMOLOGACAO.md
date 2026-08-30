# Agenda Comercial — Fase 1 — Etapa 1I — Base de homologação isolada

**Data:** 2026-08-29  
**Branch:** `feat/crm-agenda-avulsa-fase1`  
**Status:** backend da branch carregado no Apps Script de homologação; `AGF_SPREADSHEET_ID` confirmado apontando para a base sintética.

## 1. Conclusão prática

Foi criado um ambiente técnico separado para permitir a homologação integrada da Agenda Fase 1 sem usar dados ou gravações de produção.

O ambiente possui:

- pasta Drive exclusiva de homologação;
- projeto Apps Script independente;
- planilha Google Sheets independente;
- 22 abas sintéticas compatíveis com o CRM/Agenda;
- 1 Cliente fictício (`Cliente QA`);
- 1 Prospect fictício (`Prospect QA`);
- responsáveis fictícios `Administrador QA` e `Vendedor QA`;
- locais, funis, etapas, resultados, blocos e transições de teste;
- `TITULO` já presente em `AGENDA_EXECUCAO`;
- `APLICA_AVULSA` já presente em `CRM_TIPOS_ATIVIDADE`;
- backend completo da branch enviado ao projeto de homologação via `clasp`;
- Script Property `AGF_SPREADSHEET_ID` configurada somente no projeto de teste;
- `op_ambienteAtual()` confirmado como `HOMOLOGACAO` e apontando para `AGF Agenda Fase 1 - Base HOMOLOG`.

IDs e URLs dos artefatos de Drive não são versionados neste documento.

## 2. Dados usados

Nenhum registro real de Cliente, Prospect, telefone, e-mail, CPF/CNPJ, endereço, contrato ou observação comercial foi copiado.

Foram reaproveitados apenas:

- nomes de colunas;
- estrutura técnica das abas;
- configuração genérica de tipos, resultados, funis e blocos;
- regras necessárias para o backend reconhecer o mesmo contrato de dados.

Os registros operacionais são todos sintéticos.

## 3. Tipos AVULSA habilitados somente na homologação

Para validar parametrização sem hardcode no frontend:

- `ATV_LIGACAO` → `APLICA_AVULSA=SIM`;
- `ATV_VISITA` → `APLICA_AVULSA=SIM`;
- `ATV_TREINAMENTO` → `APLICA_AVULSA=NAO`.

Isso é configuração exclusiva da base de teste. Nenhuma configuração produtiva foi alterada.

## 4. Separação da planilha

O código existente suporta troca de ambiente por Script Property:

`AGF_SPREADSHEET_ID`

Regra prevista no backend:

- propriedade ausente → planilha produtiva configurada no código legado;
- propriedade presente → planilha indicada pela propriedade.

No projeto Apps Script de homologação, a propriedade foi configurada e validada.

Resultado do gate de segurança:

- `ambiente`: `HOMOLOGACAO`;
- `nomePlanilha`: `AGF Agenda Fase 1 - Base HOMOLOG`.

O ID da planilha não é registrado neste documento.

## 5. Backend carregado via clasp

O projeto local foi conectado exclusivamente ao Apps Script de homologação por `.clasp.json` local, ignorado pelo Git.

`clasp status` confirmou apenas os arquivos executáveis/manifesto como rastreados e manteve documentação `.md/.txt` fora do pacote.

O envio foi concluído com:

- `Pushed 25 files`;
- `17_CRM_AGENDA_AVULSA_FASE1.js` incluído;
- `appsscript.json` incluído;
- nenhum deploy executado nesta etapa.

## 6. Proteção adicionada ao frontend

Foi corrigido um risco encontrado durante a preparação da homologação.

Antes:

- host de homologação + `API_HOMOLOG` vazio → frontend caía no backend de produção.

Agora:

- host de homologação + `API_HOMOLOG` vazio → frontend aponta para domínio reservado `.invalid`;
- nenhuma chamada é enviada para produção;
- a faixa inferior informa `HOMOLOGACAO BLOQUEADA - backend de teste nao configurado`;
- produção continua usando o backend produtivo sem alteração.

Commit relacionado:

- `f9646d8772d221fdfa4fb3f8929df83b44336763` — `fix(crm): bloquear fallback de homologacao para producao`

## 7. Gate atual

O bloqueio de acesso ao Apps Script foi superado com `clasp` autenticado.

O próximo gate é preparar o CRM dentro da base sintética e auditar o resultado antes de qualquer publicação de Web App.

Sequência controlada:

1. executar `setupCrmJornadaFase3()`;
2. executar `setupCrmAgendaAvulsaFase1()`;
3. executar `auditCrmJornadaFase3()`;
4. executar `auditCrmAgendaAvulsaFase1Schema()`;
5. executar `smokeTestCrmJornadaFase3()`;
6. somente depois publicar o Web App de homologação.

Não executar nesta etapa funções de migração de clientes, habilitação de overlay, sincronização externa ou qualquer rotina voltada a dados reais.

## 8. O que já pode ser considerado fechado

- produção não foi alterada;
- base de dados de homologação existe e foi auditada;
- nenhum dado pessoal real foi copiado;
- schema de Agenda Fase 1 existe na base de teste;
- tipos AVULSA de teste estão parametrizados;
- projeto Apps Script separado existe;
- backend da branch foi carregado no projeto de homologação;
- `AGF_SPREADSHEET_ID` foi configurado no projeto de teste;
- `op_ambienteAtual()` confirmou `HOMOLOGACAO`;
- preview de homologação não pode mais cair silenciosamente no backend produtivo.

## 9. Próximo gate após o setup

Depois dos setups e auditorias aprovados:

1. publicar Web App de homologação;
2. preencher `API_HOMOLOG` no frontend da branch;
3. testar Cliente QA;
4. testar Prospect QA;
5. testar AVULSA;
6. confirmar que AVULSA não grava `CRM_TRATATIVAS`, `CRM_INTERACOES` ou `CRM_EVENTOS`;
7. validar permissões/escopo;
8. reproduzir o risco legado `agendaWin` em atividade vinculada.

## 10. Atenção sensível

Esta etapa envolve Script Properties, Apps Script, permissões e separação de ambientes.

- não registrar o valor real de `AGF_SPREADSHEET_ID` em documentação pública;
- não registrar URL completa do Web App de produção;
- não copiar Script Properties de produção para homologação em lote;
- criar somente propriedades necessárias ao ambiente de teste;
- não usar tokens ou credenciais produtivas na homologação.
