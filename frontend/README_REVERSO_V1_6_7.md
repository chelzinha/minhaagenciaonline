# Reverso v1.6.7

Ajustes no app público `/reverso/`:

- A tela de autenticação agora tenta buscar novamente os dados completos da unidade antes do login.
- O fallback de busca também tenta carregar a unidade a partir do `slug` da URL, mesmo sem unidade salva no localStorage.
- Se `getUnitBySlug` não trouxer a logo, o front tenta complementar com `getUnitStatus` usando `unidade_id`.
- Isso corrige casos em que a tela antes do login ainda mostrava apenas o texto da unidade, mesmo com a logo cadastrada.
- A logo da unidade na Home (`/reverso/#/home`) foi reduzida para ocupar menos espaço no hero.
- Cache/versionamento atualizado para `20260615-reverso-v167`.

Arquivos alterados:

- `reverso/js/screens/auth.js`
- `reverso/styles/screens.css`
- `reverso/index.html`
- `reverso/js/config.js`
- `service-worker.js`
