# Fonte das artes PNG da aba Comercial (Visão 360)

Origem do arquivo `apps-script/atende/DashboardCommercialPngV2.html`. Editar aqui, nunca direto no .html gerado.

## Estrutura
- `balcao/modelo_balcao.html`: modelo base. O primeiro `<style>` é compartilhado com Encomendas e Metrô.
- `encomendas/modelo_encomendas.html`: blocos próprios de Encomendas (andamento, média diária, rodapé).
- `metro/build_metro.py`: Metrô é o modelo do Balcão sem o bloco de percentuais.
- `agf_ico.py`: ícones da biblioteca AGF v1.1 usados nas artes, mais `agf-ico-medalha`.
- `fonts/`: Poppins (prévias locais) e subconjuntos woff2 embutidos no PNG.

## Como regenerar
1. `python gerar_moldes.py` (gera prévias em cada pasta e `moldes.json`).
2. `python gerar_v2.py` (grava `apps-script/atende/DashboardCommercialPngV2.html`).
3. Conferir as prévias `*_LIMPO.png` (requer Node + Playwright: `node check.js` em cada pasta).
4. Publicar com `tools/atende/publicar-png-comercial-v2.ps1`.
