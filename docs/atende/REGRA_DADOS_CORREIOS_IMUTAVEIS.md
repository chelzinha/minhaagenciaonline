# Atende - Regra de imutabilidade dos dados dos Correios

## Regra principal

Os dados recebidos nos CSVs do Correios Atende sao fonte oficial e **nunca podem ser editados, excluidos, consolidados ou sobrescritos**.

Na camada RAW do Cloudflare D1:

- 1 linha do CSV = 1 linha em `atende_postagens_raw`;
- a quantidade de linhas de cada arquivo deve ser preservada integralmente;
- repeticoes de SRO, atendimento, produto, servico ou qualquer outro campo sao mantidas;
- uma reimportacao do mesmo arquivo/versao nao cria outra copia tecnica da mesma linha, usando `import_key + numero_linha` apenas para idempotencia da ingestao;
- os 26 campos originais sao armazenados como texto e nao sao alterados depois da insercao.

## Camada de apresentacao

Limpeza e enriquecimento existem somente em tabelas separadas e na consulta do painel:

- clientes e aliases;
- nomes de atendentes;
- nomes/tipos de contratos;
- classificacao de servicos;
- local padrao do cliente;
- excecao de local por postagem.

Essas informacoes podem ser editadas por administradores sem modificar o RAW.

## Excecao visual da coluna OBJETO

O campo original `CODIGO_OBJETO` permanece intacto no RAW.

No painel, somente quando o valor original estiver vazio, em branco ou `null`, a coluna visual `OBJETO` pode receber uma classificacao definida na biblioteca do servico.

Os unicos valores permitidos sao:

- `PRODUTO ECT`
- `SEM REGISTRO`

Se `CODIGO_OBJETO` possuir qualquer conteudo original, esse conteudo e exibido sem substituicao.

## SRO duplicado

Um valor e tratado como SRO para a regra visual de duplicidade somente quando o codigo de objeto normalizado termina em `BR`.

SRO repetido **nunca e removido**. As ocorrencias sao mantidas e podem apenas receber destaque visual no painel.

## Auditoria administrativa

Toda alteracao das bibliotecas e dos overrides operacionais deve registrar, quando aplicavel:

- entidade;
- chave;
- campo;
- valor anterior;
- valor novo;
- usuario;
- data/hora.

O historico administrativo tambem nao altera os dados RAW.
