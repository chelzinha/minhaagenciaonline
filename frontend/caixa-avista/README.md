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
7. No Pix, gerar QR Code e Pix Copia e Cola com o valor, compartilhar e marcar como confirmado ou pendente.

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

## Pix

A chave Pix, o nome do recebedor e a cidade são lidos do backend. No modo local, podem ser informados na tela de Configurações.

O frontend gera um BR Code estático com:

- chave Pix;
- valor total digitado;
- nome do recebedor;
- cidade;
- TXID `***`.

A geração não confirma o recebimento bancário. O operador registra o Pix como `CONFIRMADO` ou `PENDENTE`.

## Arquivos

- `index.html`: estrutura da interface;
- `styles.css`: design mobile-first;
- `app.js`: regras do atendimento, busca, teclado, Pix, movimentos e fechamento;
- `manifest.webmanifest`: instalação como aplicativo;
- `sw.js`: cache básico da rota.

## Dependência visual do QR Code

A V1 usa `qrcodejs` pelo jsDelivr. O Pix Copia e Cola continua disponível caso a biblioteca visual não carregue. Antes da publicação definitiva, a biblioteca pode ser versionada localmente para eliminar a dependência externa.

## Testes já executados

- validação sintática do JavaScript;
- normalização de acentos e cedilha;
- valor Pix embutido no payload;
- CRC16 do BR Code;
- importação de lote;
- resumo de receitas, despesas, saldo e Pix pendente.
