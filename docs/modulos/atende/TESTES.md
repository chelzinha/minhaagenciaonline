# Atende - Testes da importação CSV diária

**Data da baseline:** 05/09/2026  
**Escopo:** importação automática do relatório CSV do Atende para a aba `Postagens`

## 1. Baseline do arquivo analisado

O arquivo presente na pasta `_Atende Diário` no momento da implementação apresentou:

- 980 linhas de dados;
- 26 colunas;
- 965 linhas com código de objeto;
- 15 linhas sem código de objeto;
- 0 códigos de objeto duplicados dentro do próprio CSV;
- 623 registros com `SISTEMA_POSTAGEM=SARA`;
- 357 registros com `SISTEMA_POSTAGEM=CORREIOS ATENDE`;
- todos os cabeçalhos mínimos obrigatórios presentes.

A baseline foi usada somente para validar a estrutura. Nenhum dado pessoal do CSV é reproduzido neste documento.

## 2. Teste obrigatório antes da primeira gravação

1. Fazer `clasp push` da branch de implementação.
2. Configurar a Script Property `ATENDE_CSV_FOLDER_ID`.
3. Executar `ATENDE_validarCsvDriveSemGravar()`.
4. Confirmar:
   - `ok=true`;
   - `totalRows=980` para o arquivo da baseline;
   - `validObjects=965`;
   - `invalidWithoutObject=15`;
   - prévia com Data, Objeto, serviço, valor, peso, origem e pagamento coerentes.
5. Confirmar que nenhuma linha foi adicionada à aba `Postagens` após esse teste.

## 3. Primeira importação manual

Executar:

```text
ATENDE_importarCsvDriveAgora()
```

Validar:

- execução termina com `ok=true`;
- `filesProcessed` é maior que zero;
- `added` corresponde somente a objetos que ainda não existiam na aba `Postagens`;
- linhas sem código de objeto aparecem em `invalidWithoutObject` e não geram linhas artificiais;
- `LOG_IMPORTACOES` recebe uma linha do tipo `csv_drive`;
- a coluna `Hash` recebe o hash técnico da importação;
- não há gravação linha a linha;
- a aba `IDX_POSTAGENS_DATAS` é atualizada após o lote;
- `ATENDE_CACHE_VERSION` é alterada quando houver novas linhas.

## 4. Teste de idempotência

Executar `ATENDE_importarCsvDriveAgora()` novamente sem alterar o arquivo.

Resultado esperado:

- nenhum objeto novo é criado;
- o mesmo arquivo não é reprocessado como novo;
- a aba `Postagens` não recebe duplicatas.

Depois, copiar o mesmo CSV para a pasta com outro nome e executar novamente.

Resultado esperado:

- o hash do conteúdo detecta repetição;
- nenhum objeto é criado novamente.

## 5. Teste do gatilho

Executar uma vez:

```text
ATENDE_instalarGatilhoCsvDrive()
```

Depois executar:

```text
ATENDE_statusCsvDrive()
```

Validar:

- `folderConfigured=true`;
- existe somente um gatilho para `ATENDE_importarCsvDriveAgora`;
- instalar novamente não cria gatilhos duplicados.

## 6. Teste do painel

Abrir `/atende` após a primeira importação e validar:

- painel abre sem erro;
- dados anteriores continuam disponíveis;
- registros do novo dia aparecem;
- busca por código de objeto funciona;
- filtros de Atendente, descrição, Categoria, Forma Pagamento e Remetente continuam funcionando;
- total de valores é calculado;
- paginação funciona;
- larguras ajustáveis continuam funcionando;
- não há regressão visual no desktop;
- não há regressão no mobile.

## 7. Teste de erros

Validar separadamente:

- pasta sem CSV;
- Script Property ausente;
- CSV vazio;
- CSV sem um cabeçalho obrigatório;
- data inválida;
- arquivo com objetos já existentes;
- arquivo com linhas sem objeto;
- dois disparos próximos do gatilho.

Resultados esperados:

- falha controlada e mensagem clara;
- nenhuma gravação parcial antes da validação estrutural;
- `LockService` impede concorrência simultânea;
- erro pode ser identificado na aba `ERROS` sem armazenar o conteúdo bruto do CSV.

## 8. Rollback de teste

Se houver problema antes de habilitar o gatilho:

1. não instalar o gatilho;
2. reverter a branch;
3. fazer `clasp push` da versão anterior.

Se o gatilho já estiver ativo:

1. executar `ATENDE_removerGatilhoCsvDrive()`;
2. identificar o lote em `LOG_IMPORTACOES`;
3. criar backup antes de qualquer remoção de linhas;
4. reverter o código e fazer novo `clasp push`.
