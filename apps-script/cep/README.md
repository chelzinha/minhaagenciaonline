# AGF Address Service — Correios API CEP v3

Backend Apps Script separado para consulta centralizada de CEP/endereço usando somente a base oficial dos Correios.

## O que esta versão faz

- Usa a API oficial Busca CEP / API CEP v3 (41) do CWS.
- Mantém o endpoint público documentado no manual: `/cep/v2/enderecos`.
- Não usa ViaCEP, OpenCEP ou BrasilAPI.
- Aceita campo único: CEP ou endereço.
- Trata variações com/sem acento, tipo de logradouro e número informado.
- Busca páginas adicionais quando a API retornar paginação.
- Salva cache em CacheService e, opcionalmente, em planilha.

## Arquivos

- `00_CONFIG.gs` — constantes e chaves de propriedades.
- `01_UTILS.gs` — utilitários.
- `02_CACHE.gs` — cache.
- `03_PROVIDERS.gs` — integração com Correios.
- `04_NORMALIZER.gs` — normalização de retorno.
- `05_API.gs` — Web App, setup e testes.
- `06_CONFIGURAR_CREDENCIAIS_EXEMPLO.gs` — função pronta para preencher credenciais.
- `appsscript.json` — escopos do Apps Script.

## Configuração

1. Copie todos os arquivos `.gs` para um projeto Apps Script novo ou substitua os arquivos do projeto atual.
2. Rode:

```javascript
setupAddressService()
```

3. Preencha as credenciais no arquivo `06_CONFIGURAR_CREDENCIAIS_EXEMPLO.gs`.
4. Rode:

```javascript
configurarCredenciaisCorreiosBuscaCep()
testCorreiosToken()
clearAddressCache()
testCorreiosBuscaMariaTomasiaComoSite()
```

5. Publique como Web App:

- Executar como: Eu
- Acesso: Qualquer pessoa

## Endpoint da API

O manual público chama o produto no CWS de **API CEP v3 (41)**, mas documenta o recurso de endereços como:

```text
/cep/v2/enderecos
```

Por isso o padrão desta versão é:

```text
https://api.correios.com.br/cep/v2/enderecos
```

Se o Swagger da sua conta no CWS mostrar outro endpoint, rode:

```javascript
setCorreiosCepEndpointUrl('https://api.correios.com.br/cep/v3/enderecos')
```

Para voltar ao padrão do manual:

```javascript
resetCorreiosCepEndpointManual()
```

## Testes úteis

```javascript
testCorreiosToken()
testCepFortaleza()
testCorreiosBuscaMariaTomasiaComoSite()
testCorreiosBuscaNacionalMariaTomasia()
testEnderecoMariaTomasiaVariacoes()
debugCorreiosBuscaEndereco('Maria Tomásia')
```

O `debugCorreiosBuscaEndereco` mostra quais variantes foram consultadas e quantos itens cada chamada retornou, sem expor o token.

## Observação

A busca oficial é sensível à forma cadastrada no DNE. Para nomes como `Maria Tomasia`, esta versão tenta primeiro a variante provável `Maria Tomásia`, para aproximar o comportamento da Busca CEP dos Correios.


## Ajuste v6.1 — alinhamento com Swagger CEP v3
- Mantém o produto CEP v3 usando o servidor `https://api.correios.com.br/cep` e o recurso documentado `/v2/enderecos`.
- Remove ordenação forçada `sort=cep,asc` para aproximar mais o comportamento da Busca CEP oficial.
- Aceita `itens` tanto como array quanto como objeto, conforme o schema `PagedModelEnderecoResponse` do Swagger.
- Mantém apenas a API oficial dos Correios, sem ViaCEP/OpenCEP/BrasilAPI.
