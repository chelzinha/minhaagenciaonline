# APP Minhas Postagens — Release DESTINATÁRIOS v1

## Entrega
- Nova rota `/app/#/destinatarios`.
- Cadastro manual, edição e exclusão.
- Cadastro automático após importação NF-e.
- Cadastro automático após etiqueta gerada.
- CEP com preenchimento automático e possibilidade de ajuste manual.
- Filtro por UF na aba Destinatários.
- Filtro por UF no Histórico.
- Botão `Enviar por WhatsApp` no Histórico quando houver celular e SRO.
- Navegação inferior adaptada para cinco itens e mobile.

## Publicação
1. Publicar primeiro o backend e gerar nova URL `/exec` da implantação se necessário.
2. Subir este frontend completo no Netlify.
3. Testar em aba anônima para garantir renovação do service worker.
