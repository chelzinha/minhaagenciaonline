# Caixa à Vista V1 - Frontend

Data da arquitetura: 30/08/2026.

## Objetivo

Nova interface de caixa para atendimentos de balcão da AGF José Bonifácio. Esta rota é independente do caixa legado e deve ser homologada em `/caixa-avista/` antes de qualquer substituição de `/caixa/`.

## Fluxo principal

1. Escolher Dinheiro, Pix, Débito ou Crédito.
2. Pesquisar o cliente por qualquer palavra do nome.
3. Selecionar um cadastro existente ou tocar no ícone `+` para criar o nome digitado.
4. Ajustar a quantidade de objetos, quando necessário.
5. Digitar o valor total no teclado próprio, no padrão de maquineta.
6. Registrar o recebimento.
7. No Pix, tentar primeiro o provedor Santander e usar o Pix local como contingência automática.

## Busca de clientes

- procura em qualquer parte do nome;
- aceita palavras em qualquer ordem;
- ignora maiúsculas, minúsculas, acentos, cedilha e espaços extras;
- impede duplicidade exata após normalização;
- carrega os clientes uma vez e pesquisa localmente no navegador.

Exemplos que encontram `LOJA RAQUEL MODA`:

- `raquel`
- `moda`
- `raquel moda`
- `moda raquel`

## Modos de operação

### Homologação local

Quando a URL do Apps Script está vazia, clientes, movimentos e fechamentos ficam no `localStorage` do navegador. Esse modo permite validar o fluxo e o layout sem tocar em produção.

### Conectado

Ao informar a URL do novo Web App em Configurações, o frontend usa o backend em `apps-script/caixa-avista`.

## Pix com provedor automático

A configuração interna usa:

```json
{
  "pixProvider": "auto",
  "pixApiBase": "/api/santander/pix"
}
```

Com `auto`, o frontend:

1. tenta criar a cobrança dinâmica no Worker Santander;
2. recebe `txid`, Pix Copia e Cola e status;
3. salva o lançamento imediatamente com o mesmo identificador;
4. consulta o status enquanto o QR Code está ativo;
5. atualiza o lançamento quando o webhook ou a consulta confirmar o pagamento;
6. usa a geração local se o Worker ainda estiver desativado ou indisponível.

O fallback local continua usando chave, nome e cidade configurados no Apps Script ou na tela de homologação.

## Status Pix

- `CRIANDO`
- `ATIVA`
- `PENDENTE`
- `CONFIRMADO`
- `EXPIRADO`
- `CANCELADO`
- `ERRO`

O fechamento operacional fica bloqueado enquanto houver Pix diferente de `CONFIRMADO`.

## Cloudflare

O frontend está no Cloudflare Pages.

As rotas `/api/santander/pix/*` são atendidas por uma Pages Function em:

```text
functions/api/santander/pix/[[path]].js
```

Ela encaminha as requisições ao Worker dedicado pelo Service Binding:

```text
SANTANDER_PIX_SERVICE
```

Apenas essas rotas invocam Pages Functions, conforme `frontend/_routes.json`.

## Arquivos principais

- `index.html`: estrutura da interface;
- `styles.css`: design mobile-first;
- `app.js`: carregador dos módulos;
- `app-pix-provider.js`: Santander, fallback local e consulta automática;
- `app-sales-pix.js`: fluxo do atendimento Pix;
- `app-repository.js`: persistência local ou Apps Script;
- `manifest.webmanifest`: instalação como aplicativo;
- `sw.js`: cache da rota e dos módulos.

## Dependência visual do QR Code

A V1 usa `qrcodejs` pelo jsDelivr. O Pix Copia e Cola continua disponível caso a biblioteca visual não carregue. Antes da publicação definitiva, a biblioteca pode ser versionada localmente para eliminar a dependência externa.

## Testes já executados

- validação sintática de todos os módulos;
- normalização de acentos e cedilha;
- valor Pix embutido no fallback local;
- CRC16 do BR Code local;
- importação em lote;
- resumo de receitas, despesas, saldo e Pix pendente;
- criação do adaptador Santander sem credenciais no frontend;
- atualização automática por `txid` e `e2eid`;
- bloqueio do fechamento com cobrança Pix em aberto.
