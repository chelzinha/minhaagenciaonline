# Logística Reversa

**Module ID:** `reverso`  
**Tipo:** cliente externo + operação interna  
**Rotas:** `/reverso`, `/reverso-admin`, `/reverso-coleta`, `/reverso-expedicao`  
**Frontend:** `frontend/reverso*`  
**Backend:** `apps-script/logistica`  
**Autenticação:** compartilhada nas rotas internas; fluxo próprio no usuário externo  
**Dados sensíveis:** SIM

## 1. Finalidade

Gerenciar o ciclo de logística reversa desde o acesso do usuário e recebimento do pacote até coleta, administração e expedição.

## 2. Submódulos

### `/reverso`
Experiência do usuário final para primeiro acesso/login, registro/consulta e entrega do pacote. Prioridade mobile, máscaras, QR Code e mensagens orientativas.

### `/reverso-admin`
Área administrativa para cadastros, unidades, pontos de coleta, etiquetas, status e operação. O código confirma uso de autenticação AGF e `app: 'reverso-admin'`.

### `/reverso-coleta`
Fluxo operacional de coletadores/equipe, com prioridade para leitura rápida, botões grandes e feedback imediato.

### `/reverso-expedicao`
Etapa interna de expedição, fechamento, comunicação e rastreio. O código confirma uso de autenticação AGF e `app: 'reverso-expedicao'`.

## 3. Fluxo conceitual

```text
Usuário registra/identifica devolução
↓
Pacote entra na operação
↓
Admin acompanha estado
↓
Coleta registra movimentação
↓
Expedição fecha/encaminha
↓
Histórico/rastreio/comunicação
```

## 4. Segurança

**Atenção sensível.** Pode envolver CPF, telefone, endereço, etiqueta, rastreio e dados de unidades/clientes parceiros. Actions internas devem validar sessão, perfil, módulo, unidade e ownership quando aplicável.

## 5. UX/UI

- `/reverso` deve continuar mobile-first;
- módulos internos devem convergir para shell AGF;
- mensagens técnicas devem ser traduzidas em orientação clara;
- loading, toast, estados vazios e scanner/leitura precisam de feedback imediato.

## 6. Performance

Não carregar histórico completo ou todas as unidades sem necessidade. Operação de coleta precisa responder rápido em rede móvel.

## 7. Testes mínimos

- primeiro acesso/login;
- leitura manual/QR/etiqueta;
- etiqueta inválida;
- histórico;
- unidade/ponto de coleta;
- admin e permissões;
- coleta;
- expedição;
- duplicidade/mudança de estado;
- mobile e rede lenta.

## 8. Pendências

- mapear planilhas, abas e estados do fluxo;
- documentar actions por submódulo;
- confirmar política de idempotência e locks;
- confirmar status de produção de cada rota;
- classificar separadamente admin/coleta/expedição em M0-M5.