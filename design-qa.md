# Design QA — Curva ABC

## Escopo

- Componente: tabela mensal da view Curva ABC.
- Referências: `00169de8-66b0-4ed2-bb17-d3e0fb8b09e0.png` e `a1ef5926-2e51-4ea2-ac3e-e360c2672a08.png`.
- Implementação verificada: `https://deploy-preview-28--agfjb.netlify.app/curva/preview.html`.
- Viewport verificado: 1363 × 936.

## Comparação focada

| Elemento | Referência | Implementação verificada |
|---|---|---|
| Crescimento | fundo verde claro e seta para cima | `rgb(217, 245, 227)`, ícone Material Symbols `arrow_drop_up` |
| Queda | fundo vermelho muito claro e seta para baixo | `rgb(253, 232, 232)`, ícone Material Symbols `arrow_drop_down` |
| Estável / parcial | fundo azul claro e sem seta | `rgb(234, 243, 251)`, sem ícone de tendência |
| Sem postagem | vermelho escuro e X branco | `rgb(180, 35, 24)`, ícone Material Symbols `close` branco |
| Cliente novo | chip azul `NOVO` ao lado do nome | `rgb(215, 239, 255)`, texto azul `NOVO` ao lado do nome |
| Filtro | seleção explícita de novos clientes | filtro `Status` com opções `Todos`, `CARTEIRA` e `NOVO` |

## Testes no navegador

- 42 células de crescimento, 28 de queda, 32 estáveis/parciais e 18 sem postagem no recorte filtrado.
- Ao selecionar `NOVO`, foram exibidas 5 linhas e todas continham a tag azul `NOVO`.
- A página não apresentou overflow horizontal global; a tabela mantém rolagem horizontal interna.
- Quantidade e faturamento preservam as duas subcolunas mensais e recebem o mesmo vocabulário visual.
- O mês parcial permanece azul quando possui movimento, evitando classificar uma parcial como queda; zero continua vermelho escuro com X.

## Resultado final

passed

## Complemento - cabeçalho interativo e totalizadores

- As 36 colunas de dados possuem ordenação crescente/decrescente pelo cabeçalho.
- As 36 colunas possuem controle de largura por arraste, duplo clique para restaurar e ajuste por teclado.
- O autoajuste final definiu 48 px para `QTD` e entre 71 px e 82 px para `Valor`, conforme o maior conteúdo de cada mês.
- Nenhuma célula mensal ficou cortada no conjunto sintético validado.
- Os totalizadores ficaram com 78 px para `Total QTD` e 106 px para `Total faturado`.
- `Total QTD` e `Total faturado` aparecem em colunas distintas e alinhadas lado a lado.
- A primeira linha validada exibiu `1.200` objetos e `R$ 85.000,00` em células separadas.
- A página permanece sem overflow horizontal global; somente a tabela usa rolagem horizontal interna.
- A ordenação de cliente foi validada nos dois sentidos: `Cliente sintético 01` em A-Z e `Cliente sintético 42` em Z-A.
