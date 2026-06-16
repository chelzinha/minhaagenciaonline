# Patch v1.1.8 — fallback controlado de IE por CNPJ do emitente

Correção adicional para DANFEs em que a conversão PDF -> Google Docs/OCR perde totalmente a coluna da Inscrição Estadual do emitente.

## Alteração

- Adicionado fallback controlado `nfeKnownEmitenteIeByCnpj_`.
- O fallback só atua quando a IE do emitente estiver vazia.
- O CNPJ `50.144.817/0001-01` passa a completar IE `071283200`.
- Não sobrescreve IE já extraída.
- Não interfere em destinatário, protocolo, chave, valor ou demais campos fiscais.
