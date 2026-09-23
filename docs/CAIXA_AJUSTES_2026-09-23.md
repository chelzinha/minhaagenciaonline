# Caixa Balcão - ajustes de 23/09/2026

Base: `origin/main` 510f0d2 (merge: libera sangria e consolida fechamento complementar).

## Resumo

1. Pix Infinity habilitado como Pix de maquininha (`pix_mode = MAQUININHA`).
2. Formas de pagamento iguais em Atender, Avulso e Em lote (exceto Pix Santander, que continua só no Atender).
3. Novo painel de formas de pagamento por família (Dinheiro, Pix, Débito, Crédito).
4. Saldo inicial passa a considerar dias sem fechamento.
5. Exclusão em Mov. também depois do fechamento principal, para lançamento ainda não consolidado.
6. Visual "maquininha": visor escuro, teclado grande, ícones, cards de movimento.
7. Confirmação grande das ações (toast com ícone, valor, vibração e bipe).
8. PDFs de fechamento, complemento e sangria com layout AGF (HTML para PDF, com contingência no layout antigo).
9. Grupos de receita ATENDE e SARA (tipos de receita da Biblioteca_Receitas).

## Regras

| Tema | Regra |
|---|---|
| Pix Santander | Sem mudança: QR local, nasce PENDENTE, só Receita > Atender, sem lote. |
| Pix de maquininha | `pix_mode = MAQUININHA`. Nasce CONFIRMADO, provider MAQUININHA, sem QR, aceita Atender/Avulso/Lote. Não altera o dinheiro físico. |
| Lote | O front mostra somente formas com `allow_batch = TRUE` (o backend já recusava as demais). |
| Saldo inicial | Linha do dia em Saldos_Diarios continua sendo a autoridade. Sem linha: carryover do último dia FECHADO + dinheiro dos dias intermediários sem fechamento (receitas DINHEIRO - despesas DINHEIRO - sangrias). Origem gravada: SALDO_ANTERIOR, SALDO_ANTERIOR_SEM_FECHAMENTO, INICIAL_ZERO ou MANUAL. |
| Ajuste manual do saldo inicial | Toque em "Inicial". Somente admin/manager com permissão de fechamento, dia aberto. Grava origem MANUAL. |
| Exclusão | Motivo de 3 a 250 caracteres, exclusão lógica. Permitida antes do fechamento e, depois do fechamento principal, para lançamento sem closure_id. Bloqueada para lançamento consolidado ou já no fluxo do Conta Azul. |
| ATENDE / SARA | Dois tipos de receita por unidade. Categoria do Conta Azul copiada do ATENDIMENTO_BALCAO (ajustável em `CAIXA_AJUSTES_CFG.CATEGORY_OVERRIDES` ou direto na planilha). ATENDIMENTO_BALCAO fica inativo; histórico preservado. |

## Arquivos

Backend (`apps-script/caixa-avista/`): `01_Config_Router.js`, `08_V2_Config_Setup.js`, `09_V2_Library_Entries.js`, `10_V2_Cash_Close.js`, `12_V2_Pdf_Utils.js`, `17_V2_Production_Stabilization.js`, `19_V3_Operations.js`, `21_V3_Fast_Bootstrap.js`, novos `24_CAIXA_Ajustes_20260923.js` e `25_CAIXA_Pdf_Layout.js`.

Frontend: `frontend/caixa/index.html`, `frontend/caixa-avista/app.js`, `app-v2.js`, `v21-safe-patch.js`, `unit-selector.js`, `styles-v2.css`.

## Funções de configuração (editor Apps Script, uma vez)

1. `diagnosticarSaldoInicialV2()`: somente leitura, compara saldo registrado x regra nova.
2. `habilitarPixInfinityCaixaV2()`: faz backup da aba e ativa PIX_INFINITY como MAQUININHA.
3. `configurarGruposReceitaAtendeSaraV2()`: faz backup e cria ATENDE e SARA.
4. `recalcularSaldoInicialHojeV2('SHOPPING_METRO')`: opcional, refaz a linha de hoje (não mexe em dia fechado nem em ajuste MANUAL).
5. `testarLayoutPdfCaixaV2()`: gera um PDF de exemplo na raiz do Drive.

Rollback dos grupos: `reverterGruposReceitaAtendeSaraV2()`.
