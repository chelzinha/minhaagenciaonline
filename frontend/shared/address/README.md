# AGF Address Front Module

Arquivos compartilhados para consulta de CEP/endereço em qualquer front do domínio.

## Arquivos

- `address-config.js`: URL do backend Apps Script e preferências do módulo.
- `address-client.js`: cliente JS reutilizável.
- `address-widget.css`: estilos reaproveitáveis.

## Configuração obrigatória

Edite `address-config.js`:

```javascript
serviceUrl: "https://script.google.com/macros/s/SEU_DEPLOY_ID/exec"
```

## Uso em qualquer HTML

```html
<link rel="stylesheet" href="/shared/address/address-widget.css">
<script src="/shared/address/address-config.js"></script>
<script src="/shared/address/address-client.js"></script>
```

```javascript
const resultado = await window.AGFAddress.lookup('Rua Maria Tomásia 855 Fortaleza CE');
```

## Observação

O front envia `preferUf` e `preferCidade`, não filtros obrigatórios. Quem decide o escopo da busca é o backend.
