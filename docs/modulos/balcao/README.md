# Balcão / Calculadora à vista

**Module ID:** `balcao`
**Rota:** `/balcao`
**Frontend:** `frontend/balcao`
**Backend:** Worker `agf-balcao-api` (`cloudflare/balcao-api`), banco D1 `agf-balcao`
**Backend anterior (desativado no front, mantido no repo):** Apps Script `apps-script/etiquetas/2x_BALCAO_*`
**Dados sensíveis:** SIM (endereços e dados da ficha)

## 1. Finalidade

Cotar PAC à vista (04510) e SEDEX à vista (04014) com origem na Região Metropolitana de Fortaleza para qualquer CEP do Brasil e montar a ficha de endereçamento de balcão (sem SRO).

## 2. Dois caminhos separados

| | Preço | Prazo |
|---|---|---|
| Código | `src/preco/preco-avista.js` | `src/prazo/prazo-correios.js` |
| Fonte | Tabelas à vista no D1 | API Prazo dos Correios |
| Internet | Nunca | Só o endereço de prazo |
| Credencial do contrato | Sem acesso | Sim |

- A API de preço dos Correios é proibida: o contrato tem preço diferente do balcão.
- `src/correios/cliente-correios.js` só aceita os endereços de token, prazo e CEP.
- `test/separacao.test.mjs` falha se aparecer endereço de preço ou import cruzado.
- Se o prazo falhar, a cotação sai com o preço e "Confirmar no SARA".

## 3. Fonte dos dados

Pasta do Drive `02 - Tarifas e Tabelas de Preços\FONTE_D1_BALCAO_A_VISTA` (LEIA-ME com a regra de cálculo e o passo a passo do reajuste anual). Migrations `0001` e `0002` são cópias do schema e da carga dessa pasta.

## 4. Configuração

- Segredos do Worker: `CORREIOS_USUARIO`, `CORREIOS_CODIGO_ACESSO`, `CORREIOS_CARTAO`.
- Variáveis: `AGF_AUTH_API_URL`, `ALLOWED_ORIGINS`, `CEP_ORIGEM_PADRAO`.
- Acesso: sessão AGF com o app `balcao` (admin sempre).
- Saúde: `GET https://agf-balcao-api.chelzinha.workers.dev/api/balcao/saude`.

## 5. Caches

- Prazo: `balcao_prazo_cache`, 7 dias por serviço + CEP origem + CEP destino.
- CEP: `balcao_cep_cache`, 30 dias (Correios; ViaCEP só se a API dos Correios falhar).
- Tabelas: memória do Worker, 10 minutos.

## 6. Testes

`node test/preco.test.mjs` (513 postagens reais do Atende), `node test/separacao.test.mjs`, `node test/cotacao.test.mjs`.
