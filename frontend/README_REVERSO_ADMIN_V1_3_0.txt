REVERSO ADMIN v1.3.0 — MAPA, CALENDÁRIO E IMPRESSÃO 50x50 MM

ALTERAÇÕES PRINCIPAIS
- Visualização de lote em modal com grade de 5 colunas.
- Visualização e impressão em lote filtram somente etiquetas disponíveis.
- Etiquetas recentes exibem ícones para visualizar e imprimir individualmente.
- Impressão individual e em lote no tamanho final 50 x 50 mm, uma etiqueta por página.
- Chips coloridos para status de etiquetas, lotes e reversas.
- Dashboard com painel Google Maps e agenda semanal de segunda a sexta.
- Geocodificação automática de unidade pelo endereço quando latitude/longitude estiverem vazias.
- Latitude e longitude continuam editáveis manualmente no cadastro da unidade.

CONFIGURAÇÃO OBRIGATÓRIA DO MAPA
Abra:
  reverso-admin/js/config.js

Localize:
  GOOGLE_MAPS_API_KEY: 'COLE_AQUI_SUA_NOVA_CHAVE_GOOGLE_MAPS'

Substitua somente o texto entre aspas pela NOVA chave restrita ao domínio.
Enquanto a chave não for incluída, o restante do painel continua funcionando normalmente.

IMPRESSÃO
- Lote: somente etiquetas com status disponivel.
- Individual: qualquer etiqueta, inclusive já utilizada.
- O navegador abre uma janela preparada para Imprimir / Salvar em PDF.
- O PDF final possui páginas de 50 x 50 mm, uma etiqueta por página.

DEPLOY
Suba este ZIP completo no Netlify como nas versões anteriores.
Depois atualize o navegador com Ctrl + F5.
