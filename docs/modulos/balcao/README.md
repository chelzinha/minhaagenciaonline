# Balcão / Etiquetas

**Module ID:** `balcao`  
**Tipo:** interno operacional  
**Rota:** `/balcao`  
**Frontend:** `frontend/balcao`  
**Backends prováveis:** `apps-script/etiquetas`, `apps-script/cep`, `apps-script/caixa` - vínculo detalhado NÃO CONFIRMADO  
**Dados sensíveis:** SIM

## 1. Finalidade

Apoiar a operação de balcão com geração/visualização de etiquetas e documentos associados, priorizando rapidez de atendimento e impressão correta.

## 2. Regras operacionais

- ajustes de layout não devem alterar dados de postagem;
- impressão/PDF deve respeitar tamanho, margens, fontes e códigos de barras;
- rotinas de CEP e dados do destinatário devem validar entradas antes da emissão;
- falha parcial não deve deixar registros inconsistentes.

## 3. UX/UI

Interface de uso rápido, com poucos passos, botões evidentes, loading e mensagens claras. Como módulo interno, deve convergir para autenticação AGF e shell visual compartilhado.

## 4. Performance

O fluxo de balcão não pode depender de leitura de bases extensas para ações simples. Consultas de CEP/configuração devem ser enxutas e cacheáveis quando seguro.

## 5. Segurança

**Atenção sensível.** Pode manipular nomes, endereços, CEP, documentos, rastreios e dados financeiros. O frontend não deve armazenar segredos.

## 6. Testes mínimos

- abrir módulo e autenticar quando aplicável;
- buscar/preencher CEP;
- gerar etiqueta;
- salvar/imprimir PDF;
- conferir dimensões físicas e legibilidade;
- erro de dados incompletos;
- reabertura sem cache antigo;
- desktop operacional.

## 7. Pendências

- confirmar actions e backends reais;
- mapear planilhas e relação com caixa;
- confirmar rota publicada e autenticação atual;
- registrar padrão físico oficial das etiquetas em documento próprio, se ainda não existir.