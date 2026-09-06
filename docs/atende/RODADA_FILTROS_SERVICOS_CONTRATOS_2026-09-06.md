# Atende - filtros confirmados, contratos ECT e biblioteca de serviços - 06/09/2026

## Objetivo

Esta rodada ajusta a experiência de filtros do painel e amplia as bibliotecas administrativas sem alterar o RAW dos CSVs dos Correios.

## Filtros do painel

Foram removidos os filtros de:

- Contrato;
- Ocorrências.

As colunas `CONTRATO` e `OCORR.` continuam no painel e continuam ordenáveis.

Os filtros categóricos passam a usar multiselect com aplicação explícita.

Cada dropdown possui:

- `Selecionar tudo`;
- `Limpar tudo`;
- `Cancelar`;
- `Confirmar`.

Marcar ou desmarcar opções não recarrega o painel. A consulta só é executada após `Confirmar`.

O botão geral `Limpar filtros` continua preservando Data início e Data fim.

## ATENDENTE agrupado por nome

A lista do filtro `ATENDENTE` agora é agrupada pelo nome exibido.

Exemplo: se dois códigos diferentes estiverem vinculados a `ALESSON`, o filtro mostra `ALESSON` apenas uma vez e, ao selecioná-lo, inclui todos os códigos associados a esse nome.

A aba Admin > Atendentes continua exibindo cada código separadamente porque o vínculo técnico código -> pessoa precisa continuar preservado.

## Regra automática para contratos com até 3 ocorrências

Quando um contrato possui 1, 2 ou 3 ocorrências e ainda não tem cadastro manual correspondente:

```text
CLIENTE = vazio
TIPO = CONTRATO ECT
INTERMEDIADOR = CONTRATO ECT
```

A regra é aplicada como fallback derivado. Ela não modifica o RAW.

Um cadastro manual na biblioteca de contratos tem precedência sobre o fallback automático.

A regra também participa dos filtros de Tipo e Intermediador, portanto `CONTRATO ECT` pode ser filtrado normalmente.

## Biblioteca de Serviços via CSV

A biblioteca administrativa de serviços foi ampliada.

Formato esperado do CSV:

```text
CODIGO
SERVICO
TIPO
SUBGRUPO
TABELA
OBJETO QUANDO VAZIO
```

Também é aceito `NOME SERVICO` como alias de cabeçalho para `SERVICO`.

Regras:

- `CODIGO` é obrigatório;
- `SERVICO` é obrigatório;
- `TIPO`, `SUBGRUPO` e `TABELA` são metadados administrativos;
- `OBJETO QUANDO VAZIO` aceita `PRODUTO ECT`, `SEM REGISTRO` ou vazio;
- a importação não substitui `NOME_SERVICO` do RAW no painel;
- o nome importado fica como referência da biblioteca administrativa;
- o RAW nunca é alterado.

A aba Admin > Serviços passa a exibir:

```text
Código | Serviço | Ocorr. | Tipo | Subgrupo | Tabela | OBJETO quando vazio
```

Mantém-se o botão de salvamento em lote e foi adicionado `Importar CSV`.

## Normalização do código de serviço

Foi identificado que a mesma referência de serviço pode chegar com e sem zeros à esquerda, por exemplo:

```text
04227 = 4227
06238 = 6238
005070 = 5070
```

Essas variações não representam serviços diferentes. A chave cadastral derivada passa a usar o código canônico sem zeros à esquerda para valores puramente numéricos.

Regras:

- `codigo_servico` original da postagem permanece exatamente como veio no CSV;
- somente `codigo_servico_norm`, coluna técnica derivada, é normalizada;
- códigos numéricos ignoram zeros à esquerda;
- códigos alfanuméricos permanecem com trim/uppercase, sem remoção interna de caracteres;
- Admin > Serviços passa a agrupar as ocorrências pela chave canônica;
- a importação CSV da biblioteca de serviços usa a mesma chave canônica;
- novas postagens também são normalizadas automaticamente por trigger no D1.

A migration também consolida eventuais registros duplicados já existentes em `atende_servico_classificacao`, preservando uma única chave canônica por serviço.

## Filtros facetados e reorganização visual

Com o crescimento da base e da quantidade de dimensões disponíveis, a barra fixa com todos os filtros foi substituída por uma navegação facetada.

### Table-top

Busca, Data início, Data fim, seletor de mês completo, quantidade resultante e valor total ficam no topo da tabela.

Os filtros principais sempre visíveis são:

```text
OBJETO | TIPO SERVIÇO | CLIENTE | ATENDENTE | LOCAL
```

Os demais ficam em `Mais filtros`, agrupados e ordenados por hierarquia:

- Serviço: Tabela, Subgrupo, Serviço;
- Contrato: Intermediador, Tipo;
- Operação: Sistema, Estorno;
- Pagamento: Modalidade, Forma de pagamento.

Filtros aplicados também aparecem como chips removíveis, sem esconder o estado atual dentro dos dropdowns.

### Facetas dependentes

As opções de cada filtro são recalculadas considerando todos os outros filtros ativos, exceto ele próprio.

Exemplo:

```text
OBJETO = PRODUTO ECT
```

faz os filtros de serviço mostrarem somente valores presentes nesse subconjunto. Da mesma forma, `TIPO SERVIÇO = Encomenda` reduz as opções disponíveis em `TABELA`, `SUBGRUPO`, `SERVIÇO` e demais dimensões.

O próprio filtro é excluído de sua consulta de opções para permitir acrescentar outros valores em uma multiseleção já ativa.

### Contagem contextual

Cada opção passa a retornar a quantidade de registros resultante no contexto dos demais filtros, por exemplo:

```text
PAC (3.214)
SEDEX (2.876)
Reverso (417)
```

Depois de confirmar um filtro, o quantitativo total e o valor do painel são recalculados e as demais facetas são atualizadas.

## Seletor de mês completo

Foi adicionado ao lado de Data início e Data fim um controle mensal com navegação direta:

```text
‹  Setembro de 2026  ›
```

Regras:

- a seta esquerda seleciona o mês anterior completo;
- a seta direita seleciona o próximo mês completo;
- clicar no nome do mês abre o seletor nativo de mês do navegador;
- selecionar um mês preenche Data início com o primeiro dia e Data fim com o último dia daquele mês;
- o painel, os totais e todas as facetas são recalculados usando esse período;
- quando Data início e Data fim correspondem exatamente a um mês completo, o nome desse mês aparece no controle;
- quando as datas formam outro intervalo, o controle mostra `Período personalizado`;
- o seletor mensal reutiliza os filtros de data existentes e não cria novo campo no RAW ou no D1.

## Banco D1

Migrations desta rodada:

`cloudflare/atende-api/migrations/0005_servicos_biblioteca.sql`

Amplia `atende_servico_classificacao` com:

- `tipo_servico`;
- `subgrupo`;
- `tabela`.

`cloudflare/atende-api/migrations/0006_normalizar_codigo_servico.sql`

- normaliza `codigo_servico_norm` dos registros já existentes;
- consolida a biblioteca de serviços pela chave canônica;
- cria trigger para manter a normalização em novas cargas.

As migrations preservam os campos RAW originais.

## Publicação necessária

Para a reorganização de hierarquia visual e o seletor mensal não há migration nova nem mudança no Worker. É necessário:

1. `git pull` da branch `feat/atende-csv-diario`;
2. `clasp push`;
3. atualizar o deployment existente do Apps Script.

Não há alteração necessária no Cloudflare Pages.
