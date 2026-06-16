# Patch v1.1.3 - DANFE Simplificado 10x15

- Tipo de operação assume SAÍDA quando o PDF não preserva o marcador visual.
- CNPJ do emitente derivado prioritariamente da chave de acesso.
- IE do emitente extraída por rótulo com fallback robusto.
- CPF/CNPJ do destinatário prioriza o bloco CNPJ/CPF do destinatário.
- IE do destinatário só aceita candidato numérico isolado; horários e textos de pagamento são descartados.
- Protocolo de autorização prioriza número de 15 dígitos após o rótulo.
- Código de barras do protocolo é extraído separadamente.
- Valor total da NF-e passa a ser campo obrigatório da prévia simplificada.
