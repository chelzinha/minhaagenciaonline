PACOTE COMPLETO PARA NETLIFY — REVERSO V1 STATIC CORS FIX

1. Faça upload deste ZIP no mesmo projeto Netlify do domínio minhaagenciaonline.com.br.
2. Não crie pasta manualmente.
3. Não configure variável de ambiente.
4. O módulo novo ficará em /reverso.
5. A API do Apps Script já está configurada em reverso/js/config.js.

Correção aplicada:
- requisições ao Apps Script via POST text/plain com JSON serializado
- sem application/json e sem preflight CORS
- sem Netlify Functions
