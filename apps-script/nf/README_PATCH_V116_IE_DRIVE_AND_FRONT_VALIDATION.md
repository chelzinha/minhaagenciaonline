# Patch v1.1.6 - IE emitente resiliente e validação visual

## Backend
- Adiciona fallback resiliente para IE do emitente quando o Google Drive reorganiza as colunas do PDF.
- Mantém a busca limitada ao bloco do emitente antes de DESTINATÁRIO / REMETENTE.
- Exclui CNPJ, chave, protocolo, barcode, número da NF e resíduos não seguros.
- Prioriza IE numérica próxima ao rótulo INSCRIÇÃO ESTADUAL.

## Frontend
- Corrige falso positivo do validador: campo vazio não pode mais aparecer como Identificado.
- Mantém a visualização com traço somente no layout impresso.
