# APP Minhas Postagens — DESTINATÁRIOS v1

Implementação isolada sem alteração do fluxo principal de cotação e pré-postagem.

## Backend
- Amplia DESTINATARIOS com preferências e ID estável.
- Migração incremental dos cabeçalhos existentes.
- Actions novas: listarDestinatarios, salvarDestinatario, excluirDestinatario.
- Mantém buscarDestinatarios para autocomplete.
- Salva automaticamente após etiqueta gerada.
- Histórico passa a persistir celular/e-mail e aceita filtro UF.

## Frontend
- Nova rota #/destinatarios e item na navegação inferior.
- Cadastro manual, edição, exclusão, busca e filtro UF.
- Busca CEP oficial via action cep.
- Importação de NF-e chama salvarDestinatario sem bloquear o fluxo em caso de falha auxiliar.
- Histórico: filtro UF e botão Enviar por WhatsApp quando houver celular e SRO.

## Publicação
1. Substituir backend completo e criar nova implantação do Web App.
2. Subir frontend completo no Netlify.
3. Testar em aba anônima para renovar o service worker.
