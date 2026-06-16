# Patch v1.1.4 — IE e campos obrigatórios DANFE Simplificado

## Objetivo
Reforçar o parser para PDFs convertidos pelo Google Drive com colunas linearizadas.

## Correções
- Tipo de operação fixado como SAÍDA conforme regra operacional do projeto.
- CNPJ e UF do emitente priorizados a partir da chave de acesso.
- IE do emitente lida em janela estrita antes de DESTINATÁRIO/REMETENTE.
- IE do destinatário limpa quando contiver horário, data ou texto de pagamento.
- CPF/CNPJ do destinatário reaplicado somente a partir do bloco correspondente.
- Protocolo e barcode do protocolo tratados separadamente.
