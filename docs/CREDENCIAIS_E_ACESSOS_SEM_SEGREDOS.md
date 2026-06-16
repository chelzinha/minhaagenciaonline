# Credenciais e acessos sem segredos

Este documento registra quais modulos usam credenciais, tokens, permissoes ou acessos sensiveis, sem expor valores reais.

Objetivo: manter rastreabilidade tecnica e facilitar manutencao futura sem registrar senha, token, chave, secret ou dado privado.

## 1. Regra principal

Nunca registrar neste arquivo:

- token real
- senha real
- chave de API
- client_secret
- private_key
- cookie
- codigo de acesso
- URL privada completa com identificador sensivel
- dados reais de cliente

Registrar apenas:

- modulo
- tipo de credencial
- onde deve ficar armazenada
- arquivo ou area que usa a credencial
- risco principal
- como testar sem expor segredo
- status de confirmacao

## 2. Mapa inicial por modulo

| Modulo | Tipo de credencial/acesso | Onde deve ficar | Arquivos provaveis | Status | Observacao |
|---|---|---|---|---|---|
| autenticacao | permissoes, usuarios, perfis | PropertiesService ou planilha controlada | apps-script/autenticacao | pendente | Confirmar modelo atual de permissao |
| logistica | acesso a planilhas e Web App | Apps Script / planilha protegida | apps-script/logistica | pendente | Confirmar deployments ativos |
| etiquetas | token CWS/Correios, acesso a planilhas | PropertiesService | apps-script/etiquetas | pendente | Nao expor token CWS no GitHub ou frontend |
| nuvemshop | OAuth, token, webhook | PropertiesService | apps-script/nuvemshop | pendente | Nao expor token nem client_secret |
| nf | acesso a PDFs, Drive e dados fiscais | Apps Script / Drive controlado | apps-script/nf | pendente | PDFs podem conter dados fiscais e pessoais |
| cep | provedores de CEP, cache, possivel API externa | PropertiesService se houver chave | apps-script/cep | pendente | Confirmar se usa API com chave |
| caixa | acesso a dados operacionais/financeiros | confirmar | apps-script/caixa | pendente | Confirmar escopo e sensibilidade |
| sla | acesso a regras ou dados operacionais | confirmar | apps-script/sla | pendente | Confirmar uso atual |
| atende | acesso a dados de atendimento | confirmar | apps-script/atende | pendente | Confirmar se ha dados pessoais |
| base-metro | acesso a base de clientes | planilha protegida | apps-script/base-metro | pendente | Dados cadastrais exigem cuidado |
| base-cliente-etiquetas | clientes, remetentes, destinatarios | planilha protegida | apps-script/base-cliente-etiquetas | pendente | Evitar duplicidade e exposicao indevida |

## 3. Locais recomendados para credenciais

Preferir:

- PropertiesService do Apps Script
- configuracoes protegidas no ambiente correto
- permissao controlada em planilhas
- acesso restrito no Google Drive
- variaveis de ambiente quando houver backend adequado

Evitar:

- token dentro de arquivo .gs, .js, .html ou .json
- senha em planilha
- chave no frontend
- credencial em README ou documentacao
- logs com payload completo
- print com token visivel

## 4. Checklist de verificacao

Para cada credencial, confirmar:

1. Qual modulo usa.
2. Qual tipo de credencial e.
3. Onde esta armazenada.
4. Se aparece no GitHub.
5. Se aparece no frontend.
6. Se aparece em logs.
7. Quem precisa ter acesso.
8. Como testar sem mostrar segredo.
9. Como trocar ou revogar se necessario.
10. Qual risco se vazar.

## 5. Como testar sem expor segredo

Exemplos seguros:

- gerar etiqueta de teste sem registrar token
- consultar pedido teste sem registrar OAuth
- validar login com usuario teste
- confirmar resposta da API sem colar payload completo
- mascarar CPF, CNPJ, telefone e email nos logs

## 6. Relacao com outros documentos

Este documento deve ser mantido alinhado com:

- docs/SEGURANCA_E_DADOS.md
- docs/REGISTRO_DE_MUDANCAS_SENSIVEIS.md
- docs/MAPA_DE_DADOS.md
- docs/APPS_SCRIPT.md
- CHANGELOG.md

## 7. Status

Documento inicial criado para registrar credenciais, acessos e permissoes sem expor segredos.
