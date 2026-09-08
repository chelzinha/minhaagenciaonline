# Dashboard Atende - Inteligência Gerencial V5

## Objetivo

Transformar o Dashboard V4 de uma visão predominantemente descritiva em uma ferramenta de decisão: mostrar onde está o faturamento, quanto ainda cabe crescer dentro dos degraus contratuais, qual ação comercial tem maior retorno e como conferir a remuneração de postagem.

A implementação mantém o Dashboard V4 como base e adiciona `DashboardIntelligenceV5.html` como camada complementar. Isso preserva rollback simples e reduz risco de regressão.

## Melhorias visuais

- Gráficos de rosca de Local, Tipo de Serviço e Canal são substituídos por barras horizontais.
- Cada linha mostra nome, valor completo em R$ e participação percentual.
- Valores como `R$ 1,2 mi` deixam de ser usados nos blocos substituídos; o valor completo é exibido.
- Histórico de seis meses passa a mostrar valor mensal completo ao lado da barra.
- Rankings de Serviços e Clientes Portal passam a mostrar valor completo em R$ + participação.
- Realizado x Meta x Projeção do Comercial passa a usar valores completos.

## Inteligência de degraus

Na aba Gestão são adicionados dois blocos: Mensageria R2 G1 e Encomendas R2 G2.

Cada bloco informa:

- degrau atual;
- percentual marginal atual;
- faturamento elegível;
- teto do degrau;
- quanto ainda cabe até o teto;
- remuneração adicional possível dentro do espaço restante;
- projeção de fechamento quando os dias úteis do mês estão cadastrados;
- indicação se a projeção mantém ou altera o degrau.

As escadas e ajustes usados são os do Contrato AGF Tipo 12, Anexo 3, vigência 17/11/2025, na configuração já adotada pelo Dashboard V4.

## Retorno marginal

A Gestão mostra quanto os próximos R$ 1.000 de faturamento deixam para a agência nas duas linhas R2, com base no percentual do degrau atual.

O indicador é marginal: não substitui o cálculo completo da remuneração, que também contém o ajuste do degrau.

## Potencial de embalagens

O antigo card `Oportunidade de embalagem` passa a ser `Potencial de venda de embalagens`.

São exibidos:

- conversão atual de encomendas em embalagem;
- quantidade de embalagens vendidas;
- frequência `1 a cada X encomendas`;
- retorno atual estimado;
- cenários de conversão de 3%, 5%, 10% e 20%;
- quantidade alvo;
- unidades adicionais necessárias;
- ganho adicional estimado;
- tempo adicional estimado.

Premissas usadas para estimativa, derivadas do estudo `PAINEL_COMPLETO_REMUNERAÇÃO.pdf`:

- retorno médio de R$ 3,78 por embalagem;
- 1 minuto adicional por embalagem.

Esses dois números são identificados na interface como premissas históricas, e não como medição automática do período atual.

## Concentração

A Gestão calcula concentração por:

- Serviço;
- Cliente Portal.

Indicadores:

- maior item;
- Top 3;
- Top 5.

A classificação textual de concentração usa o Top 3:

- abaixo de 40%: baixa;
- de 40% a menos de 60%: moderada;
- 60% ou mais: alta.

## Visão comercial x visão contratual

A interface mantém separadas duas leituras que não devem ser confundidas:

- `Tipo de Serviço`: classificação comercial;
- `Tabela de Remuneração`: classificação contratual.

Essa separação evita usar segmentos comerciais como base para determinar degrau contratual.

## Eficiência comercial do balcão

A Gestão inclui uma referência histórica de retorno por hora para produtos selecionados.

Valores de referência do estudo 01-07/2026:

- Encomenda de contrato: R$ 413/h;
- Encomenda à vista: R$ 362/h;
- Logística reversa: R$ 325/h;
- Embalagem: R$ 227/h;
- Carnê Baú Jequiti: R$ 225/h;
- Entrega interna: R$ 173/h;
- Exporta Fácil: R$ 58/h;
- Serasa: R$ 20/h;
- Carta avulsa: R$ 18/h.

A interface informa explicitamente que esses tempos são premissas do estudo e não cronometragem do Atende.

## Simulador `E se crescer?`

Permite informar um faturamento adicional e simular:

- Encomendas R2 G2;
- Mensageria R2 G1;
- R5 Postagem Industrial.

Para R2, a simulação recalcula:

- degrau antes;
- degrau depois;
- percentual após eventual mudança de faixa;
- ajuste contratual correspondente;
- remuneração incremental.

Para R5 é usada a referência de 8,52%, com aviso de que o enquadramento só deve ser usado quando contratualmente aplicável.

## Conferência ECT

A Gestão inclui uma conferência manual do valor pago pela ECT.

O dashboard já calcula:

`Remuneração = faturamento x percentual do degrau + ajuste`

O usuário pode informar os valores pagos pela ECT para Mensageria e Encomendas. A tela compara o valor informado com o cálculo do dashboard e sinaliza diferenças absolutas acima de R$ 0,02.

Os valores informados nessa conferência não são persistidos pelo V5.

## Segurança

- O V5 continua consumindo `ATENDE_buscarDashboardV4D1`.
- A remuneração permanece protegida no backend e só é devolvida para perfis autorizados.
- A camada V5 não adiciona token, segredo ou credencial ao frontend.
- O Dashboard V4 continua disponível como base de rollback.

## Arquivos

- `apps-script/atende/DashboardTabsV4.html` - base estável.
- `apps-script/atende/DashboardIntelligenceV5.html` - camada de inteligência.
- `apps-script/atende/32_ATENDE_DASHBOARD.gs` - concatena e entrega V4 + V5 ao `Index.html`.

## Publicação

Após atualizar a branch local:

```powershell
cd C:\AGF-Codex\minhaagenciaonline
git pull origin feat/atende-csv-diario
cd apps-script\atende
clasp push
clasp deploy -i <deploymentId-existente> -d "Dashboard V5 - inteligencia gerencial"
```

Reutilizar sempre o deployment existente para preservar a URL pública.