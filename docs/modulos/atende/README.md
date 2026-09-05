# Atende

**Module ID:** `atende`  
**Tipo:** interno operacional  
**Rota:** `/atende`  
**Frontend:** `frontend/atende`  
**Backend:** `apps-script/atende`  
**Autenticação:** AGF_ACCESS no frontend  
**Dados sensíveis:** SIM  
**Fonte operacional principal:** aba `Postagens`  
**Fonte automática adicional:** CSV diário salvo na pasta `_Atende Diário`

## 1. Finalidade

Consolidar postagens atendidas pela AGF em um painel operacional único, com busca, filtros, paginação e resumo de valores.

A partir de 05/09/2026, o módulo passa a possuir uma rotina de importação automática do relatório CSV do Atende. O frontend não lê o CSV diretamente. O arquivo é processado em segundo plano e alimenta a mesma aba `Postagens` já consumida pelo painel.

## 2. Fluxo de dados

```text
Rachel salva o CSV na pasta _Atende Diário
↓
Gatilho horário do Apps Script
↓
Validação de arquivo, cabeçalhos e duplicidade
↓
Mapeamento para o schema canônico do Atende
↓
Deduplicação por código de objeto
↓
Gravação em lote na aba Postagens
↓
Atualização da versão de cache + índice de datas
↓
/atende continua lendo a mesma base existente
```

A arquitetura evita fazer parsing de CSV durante a abertura da tela e preserva o comportamento atual do frontend.

## 3. Configuração

O ID da pasta do Drive não fica versionado no GitHub.

Configurar no projeto Apps Script:

```text
Project Settings
→ Script Properties
→ ATENDE_CSV_FOLDER_ID = <ID da pasta _Atende Diário>
```

Depois executar uma única vez:

```text
ATENDE_validarCsvDriveSemGravar
ATENDE_instalarGatilhoCsvDrive
```

O gatilho roda a cada 1 hora. Como o horário do upload diário pode variar, cada execução verifica se há CSV novo e encerra rapidamente quando não houver nada pendente.

## 4. Funções da automação

| Função | Finalidade |
|---|---|
| `ATENDE_validarCsvDriveSemGravar()` | Valida o CSV mais recente e retorna prévia sem escrever dados. |
| `ATENDE_importarCsvDriveAgora()` | Processa manualmente os CSVs novos. Também é o handler do gatilho. |
| `ATENDE_instalarGatilhoCsvDrive()` | Remove gatilhos duplicados desse handler e instala um gatilho horário. |
| `ATENDE_removerGatilhoCsvDrive()` | Remove o gatilho da importação automática. |
| `ATENDE_statusCsvDrive()` | Informa se a pasta está configurada e quantos gatilhos existem. |

## 5. Mapeamento do CSV

| CSV Atende | Coluna do painel | Regra |
|---|---|---|
| `DATA_POSTAGEM` | `Data` | Converte para Date real no fuso do projeto. |
| `CPF_MATRICULA_ATENDENTE` | `Atendente` | Mantém como texto. |
| `CODIGO_OBJETO` | `Objeto` | Normalizado e usado como chave anti-duplicata. |
| `CODIGO_SERVICO` | `codigo` | Código do serviço. |
| `NOME_SERVICO` | `descricao` | Descrição do serviço. |
| `NOME_SERVICO` | `Categoria` | Categoria derivada sem alterar o serviço original. |
| `NUMERO_CONTRATO` | `Contrato` | Texto. |
| `CARTAO_POSTAGEM` | `Cartão Postagem` | Texto. |
| `NOME_REMETENTE` | `Remetente` | Nome informado no relatório. |
| `VALOR_ATENDIMENTO` | `Valor` | Número. |
| `FORMA_PAGAMENTO` | `Forma Pagamento` e `formaPagamento` | Mantém a origem do CSV. |
| `PESO` | `Peso (kg)` | O CSV informa gramas; divide por 1000. |
| `LARGURA` | `Larg. (cm)` | Número. |
| `COMPRIMENTO` | `Comp. (cm)` | Número. |
| `ALTURA` | `Alt. (cm)` | Número. |
| `DIAMETRO` | `Diâm. (cm)` | Número. |
| `VALOR_DECLARADO` | `VD` | Número. |
| `CEP_REMETENTE` | `Rem. CEP` | Somente dígitos. |
| `NOME_DESTINATARIO` | `Dest. Nome` | Nome informado no relatório. |
| `CEP_DESTINATARIO` | `Dest. CEP` | Somente dígitos. |
| `SISTEMA_POSTAGEM` | `Tipo Postagem` | Ex.: SARA ou CORREIOS ATENDE. |
| `ESTORNO` | `Status` | `S` vira `Estornado`; demais registros entram como `Postado`. |
| `MODALIDADE_PAGAMENTO` | `tipo` | Modalidade do atendimento. |

