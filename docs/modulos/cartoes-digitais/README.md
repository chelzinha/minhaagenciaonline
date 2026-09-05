# Cartões Digitais da Equipe

**Module ID:** `cartoes-digitais`  
**Tipo:** público institucional/comercial  
**Rotas:** slugs individuais, exemplo documentado `/rachel`  
**Frontend:** páginas públicas individuais no frontend principal  
**Fonte de dados planejada/documentada:** planilha Google separada  
**Dados sensíveis:** apenas dados profissionais autorizados

## 1. Finalidade

Disponibilizar cartões digitais individuais para funcionários da agência, acessíveis por QR Code, NFC ou link direto.

## 2. Conteúdo previsto

- foto e nome;
- texto comercial curto;
- vCard;
- WhatsApp profissional;
- coleta/cotação com mensagem pronta;
- e-mail e telefone;
- site institucional;
- unidades vinculadas;
- mapa/horário;
- compartilhamento nativo.

## 3. Fonte de dados documentada

Planilha separada com abas:

- `CONTATOS`;
- `UNIDADES`;
- `CONFIG`.

A implementação inicial da página da Rachel é estática; a automação via endpoint Apps Script é uma evolução planejada e não deve ser tratada como concluída sem evidência.

## 4. Segurança

- publicar apenas dados profissionais autorizados;
- manter planilha restrita;
- não expor ID da planilha, tokens ou URLs privadas;
- não transformar dados internos em conteúdo público por padrão.

## 5. UX/UI

Página leve, mobile-first, boa para QR/NFC, botões de toque claros e identidade visual AGF.

## 6. Testes mínimos

- abrir slug público;
- WhatsApp/e-mail/telefone;
- download de vCard;
- mapa/unidades;
- compartilhamento;
- QR/NFC;
- mobile.

## 7. Pendências

- inventariar todos os slugs existentes;
- confirmar se endpoint dinâmico já foi implementado;
- documentar processo de inclusão/desativação de funcionário;
- definir cache da configuração pública.