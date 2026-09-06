# Atende - Status da implementação em 05/09/2026

## Resumo

O módulo `/atende` foi migrado para uma arquitetura com camada RAW imutável no Cloudflare D1, preservando exatamente uma linha no banco para cada linha dos CSVs dos Correios.

> **Infraestrutura atual:** o frontend da Plataforma AGF está hospedado no **Cloudflare**. Netlify não faz parte do fluxo atual de produção deste módulo.

Estado confirmado:

- hospedagem/frontend da plataforma: Cloudflare;
- backend de importação e leitura: Cloudflare Worker + D1;
- automação de entrada: Google Apps Script + Google Drive;
- fonte oficial do painel: RAW ativada;
- 3 CSVs processados integralmente;
- 28.639 linhas RAW confirmadas;
- 0 importações incompletas;
- fluxo de arquivos alterado para `ENTRADA -> PROCESSADA`;
- bibliotecas administrativas e enriquecimentos já implementados na branch;
- publicação do novo Apps Script/painel e do wrapper autenticado do `/atende` em andamento;
- PR #53 continua em draft e não foi mesclado em `main`.

## 1. Correção de arquitetura dos dados

A primeira versão do D1 consolidava registros por chave derivada de `CODIGO_OBJETO` ou `ATENDIMENTO` e usava UPSERT. Isso não preservava todas as ocorrências quando os mesmos valores apareciam mais de uma vez.

Validação que motivou a mudança:

- soma de dois CSVs: 25.019 linhas;
- tabela consolidada antiga: 24.981 linhas;
- diferença: 38 ocorrências legítimas consolidadas.

A fonte oficial foi então substituída por `atende_postagens_raw`.

Regra atual:

- 1 linha CSV = 1 linha RAW;
- nenhuma linha é eliminada por repetição de SRO, objeto, atendimento, serviço ou qualquer outro campo;
- os 26 campos originais são armazenados como texto;
- os campos originais não são sobrescritos após a inserção;
- a identidade técnica da linha usa a importação do arquivo + número da linha;
- `fileId + hash` identifica a versão de um arquivo para idempotência.

A regra normativa completa está em `docs/atende/REGRA_DADOS_CORREIOS_IMUTAVEIS.md`.

## 2. Validação real concluída

Arquivos confirmados no RAW:

| Arquivo | Linhas |
| --- | ---: |
| CSV 1 | 980 |
| CSV 2 | 24.039 |
| CSV 3 | 3.620 |
| **Total** | **28.639** |

Consultas de validação executadas em produção:

```sql
SELECT COUNT(*) AS total_raw
FROM atende_postagens_raw r
JOIN atende_raw_importacoes ri
  ON ri.import_key = r.import_key
 AND ri.concluido_em IS NOT NULL;
```

Resultado confirmado:

```text
total_raw = 28639
```

Integridade por arquivo:

```sql
SELECT COUNT(*) AS problemas
FROM atende_raw_importacoes
WHERE gravadas <> total_linhas
   OR concluido_em IS NULL;
```

Resultado confirmado:

```text
problemas = 0
```

O terceiro CSV foi importado com:

- 3.620 linhas enviadas;
- 3.620 linhas inseridas;
- 3.620 linhas armazenadas;
- 0 inválidas;
- 4 requisições ao Worker;
- importação concluída.

## 3. Fluxo do Google Drive

A pasta configurada em `ATENDE_CSV_FOLDER_ID` agora trabalha com duas subpastas:

```text
ATENDE
├── ENTRADA
└── PROCESSADA
```

Regras operacionais:

1. todo CSV novo deve entrar em `ENTRADA`;
2. o gatilho horário procura arquivos pendentes;
3. cada arquivo é enviado ao Worker em lotes;
4. o Worker grava no D1 RAW;
5. o Apps Script confirma `gravadas = total_linhas`;
6. somente depois da confirmação integral o arquivo é movido para `PROCESSADA`;
7. em caso de erro o arquivo permanece em `ENTRADA`;
8. se a execução se aproximar da janela segura de tempo, a rotina para e a próxima execução continua;
9. não existe mais limite fixo de 2 arquivos por execução;
10. arquivos já completos no D1 são reconhecidos e movidos para `PROCESSADA` sem duplicar dados.

O teste real mais recente terminou com:

```text
filesAttempted = 3
filesCompleted = 3
filesPartial = 0
pendingInEntrada = 0
errors = []
```

## 4. Ativação da fonte RAW

A origem de leitura do painel é controlada por `atende_runtime_config`.

Estado de produção confirmado:

```text
panel_source = raw
```

O código mantém fallback para `legacy` como mecanismo de rollback operacional.

## 5. Cloudflare Workers Paid

O Worker `agf-atende-api` foi configurado para aproveitar o plano Workers Paid:

```jsonc
"limits": {
  "cpu_ms": 300000
}
```

Isso permite até 5 minutos de CPU por requisição HTTP no Worker. A ingestão continua em lotes para facilitar retomada, idempotência e controle de memória.

Arquitetura atual:

```text
Google Drive
  -> Apps Script
  -> Cloudflare Worker
  -> Cloudflare D1
  -> Cloudflare / Frontend
  -> /atende
```

