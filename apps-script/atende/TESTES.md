# TESTES - Backend Atende

## Setup

1. Abra o projeto Apps Script do Atende.
2. Configure `SPREADSHEET_ID`, se quiser usar uma planilha existente.
3. Configure `INGEST_TOKEN` antes de testar `doPost`.
4. Execute `setupInicial()`.
5. Confirme que as abas esperadas foram criadas.

## Front atual

1. Abra o Web App atual do `/atende`.
2. Confirme que a tabela carrega sem erro.
3. Clique em atualizar.
4. Confirme que o link da planilha abre corretamente.

## Importacao manual

1. Cole o JSON de atendimentos no bloco "JSON de atendimento".
2. Clique em "Enriquecer".
3. Confirme uma linha por item de atendimento na aba `Postagens`.
4. Cole o JSON de objetos captados no bloco "JSON de postagem".
5. Clique em "Processar".
6. Confirme enriquecimento por `Objeto`.
7. Reimporte os mesmos JSONs e confirme que nao duplica linhas.

## Dados esperados

1. `codigo` e `descricao` devem vir do item do atendimento.
2. `tipo` e `formaPagamento` devem vir do atendimento.
3. Remetente e destinatario devem vir do evento `PO`, quando existir.
4. `Peso`, dimensoes, `Contrato`, `Cartão Postagem`, `Categoria`, `Prev. Entrega` e `VD` devem vir do objeto captado/coletado.

## Endpoint

1. Acesse o Web App sem query string e confirme que o HTML abre.
2. Acesse com `?action=dados&data=2026-06-16`.
3. Confirme retorno JSON com `ok`, `rows` e `columns`.
4. Envie `doPost` sem token e confirme erro seguro.
5. Envie `doPost` com token correto e payload de teste.

## Seguranca

1. Confirme que `LOG_IMPORTACOES` nao salva payload completo.
2. Confirme que `ERROS` mascara CPF/CNPJ/telefone quando aparecerem em mensagens.
3. Confirme que os JSONs brutos ficam apenas nas abas RAW.
4. Confirme que nenhum token real foi salvo no codigo.
