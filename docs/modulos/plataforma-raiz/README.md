# Site público AGF

**Module ID:** `plataforma-raiz`  
**Tipo:** público institucional  
**Rota:** `/`  
**Frontend:** `frontend/index.html` + assets e estilos compartilhados  
**Backend:** não obrigatório para a página principal  
**Status de produção:** NÃO CONFIRMADO nesta baseline  
**Dados sensíveis:** não deve conter

## 1. Finalidade

Ser a porta de entrada pública de `minhaagenciaonline.com.br`, apresentando a AGF José Bonifácio, acessos digitais e informações institucionais.

## 2. Acessos confirmados no código

A home aponta para:

- `/app` - App Minhas Postagens;
- `/nuvem` - Conector/Minhas Postagens Nuvemshop;
- `/cep/` - Consulta de CEP;
- `/agf/` - acesso interno.

## 3. UX/UI

A página usa identidade AGF, `agf-ui.css` e componentes compartilhados. Deve permanecer rápida, responsiva e sem dados sensíveis no HTML.

## 4. Integrações

- WhatsApp público da agência.
- Google Maps incorporado para unidades.
- Fontes e assets públicos.

## 5. Segurança

A página principal é pública. Qualquer acesso interno deve redirecionar para fluxo autenticado e nunca depender de URL obscura.

## 6. Testes mínimos

- abrir `/` em desktop e mobile;
- validar cards `/app`, `/nuvem`, `/cep/` e `/agf/`;
- validar links de WhatsApp;
- validar carregamento dos mapas;
- confirmar ausência de scroll horizontal e erros de console.

## 7. Pendências

- confirmar processo de deploy Cloudflare da raiz;
- confirmar política atual de cache/service worker;
- confirmar se `/agf/` permanece como entrada interna oficial ou legado em transição.