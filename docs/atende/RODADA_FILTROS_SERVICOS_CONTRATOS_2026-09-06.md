# Atende - filtros confirmados, contratos ECT e biblioteca de serviços - 06/09/2026

## Objetivo

Esta rodada ajusta a experiência de filtros do painel e amplia as bibliotecas administrativas sem alterar o RAW dos CSVs dos Correios.

## Filtros do painel

Foram removidos os filtros de:

- Contrato;
- Ocorrências.

As colunas `CONTRATO` e `OCORR.` continuam no painel e continuam ordenáveis.

Os filtros categóricos passam a usar multiselect com aplicação explícita:

- Objeto;
- Serviço;
- Cliente;
- Tipo;
- Intermediador;
- Sistema;
- Estorno;
- Atendente;
- Modalidade de pagamento;
- Forma de pagamento;
- Local.

Cada dropdown possui:

- `Selecionar tudo`;
- `Limpar tudo`;
- `Cancelar`;
- `Confirmar`.

Marcar ou desmarcar opções não recarrega o painel. A consulta só é executada após `Confirmar`.

O botão geral `Limpar` continua preservando Data início e Data fim.

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

Como esta rodada altera banco, Worker e Apps Script, a ordem correta é:

1. `git pull` da branch `feat/atende-csv-diario`;
2. aplicar migrations remotas do D1;
3. publicar o Worker;
4. `clasp push`;
5. atualizar o deployment existente do Apps Script.

Não há alteração necessária no Cloudflare Pages nesta rodada.
