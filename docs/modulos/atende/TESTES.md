# Atende - Testes da importacao CSV diaria

**Data da baseline:** 05/09/2026  
**Escopo:** importacao automatica do relatorio CSV do Atende para a aba `Postagens`

## 1. Baseline do arquivo analisado

O arquivo presente na pasta `_Atende Diario` apresentou:

- 980 linhas de dados;
- 26 colunas;
- 965 linhas com codigo de objeto;
- 15 linhas sem codigo de objeto;
- 0 chaves tecnicas duplicadas;
- 623 registros `SARA`;
- 357 registros `CORREIOS ATENDE`;
- 980 registros com `ATENDIMENTO` valido;
- valor total de R$ 69.855,97;
- valor de R$ 34.540,20 nos 15 atendimentos sem rastreio.

A baseline e estrutural. Nenhum dado pessoal do CSV deve ser reproduzido em documentacao ou log.

## 2. Validacao obrigatoria antes da primeira gravacao

1. Fazer `clasp push` da branch `feat/atende-csv-diario`.
2. Configurar `ATENDE_CSV_FOLDER_ID` em Script Properties.
3. Executar `ATENDE_validarCsvDriveSemGravar()`.
4. Confirmar `ok=true`, `totalRows=980`, `importableRows=980`, `validObjects=965`, `withoutObject=15` e `invalidMissingKey=0`.
5. Conferir a previa de Data, Atendente, Objeto, servico, valor, peso, origem e forma de pagamento.
6. Confirmar que a aba `Postagens` nao recebeu nenhuma linha nova durante a validacao.

## 3. Primeira importacao manual

Executar:

```text
ATENDE_importarCsvDriveAgora()
```

Validar:

- `ok=true`;
- `filesProcessed` maior que zero;
- `added + updated + skipped` coerente com os registros processados;
- as 15 linhas sem codigo de objeto sao preservadas quando ainda nao existem;
- nessas linhas, `Objeto` permanece visualmente vazio;
- a celula vazia de `Objeto` recebe nota iniciada por `ATENDE_CSV_ID:`;
- o total do novo dia inclui os atendimentos sem rastreio;
- `LOG_IMPORTACOES` recebe uma linha `csv_drive`;
- `Criados`, `Atualizados` e `Ignorados` ficam separados;
- a coluna `Hash` recebe o SHA-256 tecnico do conteudo;
- `IDX_POSTAGENS_DATAS` e reconstruido apos alteracoes;
- `ATENDE_CACHE_VERSION` muda quando houver insercao ou atualizacao.

## 4. Validacao semantica dos campos

Confirmar em amostra controlada:

- `PESO` do CSV e convertido de gramas para `Peso (kg)`;
- `FORMA_PAGAMENTO` alimenta `Forma Pagamento` e `formaPagamento`;
- `SISTEMA_POSTAGEM` alimenta `Tipo Postagem` somente em linha nova;
- `MODALIDADE_PAGAMENTO` nao e copiado para a coluna legada `tipo`;
- `tipo` permanece com o valor anterior quando a linha ja existia por JSON;
- `MCU`, `NUMERO_PLP`, `PESO_TARIFADO` e `MODALIDADE_PAGAMENTO` nao criam colunas novas nesta versao.

Motivo do teste de `tipo`: `A FATURAR` / `A VISTA` do CSV nao possuem a mesma semantica de valores do JSON como `AFATURAR_AUTOMATIZADO`.

## 5. Atualizacao de registro existente

Usar uma copia controlada do CSV alterando um campo de um objeto ja existente e mantendo o mesmo codigo de objeto.

Resultado esperado:

- nenhuma nova linha para o objeto;
- `updated` incrementado;
- campos conhecidos pelo CSV atualizados;
- documento/endereco mais rico ja existente nao apagado;
- status avancado como `Entregue` ou `Em Transito` nao volta para `Postado`;
- `Estornado` pode substituir o status quando `ESTORNO=S`;
- `Tipo Postagem` existente e preservado.

## 6. Atendimento sem rastreio

Alterar de forma controlada um dos 15 atendimentos sem objeto, preservando `ATENDIMENTO`.

Resultado esperado:

- a linha e localizada pela nota tecnica;
- a linha e atualizada, nao duplicada;
- `Objeto` continua vazio;
- o valor continua entrando no resumo do painel.

## 7. Idempotencia

Executar novamente `ATENDE_importarCsvDriveAgora()` sem alterar o arquivo.

Resultado esperado:

- nenhuma duplicata;
- o arquivo ja processado e ignorado;
- a aba `Postagens` nao muda.

Depois salvar copia identica com outro nome.

Resultado esperado:

- o SHA-256 detecta o mesmo conteudo;
- nenhuma linha nova e criada.

## 8. Gatilho

Executar uma vez:

```text
ATENDE_instalarGatilhoCsvDrive()
```

Depois:

```text
ATENDE_statusCsvDrive()
```

Validar:

- `folderConfigured=true`;
- existe somente um gatilho para `ATENDE_importarCsvDriveAgora`;
- executar a instalacao novamente nao acumula gatilhos duplicados.

## 9. Painel `/atende`

Apos a primeira importacao, validar:

- abertura sem erro;
- historico anterior preservado;
- registros do novo dia disponiveis;
- linhas sem objeto aparecem com `Objeto` vazio;
- total monetario inclui essas linhas;
- busca por objeto funciona;
- filtros de Atendente, descricao, Categoria, Forma Pagamento e Remetente continuam funcionando;
- paginacao e resize continuam funcionando;
- sem regressao no desktop e mobile.

## 10. Erros e seguranca

Testar separadamente:

- Script Property ausente;
- pasta configurada sem CSV;
- CSV vazio;
- CSV sem cabecalho obrigatorio;
- data invalida;
- registro sem `CODIGO_OBJETO` e sem `ATENDIMENTO`;
- dois disparos proximos do gatilho.

Resultado esperado:

- falha controlada;
- nenhuma chave artificial criada;
- `LockService` evita concorrencia;
- `ERROS` recebe somente mensagem controlada, sem CSV bruto.

## 11. Protecao contra rotina legada

Depois de ativar a importacao, **nao executar** a funcao manual antiga:

```text
removerLinhasInvalidasSemObjeto()
```

Ela considera qualquer linha sem `Objeto` invalida e, portanto, apagaria atendimentos legitimos do CSV que usam `ATENDIMENTO` como chave tecnica.

A existencia desse utilitario nao afeta o fluxo normal porque ele nao e chamado automaticamente.

## 12. Rollback

Se houver problema antes do gatilho:

1. nao instalar o gatilho;
2. reverter a branch;
3. fazer `clasp push` da versao anterior.

Se o gatilho ja estiver ativo:

1. executar `ATENDE_removerGatilhoCsvDrive()`;
2. identificar o lote em `LOG_IMPORTACOES`;
3. criar backup antes de remover dados;
4. reverter o codigo e fazer novo `clasp push`.
