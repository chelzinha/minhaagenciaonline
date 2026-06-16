REVERSO FRONTEND v1.5.1

Ajustes aplicados:
- Ações de lotes padronizadas como ícones: primeiro visualizar, depois imprimir.
- Ação de WhatsApp exibida em Expedição > Postados; fica desabilitada quando o telefone do usuário não estiver cadastrado.
- O envio de e-mail permanece automático após informar o SRO e confirmar a postagem.
- Abas de Expedição com textos maiores e em maiúsculas.
- Ícones inventory_2 substituídos por package_2 em todos os módulos Reverso.
- Collector stats refinado para seguir a linguagem visual do control-strip.
- Filtro de alertas agora é local: não recarrega Dashboard, mapa ou API.
- Dashboard Admin passou a usar getAdminBootstrap: uma única chamada agregada para dados principais.
- Cache da landing versionado para agf-landing-v9.

Deploy:
- Subir este ZIP completo diretamente no projeto Netlify atual.
- Atualizar /reverso-admin/ e /reverso-coleta/ com Ctrl+F5.
