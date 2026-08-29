# Agenda Comercial — Fase 1 — Etapa 1I — Base de homologação isolada

**Data:** 2026-08-29  
**Branch:** `feat/crm-agenda-avulsa-fase1`  
**Status:** base de dados e projeto Apps Script de homologação criados; conteúdo do backend ainda não publicado no projeto de teste.

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
- `APLICA_AVULSA` já presente em `CRM_TIPOS_ATIVIDADE`.

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

O código existente já suporta troca de ambiente por Script Property:

`AGF_SPREADSHEET_ID`

Regra prevista no backend:

- propriedade ausente → planilha produtiva configurada no código legado;
- propriedade presente → planilha indicada pela propriedade.

No projeto Apps Script de homologação, essa propriedade deverá apontar exclusivamente para a planilha sintética criada nesta etapa.

## 5. Proteção adicionada ao frontend

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

## 6. Blocker atual

O projeto Apps Script de homologação foi criado e o Drive consegue lê-lo como JSON de projeto.

A tentativa de substituir o conteúdo do projeto pela API do Drive retornou:

`The drive.scripts scope is required to update Apps Script content.`

Portanto, o carregamento do backend da branch precisa de uma destas opções:

1. `clasp` autenticado com a conta Google correta; ou
2. conexão com escopo `drive.scripts`; ou
3. edição manual do projeto Apps Script, usando pacote completo — nunca trechos soltos.

O ambiente atual também não possui sessão `clasp` autenticada.

## 7. O que já pode ser considerado fechado

- produção não foi alterada;
- base de dados de homologação existe e foi auditada;
- nenhum dado pessoal real foi copiado;
- schema de Agenda Fase 1 existe na base de teste;
- tipos AVULSA de teste estão parametrizados;
- projeto Apps Script separado existe;
- preview de homologação não pode mais cair silenciosamente no backend produtivo.

## 8. Próximo gate

Depois de carregar a branch no Apps Script de homologação:

1. definir `AGF_SPREADSHEET_ID` para a base sintética;
2. executar/setup do CRM necessário no projeto de teste;
3. publicar Web App de homologação;
4. preencher `API_HOMOLOG` no frontend da branch;
5. testar Cliente QA;
6. testar Prospect QA;
7. testar AVULSA;
8. confirmar que AVULSA não grava `CRM_TRATATIVAS`, `CRM_INTERACOES` ou `CRM_EVENTOS`;
9. validar permissões/escopo;
10. reproduzir o risco legado `agendaWin` em atividade vinculada.

## 9. Atenção sensível

Esta etapa envolve Script Properties, Apps Script, permissões e separação de ambientes.

- não registrar o valor real de `AGF_SPREADSHEET_ID` em documentação pública;
- não registrar URL completa do Web App de produção;
- não copiar Script Properties de produção para homologação em lote;
- criar somente propriedades necessárias ao ambiente de teste;
- não usar tokens ou credenciais produtivas na homologação.
