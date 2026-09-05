# Padrão dos cartões digitais

Este diretório guarda regras compartilhadas para novos cartões digitais.

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

Os cartões existentes `/rachel` e `/emanuelly` já possuem o mesmo comportamento aplicado diretamente em seus estilos para não depender de migração estrutural nesta etapa.
