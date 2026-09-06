# Atende - Rodada de UI, filtros e Admin - 05/09/2026

## Contexto

Após a ativação da fonte RAW em produção, o painel passou a exibir corretamente 28.639 registros. Esta rodada consolida os ajustes visuais e funcionais solicitados depois da primeira validação real do painel RAW.

A camada RAW continua imutável. Nenhuma alteração desta rodada modifica os 26 campos originais dos CSVs dos Correios.

## Alterações implementadas

### 1. Topbar interna removida

O Apps Script não renderiza mais a segunda barra de cabeçalho com nome do módulo, contador e botão Atualizar.

A única topbar do módulo passa a ser a casca autenticada do Cloudflare, no padrão da Plataforma AGF.

### 2. Resumo do table-top simplificado

O topo da tabela passa a exibir somente:

- chip amarelo com `N registros`;
- valor total no formato `R$ 0,00`.

Foram removidos:

- `registros encontrados`;
- texto explicativo de ordenação;
- texto explicativo das linhas amarelas;
- rótulo `Valor das postagens`.

### 3. Administração integrada à topbar autenticada

O botão `Admin` passa a existir na topbar externa do módulo e só é exibido quando a sessão local possui `role=admin`.

Ao clicar:

1. o wrapper Cloudflare revalida a sessão;
2. envia token e role para o iframe;
3. envia uma mensagem explícita `agf:open-admin`;
4. o Apps Script abre o modal administrativo;
5. qualquer gravação continua sendo validada novamente no backend de autenticação pelo Apps Script.

O navegador continua sem acesso ao `ATENDE_API_TOKEN` do Worker.

### 4. Largura do painel travada

O shell, iframe, conteúdo e card principal foram limitados a `100%` da largura disponível.

A tabela continua podendo ser mais larga que a tela, mas o scroll horizontal fica confinado ao container da tabela. A página externa não deve ganhar largura maior que a viewport.

### 5. Paginação de 500 linhas

A paginação padrão passa para 500 linhas.

Opções disponíveis:

- 100;
- 200;
- 500.

O proxy Apps Script e o endpoint RAW do Worker aceitam até 500 linhas por página.

### 6. ATENDENTE consolidado

O painel deixa de exibir duas colunas separadas (`ATENDENTE` e `NOME ATENDENTE`).

A única coluna visível passa a ser `ATENDENTE`.

Regra de apresentação:

```text
nome cadastrado na biblioteca de atendentes
  > código original do CSV quando ainda não existe cadastro
```

Exemplo:

```text
05236373301 -> JULIO
```

O código original permanece intacto no RAW e continua sendo a chave da biblioteca.

O filtro também continua se chamando `ATENDENTE`, porém exibe o nome amigável quando houver vínculo cadastrado. O valor técnico enviado ao backend continua sendo o código original.

### 7. NOME CONTRATO renomeado para INTERMEDIADOR

A chave de dados interna permanece compatível, porém o cabeçalho visível no painel passa a ser `INTERMEDIADOR`.

A área administrativa de contratos também usa a nomenclatura Intermediador no campo de nome.

### 8. Limpar filtros preserva datas

O botão `LIMPAR` não altera mais:

- Data início;
- Data fim.

Ele limpa somente os demais filtros e a seleção multiselect de serviços.

### 9. Categoria SRO no filtro OBJETO

O filtro OBJETO passa a ter:

- Todos;
- SRO;
- PRODUTO ECT;
- SEM REGISTRO.

`SRO` inclui somente linhas cujo `CODIGO_OBJETO` original, após trim e normalização de caixa, termina em `BR`.

Nenhuma linha é alterada ou removida para realizar esse agrupamento.

### 10. SERVIÇO multiselect

O filtro SERVIÇO deixa de ser seleção simples e passa a ser dropdown com múltipla seleção.

O frontend envia vários parâmetros `servico` ao Worker e o backend aplica lógica OR entre os serviços selecionados.

### 11. Filtro ATENDENTE com nome amigável

A API de filtros passa a retornar:

```json
{
  "value": "codigo_original",
  "label": "nome_amigavel_ou_codigo"
}
```

Assim, o usuário seleciona JULIO, HELENA etc., mas a filtragem continua usando a chave original da fonte.

### 12. Salvamento em lote da classificação de serviços

A aba `Serviços` do Admin deixa de exigir um clique em `Salvar` por linha.

Novo fluxo:

1. o administrador altera quantas classificações desejar na lista exibida;
2. clica uma única vez em `Salvar alterações`;
3. o Apps Script envia o lote ao Worker por `/admin/services-bulk`;
4. o Worker compara cada item com a classificação já gravada;
5. somente itens realmente alterados são escritos;
6. o histórico é criado somente quando o campo `tipo_objeto` efetivamente muda.

O endpoint aceita no máximo 500 itens por requisição. A tela administrativa renderiza até 150 serviços por pesquisa, portanto o lote da interface permanece abaixo do limite.

`Sem mapeamento` remove apenas a classificação derivada da biblioteca. O dado RAW do CSV permanece intacto.

## Worker de painel v2

Foi criada a camada:

`cloudflare/atende-api/src/panel-v2.js`

Ela concentra as novas regras de leitura e filtros do painel RAW sem alterar a rotina de ingestão definida em `src/index.js`.

`src/main.js` passa a encaminhar `/atende` e `/filters` para essa camada quando `panel_source=raw` e a base RAW estiver pronta.

O fallback legado continua disponível.

## Arquivos principais alterados

- `cloudflare/atende-api/src/panel-v2.js`
- `cloudflare/atende-api/src/main.js`
- `apps-script/atende/30_ATENDE_D1_PAINEL.gs`
- `apps-script/atende/31_ATENDE_D1_ADMIN.gs`
- `apps-script/atende/Index.html`
- `frontend/atende/index.html`
- `frontend/atende/sw.js`

## Ordem de publicação

1. atualizar branch local;
2. publicar Worker Cloudflare;
3. `clasp push` + atualizar o deployment existente do Apps Script;
4. publicar `frontend` no Cloudflare Pages somente quando houver alteração na casca externa;
5. Ctrl+F5 no `/atende`;
6. validar Admin e os novos filtros.

## Validações pós-deploy

Confirmar:

- total continua em 28.639 antes de novos CSVs;
- valor total continua coerente;
- não existe segunda topbar interna;
- painel não extrapola largura da página;
- scroll horizontal acontece apenas dentro da tabela;
- paginação abre com 500;
- datas sobrevivem ao botão Limpar;
- OBJETO contém a opção SRO;
- SERVIÇO aceita múltiplas opções;
- ATENDENTE mostra nome quando cadastrado e código enquanto não cadastrado;
- INTERMEDIADOR substitui NOME CONTRATO visualmente;
- botão Admin aparece somente para admin;
- modal Admin abre pela topbar externa;
- `Salvar alterações` grava várias classificações de serviço em uma única ação;
- gravações administrativas continuam sem modificar o RAW.
