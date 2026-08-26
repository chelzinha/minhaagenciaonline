# Cartões digitais da equipe

## Objetivo

Disponibilizar páginas públicas individuais para funcionários da agência, acessíveis por QR Code, NFC ou link direto.

Exemplo inicial:

- `/rachel`

## Conteúdo de cada cartão

- Foto e nome.
- Texto comercial curto.
- Download de vCard.
- WhatsApp individual.
- Solicitação de coleta com mensagem pronta.
- Pedido de cotação com mensagem pronta.
- E-mail e telefone.
- Site institucional.
- Uma ou mais unidades vinculadas, com endereço, mapa e WhatsApp.
- Compartilhamento nativo da página.

## Fonte de dados

A base administrativa fica em uma planilha Google separada do repositório público. A planilha contém três abas:

### CONTATOS

Cadastro dos funcionários, com slug, status, nome, cargo opcional, telefone, WhatsApp, e-mail, foto, unidades, textos comerciais, URLs e observação do vCard.

### UNIDADES

Cadastro centralizado das unidades, com código, nome, endereço, CEP, WhatsApp, horário e URL do mapa.

### CONFIG

Configurações institucionais e visuais compartilhadas pelos cartões.

## Segurança

- Não registrar credenciais, tokens ou URLs privadas no frontend.
- Publicar apenas dados profissionais autorizados.
- Manter a planilha de gestão restrita.
- Não expor o ID da planilha no repositório público.

## Implementação inicial

A página da Rachel é estática para permitir validação visual e funcional antes da automação completa. O passo seguinte é conectar o modelo aprovado à base de contatos por um endpoint controlado em Apps Script.
