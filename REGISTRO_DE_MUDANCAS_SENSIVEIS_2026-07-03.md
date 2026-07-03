# Registro de mudanças sensíveis - 03/07/2026

Este registro documenta alterações com impacto em segurança e acesso.
Nenhum valor de segredo aparece aqui (política do projeto).

## Gate de autenticação nas APIs (base-metro, caixa, logistica)
- Adicionado arquivo de gate em cada projeto: valida localmente (HMAC) o JWT de sessão emitido pelo projeto AGF_AUTH.
- Depende da Script Property AGF_AUTH_JWT_SECRET, copiada do projeto AGF_AUTH. O valor NUNCA vai para código, log ou documento.
- Comportamento controlado por AGF_API_AUTH_MODE: off | monitor (padrão) | enforce.
- Fluxo público do /reverso permanece aberto (lista de actions públicas em 04_Api.gs). Actions internas passam a exigir sessão.
- Rollback: AGF_API_AUTH_MODE = off.

## SuperFrete - senha de administrador
- Removida a senha fixa 'admin123' do código (30_SF_CFG.js).
- O bootstrap passa a gerar senha inicial aleatória, exibida uma vez no log de execução (31_SF_BOOTSTRAP.js).
- Nova função sfDefinirSenhaAdmin('novaSenha') para trocar a senha pelo editor.
- Ação manual pendente: se o bootstrap antigo já rodou, trocar a senha do admin.

## robots.txt
- Passou a bloquear indexação de todas as rotas internas (crm, caixa, atende, sla, cep, portal, agf, reverso-admin, reverso-coleta, reverso-expedicao, superfrete-admin).

## Higiene de exposição (script f11-higiene-repo.sh)
- Move previews do CRM e READMEs do frontend para fora da pasta publicada.
- Remove a Netlify Function morta reversa.js.
- Ação a revisar: rodar o script e conferir git status antes do commit.

## Pendência de segurança registrada (fora desta entrega)
- Senhas SENHA_APP em texto puro na planilha. Não alteradas agora porque a mesma coluna é lida pelo backend do conector Nuvemshop (pasta congelada por decisão). Fazer o hash junto da rodada do conector.
- Chave Google Maps hardcoded: confirmar restrição por domínio no console Google.
