# Caixa à Vista V2 - Apps Script

Backend novo e independente do caixa legado em `/caixa/`.

## O que esta versão controla

- receitas de atendimento, avulsas e em lote;
- despesas individuais e em lote;
- categorias e meios de pagamento carregados da planilha-biblioteca;
- usuário vinculado à unidade AGF ou Metrô;
- saldo inicial e saldo esperado em dinheiro;
- sangrias, sem classificá-las como despesas;
- fechamento com contagem, diferença, justificativa e declaração;
- PDFs separados de fechamento e de cada sangria;
- fila de criação de contas a receber e a pagar no Conta Azul;
- Pix Santander com confirmação por `txid` e webhook.

Nenhum endpoint de baixa do Conta Azul é chamado. Os títulos permanecem em aberto para conferência e baixa manual pelo financeiro.

## Configuração inicial

1. Crie ou atualize o projeto Apps Script do Caixa à Vista.
2. Adicione todos os arquivos da pasta `apps-script/caixa-avista`.
3. Execute manualmente:

```javascript
setupCaixaAvistaV2()
```

4. Autorize Google Sheets, Google Drive, Google Docs e chamadas externas.
5. A função cria a base e dois gatilhos:
   - fila do Conta Azul a cada 5 minutos;
   - nova tentativa de PDFs a cada 30 minutos.
6. Preencha a biblioteca antes de publicar para usuários reais.
7. Publique como Web App e informe a URL `/exec` no frontend.

## Abas da biblioteca

### `Biblioteca_Unidades`

Uma linha por unidade. Campos principais:

- `unit_id`: código estável, como `AGF` ou `METRO`;
- `name`: nome exibido;
- `cost_center_name`: nome do centro de custo no Conta Azul;
- `cost_center_ca_id`: UUID do centro de custo;
- `default_revenue_contact_ca_id`: contato genérico para contas a receber sem cliente sincronizado;
- `default_expense_contact_ca_id`: fornecedor genérico para contas a pagar;
- `drive_root_folder_id`: pasta raiz onde serão criadas as árvores de PDFs;
- `active`.

### `Biblioteca_Usuarios`

Vincula o `username` autenticado a uma unidade e às permissões:

- receita;
- despesa;
- fechamento;
- sangria.

A linha `*` serve apenas para homologação. Remova-a ou desative-a antes da produção e cadastre os usuários reais.

### `Biblioteca_Contas`

Relaciona o código interno da conta com o nome e UUID reais do Conta Azul.

### `Biblioteca_Pagamentos`

Define:

- nome e ícone no frontend;
- método do Conta Azul;
- conta financeira;
- uso em receita, despesa e lote;
- se gera cobrança Pix;
- cor, ordem e situação.

### `Biblioteca_Receitas`

Define quais receitas aparecem no frontend e se permitem:

- atendimento;
- avulso;
- lote;
- cliente opcional ou obrigatório;
- descrição opcional ou obrigatória.

Também guarda categoria e UUID do Conta Azul.

### `Biblioteca_Despesas`

Define:

- tipo de despesa;
- categoria do Conta Azul;
- forma e conta padrão;
- permissão de lote;
- exigência de descrição;
- ícone, cor e ordem.

Alterações nessas abas aparecem no frontend sem novo deploy.

## Abas operacionais

- `Clientes`
- `Lancamentos_V2`
- `Saldos_Diarios`
- `Sangrias`
- `Fechamentos_V2`
- `ContaAzul_Fila`

As linhas de lançamento guardam snapshots de categoria, conta e centro de custo. Alterações futuras na biblioteca não reclassificam o histórico já fechado.

## Caixa físico

O saldo esperado usa somente dinheiro físico:

```text
saldo inicial
+ receitas em dinheiro
- despesas pagas em dinheiro
- sangrias
= saldo esperado na gaveta
```

Pix, débito e crédito não possuem saldo inicial no aplicativo.

O saldo remanescente após a sangria do fechamento é transportado para o próximo dia.

## Sangrias

Sangria é uma movimentação de numerário, não uma despesa. Ela:

- reduz o saldo físico;
- não reduz o resultado financeiro;
- não entra na fila do Conta Azul;
- exige permissão e checkbox de conferência;
- não pode ultrapassar o saldo esperado;
- gera um PDF individual imediatamente.

