# CRM - Importacao em lote pela planilha

## Objetivo

Permitir que cadastros manuais feitos diretamente na planilha entrem no fluxo do CRM sem Rachel precisar preencher manualmente campos tecnicos.

A rotina fica em:

- `apps-script/base-metro/11_CRM_IMPORTACAO_LOTE_MENU.js`

E e acessada pelo menu da planilha:

- `🚀 CRM > Subir aba atual para o front`
- `🚀 CRM > Subir Prospects e Clientes`
- `🚀 CRM > Ver status da importacao CRM`

## Conclusao pratica

Sim: o fluxo manual correto e:

1. Rachel preenche apenas os campos de cadastro.
2. Clica em `🚀 CRM > Subir aba atual para o front`.
3. O Apps Script completa os campos obrigatorios.
4. O Apps Script cria a linha correspondente em `CRM_TRATATIVAS`.
5. O Apps Script grava `TRATATIVA_ATIVA_ID` na entidade.
6. O Apps Script registra evento em `CRM_EVENTOS`.
7. O Apps Script invalida os caches do CRM.
8. O front passa a conseguir buscar a informacao atualizada.

## Abas atendidas

### PROSPECTS

Campos que Rachel pode preencher manualmente:

- `CLIENTE`
- `LOCAL`
- `SEGMENTO`
- `NOME_FANTASIA`
- `RAZAO_SOCIAL`
- `CNPJ_CPF`
- `ENDERECO`
- `NUMERO`
- `COMPLEMENTO`
- `BAIRRO`
- `CIDADE`
- `UF`
- `CEP`
- `CONTATO`
- `WHATSAPP`
- `EMAIL`
- `INSTAGRAM`
- `RESPONSAVEL`

Campos completados pela rotina quando estiverem vazios:

- `PROSPECT_ID`
- `STATUS_PROSPECT`
- `ETAPA_FUNIL`
- `ORIGEM_LEAD`
- `DATA_CADASTRO`
- `UPDATED_AT`
- `RESPONSAVEL_ID`
- `TRATATIVA_ATIVA_ID`
- campos auxiliares de importacao.

Padroes aplicados:

- `STATUS_PROSPECT`: `NOVO`
- `ETAPA_FUNIL`: `Novo lead`
- etapa tecnica em `CRM_TRATATIVAS`: `P_NOVO`
- funil: `FUNIL_PROSPECTS`
- status da tratativa: `ABERTA`
- origem: `PLANILHA_LOTE`

### CLIENTES_CADASTRO

Campos que Rachel pode preencher manualmente:

- `CLIENTE`
- `NOME_FANTASIA`
- `RAZAO_SOCIAL`
- `CNPJ_CPF`
- `PESSOA_CONTATO`
- `WHATSAPP`
- `TELEFONE`
- `EMAIL`
- `ENDERECO`
- `NUMERO`
- `COMPLEMENTO`
- `BAIRRO`
- `CEP`
- `CIDADE`
- `UF`
- `LOCAL_PADRAO`
- `SEGMENTO_PADRAO`
- `RESPONSAVEL_NOME` ou `RESPONSAVEL_ID`

Campos completados pela rotina quando estiverem vazios:

- `CLIENTE_ID`
- `NOME_REMETENTE_BASE`
- `STATUS_CADASTRO`
- `CRIADO_EM`
- `ATUALIZADO_EM`
- `ATUALIZADO_POR`
- `RESPONSAVEL_ID`
- `TRATATIVA_ATIVA_ID`
- campos auxiliares de importacao.

Padroes aplicados:

- `STATUS_CADASTRO`: `ATIVO`
- etapa tecnica em `CRM_TRATATIVAS`: `C_SINALIZADO`
- funil: `FUNIL_CLIENTES`
- status da tratativa: `ABERTA`
- origem: `PLANILHA_LOTE`

## Como a rotina evita criar tratativas antigas por engano

A rotina nao processa tudo automaticamente.

Ela processa somente:

1. linhas novas sem `PROSPECT_ID` ou sem `CLIENTE_ID`; ou
2. linhas existentes marcadas com `SUBIR_FRONT = SIM`.

Depois de processar, a rotina marca:

- `SUBIR_FRONT = NAO`
- `STATUS_IMPORTACAO_CRM = IMPORTADO`
- `IMPORTADO_EM = data/hora da execucao`
- `ERRO_IMPORTACAO_CRM = vazio`

Se houver erro, marca:

- `STATUS_IMPORTACAO_CRM = ERRO`
- `ERRO_IMPORTACAO_CRM = mensagem tecnica curta e sem payload sensivel`

## Colunas auxiliares adicionadas

A rotina pode adicionar no final de `PROSPECTS` e `CLIENTES_CADASTRO`:

- `SUBIR_FRONT`
- `STATUS_IMPORTACAO_CRM`
- `IMPORTADO_EM`
- `ERRO_IMPORTACAO_CRM`