## 6. Regra visual da coluna OBJETO

O dado bruto `CODIGO_OBJETO` permanece intacto no RAW.

Na camada de apresentação, somente quando o valor original estiver vazio, em branco ou `null`, a coluna visual `OBJETO` poderá receber um valor definido pela biblioteca de serviço.

Valores permitidos:

- `PRODUTO ECT`;
- `SEM REGISTRO`.

Se `CODIGO_OBJETO` possuir qualquer conteúdo original, esse conteúdo é exibido sem substituição.

## 7. Serviço e código de serviço

O CSV já possui `NOME_SERVICO`, portanto não é necessário criar uma biblioteca apenas para descobrir o nome do serviço.

Mapeamento do painel:

```text
CODIGO_SERVICO -> CÓD. SERVIÇO
NOME_SERVICO   -> SERVIÇO
```

A biblioteca de serviço existe apenas para regras complementares, principalmente a classificação de `OBJETO` vazio.

## 8. SRO duplicado

Um valor é considerado SRO para a regra de duplicidade somente quando `CODIGO_OBJETO`, após normalização, termina em `BR`.

Se o mesmo SRO aparecer mais de uma vez:

- todas as ocorrências permanecem;
- nenhuma linha é excluída ou consolidada;
- o painel pode apenas destacar visualmente as linhas repetidas.

## 9. Camada administrativa implementada na branch

As seguintes tabelas/camadas já foram estruturadas:

- `atende_clientes`;
- `atende_cliente_aliases`;
- `atende_atendentes`;
- `atende_contratos`;
- `atende_servico_classificacao`;
- `atende_locais`;
- `atende_postagem_overrides`;
- `atende_admin_historico`.

Objetivos:

- corrigir/normalizar nomes de clientes sem tocar no RAW;
- memorizar aliases históricos;
- mapear código de atendente para nome amigável;
- mapear contrato para nome/tipo comercial;
- classificar objeto vazio como `PRODUTO ECT` ou `SEM REGISTRO`;
- definir LOCAL padrão do cliente;
- permitir exceção de LOCAL por postagem;
- registrar histórico das alterações administrativas.

## 10. LOCAL

`LOCAL` é dado operacional interno e nunca faz parte do RAW dos Correios.

Regra de precedência:

```text
override da postagem
  > local padrão do cliente
  > sem definição
```

A interface administrativa foi projetada para permitir:

- edição de `LOCAL` diretamente na grade;
- seleção de várias linhas;
- alteração de `LOCAL` em lote;
- remoção de override para voltar ao local padrão.

## 11. Segurança administrativa

O navegador não recebe o segredo `ATENDE_API_TOKEN`.

Fluxo planejado/implementado:

```text
Cloudflare /atende autenticado
  -> contexto da sessão AGF
  -> iframe Apps Script
  -> validação server-side da sessão
  -> Apps Script usa segredo backend
  -> Worker/D1
```

Apenas `role=admin` pode executar mutações administrativas.

As alterações administrativas devem registrar usuário, data, campo, valor anterior e valor novo.

## 12. Publicação em andamento nesta etapa

Neste momento está sendo publicada a camada que inclui:

- Apps Script atualizado do Atende;
- painel lendo a fonte RAW;
- novas colunas de apresentação;
- área administrativa;
- wrapper autenticado do `/atende` no frontend hospedado no Cloudflare.

Colunas esperadas no novo painel:

- `DATA`;
- `CEP DESTINATARIO`;
- `CEP REMETENTE`;
- `OBJETO`;
- `CÓD. SERVIÇO`;
- `SERVIÇO`;
- `NOME REMETENTE`;
- `CARTÃO POSTAGEM`;
- `CONTRATO`;
- `NOME CONTRATO`;
- `SISTEMA`;
- `VALOR`;
- `ESTORNO`;
- `ATENDENTE`;
- `NOME ATENDENTE`;
- `MODALIDADE PAGAMENTO`;
- `FORMA PAGAMENTO`;
- `LOCAL`.

## 13. Próximas validações

Após a publicação atual, validar:

- painel mostra 28.639 registros;
- leitura continua vindo do RAW;
- `OBJETO`, `CÓD. SERVIÇO` e `SERVIÇO` aparecem corretamente;
- `NOME CONTRATO`, `NOME ATENDENTE` e `LOCAL` aparecem;
- botão `Admin` aparece apenas para administrador;
- salvamento nas bibliotecas não altera nenhuma coluna RAW;
- alteração de LOCAL individual funciona;
- alteração de LOCAL em lote funciona;
- histórico administrativo é gravado;
- SRO duplicado terminado em `BR` é apenas destacado e nunca removido.

## 14. Rollback

Se houver problema na leitura nova, a fonte do painel pode voltar temporariamente para `legacy` alterando `atende_runtime_config`, sem apagar a camada RAW.

A camada RAW e os CSVs em `PROCESSADA` devem ser preservados para auditoria e revalidação.

## 15. Estado do Git

Branch de trabalho:

```text
feat/atende-csv-diario
```

PR:

```text
#53 - draft
```

Não fazer merge em `main` até concluir testes pós-publicação da fonte RAW e da camada administrativa.
