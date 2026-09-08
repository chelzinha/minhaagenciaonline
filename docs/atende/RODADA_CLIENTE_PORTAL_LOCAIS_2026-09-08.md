# Rodada - CLIENTE PORTAL, RAZAO SOCIAL e Locais dinamicos

Data: 2026-09-08

## Nomenclatura do painel

- `CLIENTE` tecnico do contrato continua no backend, mas o cabecalho visual passa a ser **RAZAO SOCIAL**.
- `CADASTRO PORTAL` passa a ser **CLIENTE PORTAL**.
- O filtro superior passa a usar **CLIENTE PORTAL**.
- **RAZAO SOCIAL** permanece disponivel em Mais filtros > Contrato.

## Biblioteca de Locais

`atende_locais` passa a ser administravel pelo painel. Os registros iniciais continuam:

- `AGF` -> `AGF`
- `METRO` -> `METRO` (rotulo visual METRO com acento circunflexo)

Novos Locais podem ser cadastrados em Admin > Locais.

## Trava por CLIENTE PORTAL

A tabela `atende_cliente_portal_local` vincula o nome normalizado do CLIENTE PORTAL a um Local.

Hierarquia efetiva do LOCAL:

1. trava do CLIENTE PORTAL;
2. override manual da postagem;
3. Local padrao do Atendente;
4. Local padrao do Remetente;
5. vazio.

Quando uma postagem possui trava pelo CLIENTE PORTAL, alteracoes de Local linha a linha ou em lote sao bloqueadas. A mudanca deve ser feita em Admin > Locais.

## Grupos por Local

Admin > Locais permite:

- cadastrar novo Local;
- pesquisar CLIENTE PORTAL;
- filtrar clientes por Local;
- atribuir um Local a um cliente individualmente;
- selecionar varios CLIENTE PORTAL e aplicar a mesma trava em lote;
- remover a trava em lote.

## Local dinamico em Atendentes e Remetentes

Como a coluna `atende_atendentes.local_padrao` criada na migration 0007 tinha restricao a `AGF`/`METRO`, a migration 0009 cria `atende_atendente_local` para permitir qualquer Local ativo sem recriar a tabela de atendentes.

Remetentes e overrides manuais passam a validar o Local contra a biblioteca `atende_locais`, em vez de aceitar somente AGF/METRO.

## Dados imutaveis

Nenhuma dessas regras altera o RAW do Atende ou o RAW do Consolidador. Todas as classificacoes continuam em tabelas administrativas/derivadas.