Campos que não existem no CSV, como documento completo e endereço detalhado, permanecem vazios. A importação não inventa dados.

## 6. Regra para registros sem código de objeto

A aba `Postagens` continua sendo orientada a objetos rastreáveis. Linhas do relatório sem `CODIGO_OBJETO` não recebem código artificial e não entram nessa base.

Essas linhas são contabilizadas como ignoradas em `LOG_IMPORTACOES`. Isso preserva a chave anti-duplicata e evita misturar venda de material/serviços sem rastreio com objetos postais rastreáveis.

## 7. Idempotência e proteção contra duplicidade

A automação usa três proteções:

1. assinatura técnica do arquivo, com ID, data de modificação e tamanho, guardada em Script Properties;
2. hash SHA-256 do conteúdo, conferido no histórico de importações;
3. deduplicação por `Objeto` contra a base existente e dentro do próprio CSV.

Reenviar o mesmo arquivo ou rodar o gatilho novamente não deve duplicar postagens.

## 8. Performance

- o frontend não lê nem processa CSV;
- a rotina lê apenas a coluna `Objeto` para montar o índice anti-duplicata;
- novas linhas são gravadas com um único `setValues` por arquivo;
- `LockService` evita duas importações concorrentes;
- o índice de datas é reconstruído uma vez após o lote, nunca linha a linha;
- `ATENDE_CACHE_VERSION` invalida respostas antigas após uma importação;
- até 5 arquivos pendentes são processados por execução para evitar execução longa.

O patch de performance existente continua responsável pela leitura rápida do painel por índice de datas e cache.

## 9. Segurança

**Atenção sensível.** O CSV contém dados operacionais de postagem, rastreios, nomes, CEPs, contratos e informações de atendimento.

Regras aplicadas:

- ID da pasta em Script Properties, não no repositório;
- nenhum CSV bruto é enviado ao frontend;
- nenhum conteúdo completo do CSV é gravado em log;
- erros registram apenas mensagem sanitizada;
- o hash de conteúdo é usado apenas para idempotência.

## 10. Deploy

A alteração é somente de Apps Script e documentação.

Não há mudança necessária em `frontend/atende/index.html` nem no layout do painel.

Fluxo de publicação:

```text
git checkout feat/atende-csv-diario
clasp push
configurar ATENDE_CSV_FOLDER_ID
executar validação sem gravação
executar primeira importação manual
instalar gatilho
validar /atende
```

Se o projeto usar implantação fixa do Web App e apenas o código da implantação atual precisar ser atualizado, preservar a URL `/exec` já usada pelo wrapper.

## 11. Rollback

1. Executar `ATENDE_removerGatilhoCsvDrive()`.
2. Reverter os arquivos `20_` a `26_` desta implementação no Git.
3. Fazer `clasp push` da versão anterior.
4. Se a primeira importação precisar ser desfeita, remover somente as linhas do lote importado após conferir `LOG_IMPORTACOES` e manter backup antes de qualquer exclusão.

## 12. Status modular

O módulo permanece funcional sem depender do CSV na abertura. A automação é uma camada adicional de alimentação de dados, com baixo acoplamento ao frontend e rollback independente.
