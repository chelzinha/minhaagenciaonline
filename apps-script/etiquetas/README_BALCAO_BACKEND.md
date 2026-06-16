# Backend — Calculadora Balcão AGF

Este pacote contém o backend completo do App Etiquetas com o módulo novo de **Calculadora Balcão à Vista**.

## O que foi adicionado

Arquivos novos:

- `20_BALCAO_CONFIG.js`
- `21_BALCAO_HELPERS.js`
- `22_BALCAO_PRAZO.js`
- `23_BALCAO_CALCULO.js`

Arquivo alterado:

- `99_ROUTER.js` — adicionadas as actions:
  - `balcaoConfig`
  - `balcaoCep`
  - `balcaoCotar`
  - `balcaoSalvarRascunho`
  - `balcaoListarRascunhos`

## Como ativar

1. Substitua os arquivos do Apps Script por este pacote.
2. Rode uma vez a função:

```javascript
balcaoCriarAbasModelo()
```

Ela cria as abas:

- `BALCAO_CONFIG`
- `BALCAO_SERVICOS`
- `BALCAO_TARIFAS`
- `BALCAO_ADICIONAIS`
- `BALCAO_RASCUNHOS`
- `BALCAO_LOG`

3. Cole/importe as tarifas oficiais normalizadas em `BALCAO_TARIFAS`.

## API Prazo

Para usar API Prazo, rode uma vez:

```javascript
balcaoConfigurarApiPrazo('SEU_IDCORREIOS', 'SUA_SENHA_API_40_CARACTERES', 'SEU_CARTAO_POSTAGEM', 'PRODUCAO')
```

O preço é calculado por tabela. O prazo é consultado pela API Prazo quando essas credenciais estiverem configuradas.

## Estrutura esperada da aba BALCAO_TARIFAS

Cabeçalhos:

`ATIVO | CHAVE_SERVICO | CODIGO_SERVICO | UF_ORIGEM | UF_DESTINO | GRUPO_DESTINO | TRECHO | PESO_MIN_G | PESO_MAX_G | PRECO_BASE | KG_ADICIONAL | OBS`

Exemplo:

`SIM | PAC | 04510 | CE | RJ | BA, PA, MG, RJ | TODOS | 0 | 300 | 34,20 | | CE → RJ até 300g`

## Observação

Este módulo não gera SRO. Ele calcula a cotação e salva um rascunho para alimentar depois a ficha/etiqueta de balcão sem SRO.
