# Atende

**Module ID:** `atende`  
**Tipo:** interno operacional  
**Rota:** `/atende`  
**Frontend:** `frontend/atende`  
**Backend:** `apps-script/atende`  
**Autenticacao:** AGF_ACCESS no frontend  
**Dados sensiveis:** SIM  
**Fonte operacional principal:** aba `Postagens`  
**Fonte automatica adicional:** CSV diario salvo na pasta `_Atende Diario`

## 1. Finalidade

Consolidar atendimentos e postagens da AGF em um painel operacional unico, com busca, filtros, paginacao e resumo de valores.

A partir de 05/09/2026, o modulo passa a possuir uma rotina de importacao automatica do relatorio CSV do Atende. O frontend nao le o CSV diretamente. O arquivo e processado pelo Apps Script e alimenta a mesma aba `Postagens` ja consumida pelo painel.

## 2. Arquitetura

```text
CSV salvo no Drive
-> gatilho horario do Apps Script
-> validacao de estrutura e idempotencia
-> mapeamento para o schema canonico
-> upsert por Objeto ou ATENDIMENTO
-> aba Postagens
-> invalidacao de cache + indice de datas
-> /atende continua consumindo a mesma base
```

Essa arquitetura evita parsing do CSV durante a abertura da tela e preserva o frontend atual.

## 3. Configuracao da pasta

O ID da pasta nao fica versionado no GitHub. Configurar uma unica vez em:

```text
Apps Script
-> Project Settings
-> Script Properties
-> ATENDE_CSV_FOLDER_ID = <ID da pasta _Atende Diario>
```

Depois executar, nesta ordem:

```text
ATENDE_validarCsvDriveSemGravar()
ATENDE_importarCsvDriveAgora()
ATENDE_instalarGatilhoCsvDrive()
```

O gatilho e horario porque o Apps Script nao possui gatilho nativo para "novo arquivo em uma pasta do Drive". A cada execucao, a rotina encerra rapidamente quando nao existe CSV pendente.

## 4. Funcoes principais

| Funcao | Finalidade |
|---|---|
| `ATENDE_validarCsvDriveSemGravar()` | Valida o CSV mais recente e retorna uma previa sem escrever dados. |
| `ATENDE_importarCsvDriveAgora()` | Processa manualmente os CSVs novos e tambem atua como handler do gatilho. |
| `ATENDE_instalarGatilhoCsvDrive()` | Remove gatilhos duplicados desse handler e instala um gatilho a cada 1 hora. |
| `ATENDE_removerGatilhoCsvDrive()` | Remove o gatilho da importacao automatica. |
| `ATENDE_statusCsvDrive()` | Informa configuracao da pasta e gatilhos existentes. |

## 5. Baseline do CSV analisado

Arquivo analisado em 05/09/2026:

- 980 registros;
- 26 colunas;
- 965 registros com `CODIGO_OBJETO`;
- 15 registros sem `CODIGO_OBJETO`, todos com `ATENDIMENTO` valido;
- 623 registros `SARA`;
- 357 registros `CORREIOS ATENDE`;
- valor total do arquivo: R$ 69.855,97;
- valor dos 15 atendimentos sem rastreio: R$ 34.540,20.

Os atendimentos sem objeto nao podem ser descartados, pois representam operacoes reais e parcela relevante do valor diario.

## 6. Mapeamento para as 41 colunas atuais

| CSV Atende | Painel `Postagens` | Regra |
|---|---|---|
| `DATA_POSTAGEM` | `Data` | Converte para Date real. |
| `CPF_MATRICULA_ATENDENTE` | `Atendente` | Mantem como texto. |
| `CODIGO_OBJETO` | `Objeto` | Normalizado e usado como chave quando existe. |
| `CODIGO_SERVICO` | `codigo` | Codigo do servico. |
| `NOME_SERVICO` | `descricao` | Descricao original do servico. |
| `NOME_SERVICO` | `Categoria` | Categoria derivada. |
| `NUMERO_CONTRATO` | `Contrato` | Texto. |
| `CARTAO_POSTAGEM` | `Cartao Postagem` | Texto. |
| `NOME_REMETENTE` | `Remetente` | Nome informado no relatorio. |
| `VALOR_ATENDIMENTO` | `Valor` | Numero. |
| `FORMA_PAGAMENTO` | `Forma Pagamento` e `formaPagamento` | Mantem a forma informada pelo CSV. |
| `PESO` | `Peso (kg)` | O CSV usa gramas; divide por 1000. |
| `LARGURA` | `Larg. (cm)` | Numero. |
| `COMPRIMENTO` | `Comp. (cm)` | Numero. |
| `ALTURA` | `Alt. (cm)` | Numero. |
| `DIAMETRO` | `Diam. (cm)` | Numero. |
| `VALOR_DECLARADO` | `VD` | Numero. |
| `CEP_REMETENTE` | `Rem. CEP` | Somente digitos. |
| `NOME_DESTINATARIO` | `Dest. Nome` | Nome informado no relatorio. |
| `CEP_DESTINATARIO` | `Dest. CEP` | Somente digitos. |
| `SISTEMA_POSTAGEM` | `Tipo Postagem` | Identifica SARA ou CORREIOS ATENDE para linhas novas. |
| `ESTORNO` | `Status` | `S` vira `Estornado`; objeto novo vira `Postado`; atendimento sem objeto vira `Atendimento`. |