## PDFs no Google Drive

Para cada unidade, configure `drive_root_folder_id`. O sistema cria:

```text
Pasta raiz
├── Fechamentos
│   └── AAAA
│       └── MM - Mês
│           └── UNIDADE
└── Sangrias
    └── AAAA
        └── MM - Mês
            └── UNIDADE
```

### PDF de fechamento

Contém:

- unidade, centro de custo, data, usuário e horário;
- posição completa do dinheiro físico;
- receitas, despesas e resultado;
- quantidades e totais por meio de pagamento;
- movimentos detalhados;
- sangrias;
- declaração e registro do checkbox;
- diferença e justificativa, quando houver.

### PDF de sangria

Cada retirada gera um arquivo exclusivo com:

- ID e horário da sangria;
- unidade e atendente;
- saldo antes e depois;
- valor retirado;
- destino e observação;
- texto da declaração;
- indicação de confirmação registrada.

Falha do Drive não desfaz a sangria ou o fechamento. O registro fica com erro e o gatilho tenta gerar o PDF novamente.

## Conta Azul

A integração cria somente:

- contas a receber para receitas;
- contas a pagar para despesas.

O processamento ocorre depois do fechamento. Cada item entra em `ContaAzul_Fila` e passa por estados como:

- `CONFIGURACAO_PENDENTE`;
- `PENDENTE`;
- `AGUARDANDO_PROTOCOLO`;
- `SINCRONIZADO`;
- `ERRO`.

A criação retorna um protocolo. O sistema consulta `/v1/protocolo/{id}` até `SUCCESS` ou `ERROR`.

A baixa permanece manual no Conta Azul.

### Propriedades OAuth

Configure nas Propriedades do script:

- `CAIXA_CONTA_AZUL_CLIENT_ID`
- `CAIXA_CONTA_AZUL_CLIENT_SECRET`
- `CAIXA_CONTA_AZUL_ACCESS_TOKEN`
- `CAIXA_CONTA_AZUL_REFRESH_TOKEN`
- `CAIXA_CONTA_AZUL_EXPIRES_AT`
- `CAIXA_CONTA_AZUL_REDIRECT_URI`

Use `contaAzulExchangeCodeV2(codigo)` para a primeira troca do código de autorização. Os tokens seguintes são renovados automaticamente e o novo `refresh_token` é persistido.

Execute `syncContaAzulLibraryV2()` para copiar categorias, centros de custo e contas financeiras para as abas técnicas `CA_*`. Depois, use os UUIDs dessas abas na biblioteca.

## Pix Santander

- atendimento Pix cria lançamento `CRIANDO` antes da chamada ao Worker;
- o Worker retorna QR Code, Pix Copia e Cola e `txid`;
- webhook atualiza status, `e2eid` e horário;
- todo Pix diferente de `CONFIRMADO` fica fora das receitas e bloqueia o fechamento;
- Pix avulso ou em lote é marcado como confirmação manual.

## Segurança

- sessão JWT AGF;
- unidade resolvida no backend;
- nenhum centro de custo enviado livremente pelo frontend;
- segredos somente em Script Properties ou secrets do Cloudflare;
- datas fechadas ficam bloqueadas;
- lotes são gravados em uma única operação;
- declarações são versionadas;
- PDFs e integrações externas possuem nova tentativa.

## Homologação obrigatória

Antes da produção:

1. cadastrar AGF e Metrô na biblioteca;
2. vincular todos os usuários;
3. configurar pastas do Drive;
4. preencher UUIDs reais do Conta Azul;
5. validar OAuth na conta teste;
6. validar os payloads de contas a receber e a pagar no sandbox;
7. testar sangria comum e sangria no fechamento;
8. conferir visualmente os dois tipos de PDF;
9. testar Pix confirmado, expirado, cancelado e com erro;
10. manter a PR em rascunho até a aprovação final.

## Rollback

- `/caixa/` continua intacto;
- a base V2 é independente;
- o frontend funciona em homologação local sem URL de Apps Script;
- o Santander pode permanecer em `disabled`;
- falhas de Drive ou Conta Azul permanecem em fila, sem reabrir o caixa.
