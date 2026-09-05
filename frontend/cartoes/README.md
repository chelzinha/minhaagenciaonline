# Padrão dos cartões digitais

Este diretório guarda regras compartilhadas para novos cartões digitais.

## Preview ao compartilhar

Todos os cartões devem usar o mesmo thumbnail institucional dos Correios ao serem compartilhados no WhatsApp, redes sociais e mensageiros.

Imagem padrão:

```html
<meta property="og:image" content="https://www.minhaagenciaonline.com.br/assets/og-whatsapp-correios-v2.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="1200">
<meta property="og:image:type" content="image/png">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:image" content="https://www.minhaagenciaonline.com.br/assets/og-whatsapp-correios-v2.png">
```

Não usar foto pessoal do funcionário em `og:image`.

O arquivo `preview-meta.html` contém o bloco padrão para consulta ao criar novos cartões.

## Cabeçalho e ícones

Todos os cartões devem incluir, após o CSS local:

```html
<link rel="stylesheet" href="/cartoes/card-ui.css">
```

O arquivo `card-ui.css` define:
- topo somente com o símbolo dos Correios centralizado;
- remoção de slogan e texto extra no cabeçalho;
- respiro interno dos SVGs;
- `overflow: visible` para evitar cortes nas bordas dos ícones;
- `stroke-linecap` e `stroke-linejoin` arredondados para acabamento consistente;
- altura compacta dos 6 botões;
- ícone do WhatsApp com balão e telefone visualmente separados;
- seção visual do QR Code.

## Telefones e WhatsApp

Todo número exibido na área de contato deve usar o padrão:

```text
+55 85 92002-3386 | WhatsApp
```

Quando o número tiver WhatsApp, a própria linha do contato deve apontar para `https://wa.me/55...`.

## QR Code do cartão

Todos os cartões devem exibir um QR Code visível logo abaixo dos 6 botões de ação e antes da seção `Contato`.

Padrão da seção:
- título: `Meu QR Code`;
- texto: `Escaneie para abrir este cartão digital e salvar o contato.`;
- arquivo da imagem dentro da pasta do cartão: `qr-card.png`;
- o QR deve apontar para a URL canônica do próprio cartão, por exemplo `https://www.minhaagenciaonline.com.br/emanuelly`;
- não usar o vCard diretamente como conteúdo do QR principal.

O `app.js` de cada cartão injeta a seção após `.action-grid`. Ao criar um novo cartão, copiar esse mesmo comportamento e gerar um novo `qr-card.png` para a URL daquele funcionário.

## Chips de Serviços

Todos os cartões devem manter os chips de serviços em uma única linha, inclusive no mobile.

Para novos cartões, incluir após o CSS local:

```html
<link rel="stylesheet" href="/cartoes/card-services.css">
```

O arquivo `card-services.css` define:
- `flex-wrap: nowrap`;
- tipografia responsiva;
- espaçamento responsivo;
- `white-space: nowrap` nos chips;
- largura total sem rolagem horizontal.

Padrão atual de serviços:
- Postagens
- Coleta gratuita
- SEDEX
- PAC
- Logística

Os cartões existentes `/rachel`, `/emanuelly` e `/emerson` seguem os padrões compartilhados de preview, cabeçalho, ícones, contatos, chips de serviços e QR Code.
