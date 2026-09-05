# Atende - Regra de imutabilidade dos dados dos Correios

## Regra principal

Os dados recebidos nos CSVs do Correios Atende sao fonte oficial e **nunca podem ser editados, excluidos, consolidados ou sobrescritos**.

Na camada RAW do Cloudflare D1:

- 1 linha do CSV = 1 linha em `atende_postagens_raw`;
- a quantidade de linhas de cada arquivo deve ser preservada integralmente;
- repeticoes de SRO, atendimento, produto, servico ou qualquer outro campo sao mantidas;
- uma reimportacao da mesma versao do mesmo arquivo nao cria outra copia tecnica da mesma linha, usando `import_key + numero_linha` apenas para idempotencia da ingestao;
- os 26 campos originais sao armazenados como texto e nao sao alterados depois da insercao.

## Camada de apresentacao

Limpeza e enriquecimento existem somente em tabelas separadas e na consulta do painel:

- `atende_clientes` - cadastro mestre do cliente;
- `atende_cliente_aliases` - memoria dos nomes sujos ja reconhecidos;
- `atende_atendentes` - codigo do atendente para nome amigavel;
- `atende_contratos` - numero do contrato para nome/tipo comercial;
- `atende_servico_classificacao` - classificacao dos objetos vazios;
- `atende_postagem_overrides` - excecao operacional de local por linha;
- `atende_admin_historico` - auditoria das alteracoes administrativas.

Essas informacoes podem ser editadas por administradores sem modificar o RAW.

## Excecao visual da coluna OBJETO

O campo original `CODIGO_OBJETO` permanece intacto no RAW.

No painel, somente quando o valor original estiver vazio, em branco ou `null`, a coluna visual `OBJETO` pode receber uma classificacao definida na biblioteca do servico.

Os unicos valores permitidos sao:

- `PRODUTO ECT`
- `SEM REGISTRO`

Se `CODIGO_OBJETO` possuir qualquer conteudo original, esse conteudo e exibido sem substituicao.

## Nome do servico

`NOME_SERVICO` ja vem no CSV dos Correios e deve ser exibido no painel como `SERVICO`.

O codigo permanece disponivel separadamente como `COD. SERVICO`.

## SRO duplicado

Um valor e tratado como SRO para a regra visual de duplicidade somente quando o codigo de objeto normalizado termina em `BR`.

SRO repetido **nunca e removido**. As ocorrencias sao mantidas e recebem apenas destaque visual no painel.

## Local comercial

O local e informacao interna e nao faz parte do RAW dos Correios.

Pode existir em dois niveis:

1. `local_padrao` no cliente mestre;
2. override por postagem em `atende_postagem_overrides`.

O override da postagem tem prioridade visual sobre o local padrao. Administradores podem alterar o local de uma linha ou de varias linhas em lote.

## Controle administrativo

A area administrativa do `/atende` usa a autenticacao existente da plataforma. A interface recebe o contexto da sessao do wrapper autenticado, e o Apps Script valida o token novamente no backend antes de permitir qualquer escrita.

O segredo usado entre Apps Script e Cloudflare Worker continua somente em Script Properties/Worker Secrets e nunca e enviado ao navegador.

## Auditoria administrativa

Toda alteracao das bibliotecas e dos overrides operacionais registra, quando aplicavel:

- entidade;
- chave;
- campo;
- valor anterior;
- valor novo;
- usuario;
- data/hora.

O historico administrativo tambem nao altera os dados RAW.
