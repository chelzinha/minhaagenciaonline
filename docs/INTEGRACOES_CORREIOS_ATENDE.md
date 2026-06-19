# Integracao Correios Atende

ATENCAO SENSIVEL: esta integracao trabalha com dados pessoais, objetos postais, contratos e informacoes operacionais. Nao registrar tokens, cookies, headers sensiveis ou payload completo fora das abas RAW controladas.

## Escopo

O modulo `apps-script/atende` prepara o backend do `/atende` para importar dois JSONs do Correios Atende:

- JSON de atendimentos/resumo.
- JSON de objetos captados.

O cruzamento e feito por:

- `codigoObjeto`, no JSON de atendimentos.
- `codObjeto` ou `codigoObjeto`, no JSON de objetos captados.

## Fluxo de dados

1. `setupInicial()` cria ou valida a planilha operacional.
2. O JSON de atendimentos cria uma linha base por objeto postal na aba `Postagens`.
3. O JSON de objetos captados enriquece a mesma linha pelo codigo do objeto.
4. O evento de postagem e localizado por `evento.codigo = PO`.
5. Remetente e destinatario sao buscados preferencialmente no evento PO.
6. Dimensoes, peso, contrato, cartao, categoria, previsao e VD sao buscados no objeto captado/coletado.
7. Os JSONs brutos sao preservados em abas RAW.
8. Logs e erros recebem apenas resumos seguros.

## Abas

- `CONFIG`: parametros visiveis e orientacoes, sem segredo.
- `RAW_ATENDIMENTOS`: JSON bruto de atendimentos.
- `RAW_OBJETOS_CAPTADOS`: JSON bruto de objetos captados.
- `Postagens`: base principal usada pelo painel.
- `EVENTOS_OBJETOS`: eventos encontrados nos objetos captados.
- `LOG_IMPORTACOES`: resumo de importacoes.
- `ERROS`: erros sanitizados.

## Endpoint do painel

O Web App preserva o comportamento atual:

- `doGet()` sem query retorna o HTML.
- `buscarDados()` retorna dados para `google.script.run`.

Consulta futura por endpoint:

- `GET ?action=dados`
- `GET ?action=dados&data=2026-06-16`

Resposta esperada:

```json
{
  "ok": true,
  "rows": [],
  "columns": []
}
```

## Endpoint de importacao futura

`doPost(e)` exige `INGEST_TOKEN`.

Tipos previstos:

- `atendimentos`
- `objetos_captados`
- `correios_atende_duplo`

Exemplo conceitual:

```json
{
  "token": "CONFIGURADO_NO_PROPERTIES_SERVICE",
  "tipo": "correios_atende_duplo",
  "atendimentos": {},
  "objetosCaptados": {}
}
```

O token acima e apenas ilustrativo. Token real nunca deve ser salvo no repositorio.

## Regras de seguranca

- `INGEST_TOKEN` deve existir apenas em `PropertiesService`.
- `SPREADSHEET_ID` deve existir em `PropertiesService` quando a planilha ja existir.
- Logs nao devem conter payload completo.
- CPF, CNPJ e telefone devem ser mascarados em mensagens de erro.
- Headers, cookies, Authorization e tokens externos nao devem ser persistidos.

