# Minhas Postagens /app — v21

## Correções sobre a v20
- Corrigido o layout de `.hist-filter-grid`: colunas fluidas, sem sobreposição, com quebra responsiva segura.
- Campo **Valor total da NF** exibido com duas casas decimais em formato brasileiro (`685,00`) nos fluxos Cotação e Etiqueta.
- Importação de NF-e também preenche o valor com duas casas decimais.
- Cache do `/app` atualizado para v21.

## Backend necessário
Publique também o patch backend v21: corrige o resolver de PAC/SEDEX usado quando há Valor Declarado.
