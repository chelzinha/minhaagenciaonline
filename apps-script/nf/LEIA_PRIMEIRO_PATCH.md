# Backend completo NF-e — DANFE Simplificado 10x15

Este ZIP contém o backend externo completo do extrator de NF-e.

## Publicação

1. Substitua os arquivos do projeto Apps Script externo de NF-e pelos arquivos deste pacote.
2. Preserve ou configure em `00_NFE_CFG.js` a URL do backend principal do APP Minhas Postagens.
3. Antes de produção, configure autenticação e desative `ALLOW_WITHOUT_AUTH_WHEN_UNCONFIGURED`.
4. Salve e publique uma nova versão do Web App externo.

## Patch v1.1.1

Ajustes focados na DANFE A4 importada para geração da DANFE Simplificada 10x15:

- emitente pelo canhoto `RECEBEMOS DE ...`;
- IE do emitente em linha com múltiplas colunas;
- UF do emitente derivada da chave de acesso;
- tipo de operação selecionado;
- proteção contra horário interpretado como IE do destinatário.
