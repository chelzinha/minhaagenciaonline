# Etapa 7B — Etiqueta AGF por overlay do PDF oficial

Novo backend:
- 44_SF_ETIQUETA_AGF_OVERLAY.js

Nova action:
- sfAdminGetAgfLabelOverlayData

A action baixa o PDF oficial salvo em SF_ETIQUETAS.PDF_OFICIAL_URL, retorna a página oficial em base64 para o frontend e informa as coordenadas da área da logo. O frontend renderiza a página 1 via PDF.js e aplica a logo do cliente por cima.

O PDF oficial original não é alterado e permanece como fallback.
