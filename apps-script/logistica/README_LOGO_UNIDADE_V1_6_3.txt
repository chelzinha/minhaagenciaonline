Backend Logística Reversa — logo da unidade v1.6.3

O que foi adicionado:
- Campo UNIDADES.logo_unidade_url.
- createUnidade/updateUnidade aceitam logo_unidade_url.
- getUnitBySlug retorna logo_unidade_url para o app público.
- Migração: migrateReversaLogoUnidadeV163().

Como aplicar:
1. Subir todos os arquivos no Apps Script via clasp.
2. Executar migrateReversaLogoUnidadeV163 uma vez.
3. Implantar nova versão do Web App mantendo a mesma URL /exec.
4. Subir o frontend v1.6.3 no Netlify.
