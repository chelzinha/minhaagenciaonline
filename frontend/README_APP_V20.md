# Minhas Postagens /app — v20

## Alterações
- Histórico com filtro mensal (`YYYY-MM`) e botão **Todos os meses**.
- Resumo financeiro do período: quantidade de postagens concluídas, total em R$ e resultados encontrados.
- Impressão principal unificada: etiqueta + DACE em um PDF de 2 páginas quando ambos existem.
- Botões individuais do DACE preservados como fallback.
- Correção do scroll com mouse: removida a regra global `overscroll-behavior-y: contain`, que podia bloquear a rolagem física da página raiz no Chromium.
- Recuperação automática do bloqueio de scroll após loading, modal, erro ou troca de rota.
- Cache do service worker atualizado para `v20`.

## Publicação do frontend
Publique o conteúdo completo deste zip no Netlify, substituindo a versão atual.

## Dependência de PDF
A união dos PDFs é feita no navegador somente quando necessária. O app tenta carregar `pdf-lib@1.17.1` por CDN com fallback entre jsDelivr e cdnjs. Se a biblioteca estiver indisponível, a geração normal e os botões individuais continuam funcionando.
