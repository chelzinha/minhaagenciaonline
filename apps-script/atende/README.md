# Backend Atende - Correios Atende

ATENCAO SENSIVEL: este Apps Script processa dados pessoais e operacionais de postagens, remetentes e destinatarios. Nao registre tokens, cookies, headers sensiveis ou payload completo em logs.

## Objetivo

O backend do `/atende` importa dois JSONs exportados do Correios Atende:

- JSON de atendimentos/resumo.
- JSON de objetos captados.

Os dados sao cruzados por `codigoObjeto`/`codObjeto` e gravados na aba principal `Postagens`, mantendo os campos usados pelo front atual.

## Abas criadas por `setupInicial()`

- `CONFIG`
- `RAW_ATENDIMENTOS`
- `RAW_OBJETOS_CAPTADOS`
- `Postagens`
- `EVENTOS_OBJETOS`
- `LOG_IMPORTACOES`
- `ERROS`

## Funcoes principais

- `setupInicial()`: cria/valida planilha, abas e cabecalhos.
- `processarAtendimentos(jsonString)`: compatibilidade com o front atual para importar o JSON de atendimentos.
- `processarEBuscar(jsonString)`: compatibilidade com o front atual para importar o JSON de objetos captados.
- `buscarDados()`: retorna linhas e colunas para o painel atual.
- `doGet(e)`: sem `action`, entrega o HTML do painel; com `action=dados`, retorna JSON para consulta por data.
- `doPost(e)`: endpoint protegido por `INGEST_TOKEN` para importacoes futuras.

## Propriedades obrigatorias

Configure em `PropertiesService > Script properties`:

- `SPREADSHEET_ID`: opcional; se nao existir, `setupInicial()` cria uma nova planilha e salva o ID.
- `INGEST_TOKEN`: obrigatorio para `doPost`.

## Contrato da aba Postagens

A aba `Postagens` preserva os campos usados pelo front:

`Data`, `Atendente`, `Objeto`, `codigo`, `descricao`, `Categoria`, `Contrato`, `Cartão Postagem`, `Remetente`, `Rem. Documento`, `Valor`, `Forma Pagamento`, `Peso (kg)`, `Larg. (cm)`, `Comp. (cm)`, `Alt. (cm)`, `Diâm. (cm)`, `VD`, `Formato`, `Rem. CEP`, `Rem. Logradouro`, `Rem. Número`, `Rem. Comp`, `Rem. Bairro`, `Rem. Cidade`, `Rem. UF`, `Rem. Telefone`, `Dest. Nome`, `Dest. Documento`, `Dest. CEP`, `Dest. Logradouro`, `Dest. Número`, `Dest. Complemento`, `Dest. Bairro`, `Dest. Cidade`, `Dest. UF`, `Tipo Postagem`, `Status`, `Prev. Entrega`, `tipo`, `formaPagamento`.

Observacao: os nomes foram mantidos em ASCII no codigo versionado para evitar problemas de encoding no Apps Script. O importador tambem reconhece aliases acentuados em cabecalhos antigos.

## Regras de importacao

- O JSON de atendimentos cria a base por objeto postal.
- Se um atendimento tiver varios itens, o backend gera uma linha por item.
- O JSON de objetos captados enriquece a linha pelo `codObjeto`.
- O evento de postagem usa `evento.codigo = PO`.
- Remetente e destinatario sao buscados preferencialmente no evento PO.
- Dimensoes, peso, contrato, cartao, categoria, previsao e VD sao buscados em `coletado`/objeto captado.
- `Objeto` e a chave anti-duplicidade.
- Reimportacoes atualizam campos preenchiveis em lote.
