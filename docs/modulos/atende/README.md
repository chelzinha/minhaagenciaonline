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

Consolidar atendimentos e postagens da AGF em um painel operacional único, com busca, filtros, paginação e resumo de valores.

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
Upsert por Objeto ou ID real de Atendimento
↓
Gravação/atualização em lote na aba Postagens
↓
Atualização da versão de cache + índice de datas
↓
/atende continua lendo a mesma base existente
```

A arquitetura evita parsing de CSV durante a abertura da tela e preserva o comportamento atual do frontend.

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

O gatilho roda a cada 1 hora. Como o horário do upload diário pode variar, cada execução verifica se existe CSV novo e encerra rapidamente quando não houver nada pendente.

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
| `CODIGO_OBJETO` | `Objeto` | Normalizado e usado como chave quando existe. |
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
| `SISTEMA_POSTAGEM` | `Tipo Postagem` | Para novos registros CSV, identifica SARA ou CORREIOS ATENDE. |
| `ESTORNO` | `Status` | `S` vira `Estornado`; objeto rastreável novo entra como `Postado`; atendimento sem rastreio entra como `Atendimento`. |
| `MODALIDADE_PAGAMENTO` | `tipo` | Modalidade do atendimento. |

Campos que não existem no CSV, como documento completo e endereço detalhado, permanecem vazios. A importação não inventa dados.

## 6. Atendimentos sem código de objeto

O relatório também pode conter cartas simples, venda de embalagens e outros atendimentos que não possuem `CODIGO_OBJETO`.

Esses registros **não são descartados** e **não recebem código de objeto artificial**.

Regra:

```text
Com CODIGO_OBJETO
→ chave = código do objeto

Sem CODIGO_OBJETO
→ Objeto permanece vazio
→ chave técnica = ATENDIMENTO real do CSV
```

Para não adicionar uma nova coluna ao schema atual, o `ATENDIMENTO` é guardado como nota técnica na célula vazia da coluna `Objeto`. A nota não é exibida no painel, acompanha a linha e permite reconhecer o mesmo atendimento em uma importação posterior.

## 7. Atualização de registros existentes

Se o CSV trouxer um objeto que já existe por importação anterior ou pelo fluxo manual de JSON, a rotina não cria uma segunda linha.

Ela atualiza somente os campos que o CSV realmente conhece, como:

- data;
- atendente;
- serviço;
- contrato/cartão;
- remetente;
- valor;
- pagamento;
- peso e dimensões;
- valor declarado;
- CEPs e destinatário.

O CSV não rebaixa um rastreio que já avançou para outro status. `Status` só é substituído quando está vazio ou quando o relatório sinaliza `Estornado`.

Também é preservado o `Tipo Postagem` antigo de um objeto já existente, evitando trocar `Coletado`, `A Coletar` ou `Rastreamento` por informação de origem do sistema.

## 8. Idempotência

A automação possui três níveis de proteção:

1. assinatura técnica do arquivo, com ID, data de modificação e tamanho, guardada em Script Properties;
2. hash SHA-256 do conteúdo, conferido no histórico de importações;
3. chave por registro: `Objeto` quando existe ou `ATENDIMENTO` quando não existe rastreio.

Reenviar o mesmo arquivo, renomear uma cópia ou rodar o gatilho novamente não deve duplicar atendimentos.

## 9. Performance

- o frontend não lê nem processa CSV;
- a classificação inicial lê somente a coluna `Objeto` e suas notas técnicas;
- a matriz completa da aba só é lida quando algum registro existente precisa ser atualizado;
- novos registros são gravados com `setValues` em lote;
- registros existentes são escritos em blocos contíguos;
- `LockService` evita duas importações concorrentes;
- o índice de datas é reconstruído uma vez após o lote, nunca linha a linha;
- `ATENDE_CACHE_VERSION` invalida respostas antigas após inserções ou atualizações;
- até 5 arquivos pendentes podem ser recuperados por execução.

O patch de performance existente continua responsável pela leitura rápida do painel por índice de datas e cache.

## 10. Segurança

**Atenção sensível.** O CSV contém dados operacionais de postagem, rastreios, nomes, CEPs, contratos e informações de atendimento.

Regras aplicadas:

- ID da pasta em Script Properties, não no repositório;
- nenhum CSV bruto é enviado ao frontend;
- nenhum conteúdo completo do CSV é gravado em log;
- erros registram somente mensagem sanitizada;
- o hash de conteúdo é usado apenas para idempotência;
- nenhum token ou credencial foi adicionado.

## 11. Deploy

A alteração é de Apps Script e documentação. Não exige alteração do wrapper Cloudflare de `/atende`.

Fluxo de publicação:

```text
git checkout feat/atende-csv-diario
clasp push
configurar ATENDE_CSV_FOLDER_ID
executar ATENDE_validarCsvDriveSemGravar
executar ATENDE_importarCsvDriveAgora
validar a planilha e /atende
executar ATENDE_instalarGatilhoCsvDrive
```

Preservar a URL `/exec` já usada pelo wrapper do módulo.

## 12. Rollback

1. Executar `ATENDE_removerGatilhoCsvDrive()`.
2. Reverter os arquivos `20_` a `27_` desta implementação no Git.
3. Fazer `clasp push` da versão anterior.
4. Se a primeira importação precisar ser desfeita, identificar o lote em `LOG_IMPORTACOES`, criar backup e remover somente as linhas correspondentes.

## 13. Status modular

O módulo permanece funcional sem depender do CSV durante a abertura. A automação é uma camada adicional de alimentação de dados, com baixo acoplamento ao frontend e rollback independente.