### Campos do CSV sem coluna dedicada no painel atual

Os campos abaixo sao preservados como metadados tecnicos da importacao, mas nao ganharam nova coluna visual nesta entrega:

- `ATENDIMENTO`: usado como chave tecnica para linhas sem objeto;
- `MODALIDADE_PAGAMENTO`;
- `MCU`;
- `NUMERO_PLP`;
- `PESO_TARIFADO`.

Importante: `MODALIDADE_PAGAMENTO` nao e gravado na coluna legada `tipo`. O CSV traz valores como `A FATURAR` e `A VISTA`, enquanto a coluna `tipo` do fluxo JSON possui outra semantica, com valores mais especificos como `AFATURAR_AUTOMATIZADO`. Misturar os dois campos causaria perda de significado.

Campos detalhados que nao existem no CSV, como documentos e enderecos completos, nao sao inventados e nao apagam informacoes mais ricas que ja existam na linha.

## 7. Atendimentos sem codigo de objeto

Regra:

```text
Com CODIGO_OBJETO
-> chave = codigo do objeto

Sem CODIGO_OBJETO
-> Objeto permanece vazio
-> chave = ATENDIMENTO real do CSV
```

Para preservar as 41 colunas atuais, o `ATENDIMENTO` dessas linhas e guardado como nota tecnica na celula vazia da coluna `Objeto`, usando o prefixo `ATENDE_CSV_ID:`. A nota nao aparece no painel e acompanha a linha em ordenacoes/movimentos da planilha.

Nenhum codigo de objeto artificial e criado.

### Atencao ao utilitario legado

A funcao manual antiga `removerLinhasInvalidasSemObjeto()` foi criada quando toda linha sem `Objeto` era considerada invalida. Depois desta automacao, existem linhas legitimas sem objeto.

**Nao executar `removerLinhasInvalidasSemObjeto()` apos ativar a importacao CSV enquanto essa rotina nao for adaptada para reconhecer `ATENDE_CSV_ID:`.**

## 8. Atualizacao de registros existentes

Se o CSV trouxer um objeto que ja existe, a rotina nao cria uma segunda linha. Ela atualiza apenas campos conhecidos pelo CSV.

O CSV nao rebaixa um rastreio que ja avancou para outro status. `Status` so e substituido quando esta vazio ou quando o CSV sinaliza `Estornado`.

O `Tipo Postagem` antigo de linhas previamente enriquecidas por JSON tambem e preservado.

## 9. Idempotencia

A automacao possui tres camadas:

1. assinatura do arquivo por ID, data de modificacao e tamanho em Script Properties;
2. SHA-256 do conteudo conferido em `LOG_IMPORTACOES`;
3. chave por registro: `Objeto` quando existe ou `ATENDIMENTO` quando nao existe rastreio.

Reexecutar o gatilho, reenviar o mesmo arquivo ou salvar uma copia identica com outro nome nao deve duplicar registros.

## 10. Performance

- nenhum CSV e lido no boot do frontend;
- a classificacao inicial le apenas a coluna `Objeto` e suas notas;
- a matriz completa de `Postagens` so e lida se houver linhas existentes a atualizar;
- novas linhas sao gravadas com `setValues` em lote;
- atualizacoes sao escritas em blocos contiguos;
- `LockService` evita importacoes concorrentes;
- o indice de datas e reconstruido uma vez apos o lote;
- `ATENDE_CACHE_VERSION` invalida respostas antigas somente quando houve alteracao;
- ate 5 CSVs pendentes podem ser processados por execucao.

O patch `zz_PerformancePatch.gs` continua responsavel pela leitura otimizada do painel.

## 11. Seguranca

**Atencao sensivel.** O CSV contem rastreios, nomes, CEPs, contratos e dados operacionais.

- o ID da pasta fica em Script Properties;
- o CSV bruto nao e enviado ao frontend;
- o conteudo integral nao e gravado em logs;
- erros registram somente mensagem controlada;
- nenhum token ou credencial foi adicionado.

## 12. Deploy

Esta entrega altera Apps Script e documentacao. Nao altera `frontend/atende` nem exige novo deploy do wrapper Cloudflare.

Fluxo:

```text
git checkout feat/atende-csv-diario
clasp push
configurar ATENDE_CSV_FOLDER_ID
executar ATENDE_validarCsvDriveSemGravar()
executar ATENDE_importarCsvDriveAgora()
validar Postagens, LOG_IMPORTACOES e /atende
executar ATENDE_instalarGatilhoCsvDrive()
```

Preservar a implantacao `/exec` ja usada pelo wrapper.

## 13. Rollback

1. Executar `ATENDE_removerGatilhoCsvDrive()`.
2. Reverter os arquivos `20_` a `27_` no Git.
3. Fazer `clasp push` da versao anterior.
4. Se for necessario desfazer um lote, identificar a execucao em `LOG_IMPORTACOES`, criar backup e remover apenas as linhas correspondentes.

## 14. Status

A implementacao esta isolada na branch `feat/atende-csv-diario`. A ativacao em producao depende de `clasp push`, configuracao da Script Property, teste de validacao sem gravacao, primeira importacao manual e somente depois instalacao do gatilho.
