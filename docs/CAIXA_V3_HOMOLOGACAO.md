# Caixa Balcão V3 - Homologação

## Status

- Branch: `feature/caixa-v3`
- Produção V2 permanece intacta.
- Não promover para `main` antes da homologação completa.
- Backend V3 deve ser publicado em um deployment Apps Script separado durante a homologação.

## Escopo funcional

### Unidade padrão persistente

- A primeira unidade escolhida fica salva no navegador.
- A abertura seguinte envia a unidade lembrada já na primeira consulta ao backend.
- O backend sempre revalida a permissão do usuário atual.
- Se a unidade lembrada não for autorizada para o usuário atual, a preferência é descartada e somente as unidades permitidas são oferecidas.
- `Trocar unidade` apaga a preferência e volta ao seletor.

### Pix pendente

- Pix pendente faz parte da receita do dia.
- Pix pendente não bloqueia o fechamento.
- A baixa do Pix é um controle separado do fechamento.
- Pix fechado em um dia pode ser confirmado posteriormente.
- Após fechamento, somente a transição segura `CRIANDO/ATIVA/PENDENTE -> CONFIRMADO` é permitida.

### Movimentos

- A aba passa a se chamar `Movimentos`.
- Cobrança Pix pendente oferece ação de conferência/baixa.
- Pix pendente de dia anterior permanece visível para controle.
- Um novo lançamento feito depois do fechamento pode ser excluído enquanto ainda não tiver sido incluído em complemento/sincronizado.

### Fechamento

- O campo manual `Dinheiro contado` deixa de ser necessário.
- Marcar `Conferi e contei o numerário` confirma o valor esperado calculado pelo backend.
- O backend não depende do valor contado enviado pelo navegador.
- Pix pendente não impede fechamento.

### Fechamento complementar

Regra central:

> Um dia pode ter um fechamento principal e quantos complementos forem necessários.

Depois do fechamento principal:

1. novos lançamentos continuam permitidos;
2. os lançamentos já sincronizados permanecem consolidados;
3. a tela indica os movimentos ainda não consolidados;
4. `Atualizar fechamento` cria um complemento;
5. somente os lançamentos novos recebem o ID do complemento;
6. somente esses lançamentos entram na nova fila do Conta Azul;
7. lançamentos de fechamentos anteriores nunca são reenfileirados.

Os complementos ficam registrados na aba `Fechamentos_Complementares`.

### Cliente de Balcão

- Em `Receita > Atendimento`, `Cliente de Balcão` é selecionado automaticamente.
- O atendente pode retirar a seleção e buscar outro cliente.
- Após novo atendimento, o padrão pode ser aplicado novamente.

### Virada do dia

- O frontend compara periodicamente a data do navegador no fuso `America/Fortaleza` com a data do snapshot do servidor.
- Ao detectar mudança de dia, recarrega o Caixa para evitar mistura de fechamento/movimentos de datas diferentes.

## Arquivos V3 principais

Backend:

- `apps-script/caixa-avista/19_V3_Operations.js`
- `apps-script/caixa-avista/20_V3_Close_Safe.js`
- `apps-script/caixa-avista/01_Config_Router.js`

Frontend:

- `frontend/caixa-avista/v3-controller.js`
- `frontend/caixa-avista/unit-selector.js`
- `frontend/caixa-avista/app.js`
- `frontend/caixa-avista/sw.js`

## Estratégia segura de homologação

1. `clasp push` atualiza o código-fonte do projeto Apps Script, mas não altera o deployment de produção já fixado.
2. Criar um NOVO deployment Apps Script para V3, sem usar o deployment ID de produção.
3. No navegador de homologação, definir `localStorage.caixa_avista_v3_api_url` com a URL `/exec` desse novo deployment.
4. Publicar a branch V3 no alias Cloudflare de homologação.
5. Executar os testes abaixo.
6. Somente depois criar uma release limpa a partir da `main` e promover os arquivos validados.

## Checklist de homologação

1. Escolher unidade uma vez, recarregar e confirmar entrada automática.
2. Usar `Trocar unidade` e confirmar retorno do seletor.
3. Confirmar título `Movimentos`.
4. Confirmar `Cliente de Balcão` selecionado por padrão em Atendimento.
5. Criar Pix pendente e confirmar que o botão de fechamento continua disponível.
6. Fechar o caixa marcando apenas a declaração de conferência, sem digitar dinheiro contado.
7. Confirmar no Conta Azul que Pix pendente foi enviado como movimento/recebível sem bloquear o fechamento.
8. Em Movimentos, confirmar o Pix depois do fechamento.
9. Criar novo lançamento depois do fechamento.
10. Excluir um novo lançamento ainda não consolidado e confirmar recálculo dos totais.
11. Criar outro novo lançamento e confirmar que aparece `Atualizar fechamento`.
12. Atualizar o fechamento e validar que somente o novo lançamento entrou em `ContaAzul_Fila`.
13. Confirmar ausência de duplicidade das linhas do fechamento original.
14. Conferir nova linha em `Fechamentos_Complementares`.
15. Recarregar e confirmar estado consolidado sem movimentos novos.
16. Revalidar Pix via WhatsApp e página pública.

## Rollback

Durante a homologação, basta:

- não promover a branch V3 para `main`;
- manter o frontend oficial apontando para o código V2;
- manter o deployment Apps Script oficial no deployment ID atual.

O deployment V3 de homologação é independente e pode ser abandonado sem alterar a URL do backend de produção.
