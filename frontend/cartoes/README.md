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
- `stroke-linecap` e `stroke-linejoin` arredondados para acabamento consistente.

## Telefones e WhatsApp

Todo número exibido na área de contato deve usar o padrão:

```text
+55 85 92002-3386 | WhatsApp
```

Quando o número tiver WhatsApp, a própria linha do contato deve apontar para `https://wa.me/55...`.

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

Os cartões existentes `/rachel` e `/emanuelly` já seguem os padrões compartilhados de preview, cabeçalho, ícones, contatos e chips de serviços.