Essas colunas existem apenas para controle interno da importacao pela planilha.

## Responsavel

A rotina tenta resolver `RESPONSAVEL` ou `RESPONSAVEL_NOME` usando a aba `CRM_RESPONSAVEIS`.

Ela aceita correspondencia por:

- `RESPONSAVEL_ID`
- `USERNAME`
- `DISPLAY_NAME`

Se nao encontrar, preserva o valor preenchido e segue com aviso. O ideal e preencher o nome exatamente como aparece no CRM ou o ID tecnico do responsavel.

## CRM_TRATATIVAS

Para cada cadastro processado, a rotina procura se ja existe tratativa aberta ou pausada para a mesma entidade e funil.

Se existir, reaproveita a tratativa.

Se nao existir, cria uma nova linha com:

- `TRATATIVA_ID`
- `TIPO_ENTIDADE`
- `ENTIDADE_ID`
- `FUNIL_ID`
- `ETAPA_ID`
- `STATUS_TRATATIVA`
- `ORIGEM`
- `RESPONSAVEL_ID`
- `ABERTA_EM`
- `ETAPA_ATUALIZADA_EM`
- `ATUALIZADO_EM`
- `MOTIVO_ABERTURA`
- `CRIADO_POR`

## CRM_EVENTOS

Quando uma nova tratativa e criada, a rotina grava evento tecnico em `CRM_EVENTOS` com tipo:

- `TRATATIVA_CRIADA`

O evento nao deve conter dados pessoais completos.

## Cache e front

Ao final, a rotina tenta invalidar os caches operacionais ja usados pelo Apps Script.

Prioridade:

1. usar `op_invalidateOperationCaches_()` quando existir;
2. remover chaves conhecidas de cache;
3. executar `crm3_bumpCacheRev_()` quando existir.

## Clientes e CLIENTES_MASTER

Clientes cadastrados em `CLIENTES_CADASTRO` dependem da regra de overlay para aparecerem completos em `CLIENTES_MASTER`.

A rotina nao habilita overlay automaticamente.

Se o overlay estiver ativo, a rotina tenta reconstruir `CLIENTES_MASTER`.

Se o overlay estiver desativado, a rotina avisa que a tratativa pode ser criada, mas o card pode nao aparecer completo ate habilitar/reconstruir o master.

## Atencao sensivel

Esta rotina manipula:

- CPF/CNPJ;
- telefone;
- e-mail;
- endereco;
- dados cadastrais;
- dados comerciais;
- relacionamento entre cliente/prospect e responsavel.

Regras:

1. Nao usar dados reais em documentacao.
2. Nao colar payload completo em issue, changelog ou commit.
3. Nao registrar CPF/CNPJ, telefone, e-mail ou endereco completo em logs.
4. Testar primeiro com linhas ficticias.
5. Validar permissao da planilha e do Apps Script antes de uso amplo.

## Checklist de teste

1. Abrir a planilha vinculada ao Apps Script.
2. Recarregar a planilha para o menu `🚀 CRM` aparecer.
3. Criar uma linha ficticia em `PROSPECTS` sem `PROSPECT_ID`.
4. Preencher `CLIENTE`, `LOCAL`, `SEGMENTO` e `RESPONSAVEL`.
5. Clicar em `🚀 CRM > Subir aba atual para o front`.
6. Confirmar que a linha recebeu `PROSPECT_ID`, `RESPONSAVEL_ID`, `TRATATIVA_ATIVA_ID` e status `IMPORTADO`.
7. Confirmar que uma linha foi criada em `CRM_TRATATIVAS`.
8. Confirmar que uma linha foi criada em `CRM_EVENTOS`.
9. Abrir o front e validar se o prospect aparece no funil/jornada.
10. Repetir em `CLIENTES_CADASTRO` com cliente ficticio.

## Como forcar reprocessamento de uma linha existente

Para uma linha antiga ja com ID, preencher:

```text
SUBIR_FRONT = SIM
```

Depois clicar novamente no menu.

A rotina nao deve duplicar tratativa aberta para a mesma entidade/funil. Ela reaproveita a tratativa aberta ou pausada quando existir.

## Arquivos relacionados

- `apps-script/base-metro/11_CRM_IMPORTACAO_LOTE_MENU.js`
- `apps-script/base-metro/90_FILTROS.js`
- `apps-script/base-metro/05_CRM_CANONICO_FASE2.js`
- `apps-script/base-metro/06_CRM_JORNADA_FASE3.js`
- `apps-script/base-metro/10_OPERACAO_EXECUCAO_API.js`
- `docs/PLANILHAS_E_DADOS.md`
- `docs/REGISTRO_DE_MUDANCAS_SENSIVEIS.md`

## Mensagem de commit sugerida

```bash
git commit -m "feat(crm): adiciona importacao em lote pela planilha"
```
