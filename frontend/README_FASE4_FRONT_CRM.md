> **Nota Fase 6:** os redirecionamentos temporários documentados abaixo foram removidos. Os links atuais apontam diretamente para `/crm/`.

# Fase 4 — Frontend CRM isolado

## Novo módulo

O portal passa a possuir um módulo independente em:

```text
/crm/
```

Estrutura:

```text
/crm/
├── HOME
├── PROSPECTS
│   ├── Dashboard
│   ├── Funil
│   └── Cadastro
├── CRM
│   ├── Dashboard
│   ├── Funil
│   ├── Clientes
│   └── Ações
└── AGENDA
    ├── Semana
    └── Pendências
```

## Principais recursos

- Kanban dinâmico de prospects e clientes, carregado das configurações do backend.
- Separação entre recomendação automática, etapa da jornada e atividade comercial.
- Botão `+ Agenda` nos cards.
- Agenda Comercial para ligação, WhatsApp, e-mail, visita, reunião e demais tipos parametrizados.
- Filtros por responsável, tipo e status.
- Respeito ao escopo individual de agenda definido em `/agf/usuarios/`.
- Mídias recomendadas com botão clicável para Google Drive quando `MIDIAS_CRM.LINK` está preenchido.
- Permissões por usuário para editar, mover cards, concluir atividades e visualizar indicadores.

## Integração com o portal

- `/agf/` recebe o card CRM.
- `/intra/` mantém um atalho para CRM.
- As abas Clientes e Ações deixam de aparecer no Dashboard Gerencial.
- Os painéis Raio-X de Clientes e Carteira inteligente passam a ser exibidos em `/crm/acoes/`.

## Redirecionamentos temporários

Para evitar quebra por favoritos, cache ou links antigos:

```text
/intra/crm/       → /crm/?view=clientes
/intra/prospects/ → /crm/?view=prospects
/intra/agenda/    → /crm/?view=agenda
```

## Implantação

Publique o conteúdo completo deste ZIP no Netlify.

## Reversão

Republique o pacote anterior do frontend. O backend mantém compatibilidade com a versão anterior.
