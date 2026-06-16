function htmlToPdfBlob_(html, fileName) {
  return Utilities.newBlob(html, 'text/html', fileName.replace(/\.pdf$/i, '.html')).getAs('application/pdf').setName(fileName);
}

function buildEtiquetaHtml_(client, payload, idRegistro) {
  const fmt = sanitizeText_(payload.formatoEtiqueta).toUpperCase();
  const pageCss = fmt === '10X15'
    ? '@page { size: 100mm 150mm; margin: 8mm; }'
    : '@page { size: A4; margin: 12mm; }';

  return `
  <html>
    <head>
      <meta charset="utf-8">
      <style>
        ${pageCss}
        body { font-family: Arial, sans-serif; color: #002b45; }
        .wrap { border: 2px solid #00416B; padding: 16px; border-radius: 10px; }
        .brand { font-size: 20px; font-weight: 700; margin-bottom: 12px; }
        .tag { display:inline-block; background:#FFD400; color:#00416B; font-weight:700; padding:4px 8px; border-radius:999px; margin-bottom:12px; }
        .grid { display:grid; grid-template-columns: 1fr 1fr; gap: 12px; }
        .box { border:1px solid #c9d6df; border-radius:8px; padding:10px; }
        .ttl { font-size:11px; font-weight:700; color:#6b7d88; text-transform:uppercase; margin-bottom:6px; }
        .val { font-size:14px; line-height:1.4; white-space:pre-wrap; }
        .code { margin-top:16px; font-size:14px; font-weight:700; }
        .note { margin-top:12px; font-size:11px; color:#6b7d88; }
      </style>
    </head>
    <body>
      <div class="wrap">
        <div class="brand">APP Etiquetas</div>
        <div class="tag">PDF-base do MVP</div>
        <div class="grid">
          <div class="box">
            <div class="ttl">Remetente</div>
            <div class="val">${escapeHtml_(client.nomeRemetente)}\n${escapeHtml_(client.endereco)} ${escapeHtml_(client.numero)}\n${escapeHtml_(client.bairro)} - CEP ${escapeHtml_(client.cep)}\nCNPJ/CPF: ${escapeHtml_(client.cnpjCpf)}</div>
          </div>
          <div class="box">
            <div class="ttl">Destinatário</div>
            <div class="val">${escapeHtml_(payload.destinatarioNome)}\n${escapeHtml_(payload.destinatarioEndereco || '')} ${escapeHtml_(payload.destinatarioNumero || '')}\n${escapeHtml_(payload.destinatarioBairro || '')} - ${escapeHtml_(payload.destinatarioCidade)} / ${escapeHtml_(payload.destinatarioUf)}\nCEP ${escapeHtml_(payload.destinatarioCep)}</div>
          </div>
          <div class="box">
            <div class="ttl">Serviço</div>
            <div class="val">${escapeHtml_(payload.servico)}\nFormato: ${escapeHtml_(payload.formatoEtiqueta)}\nTipo: ${escapeHtml_(payload.tipoObjeto)}</div>
          </div>
          <div class="box">
            <div class="ttl">Objeto</div>
            <div class="val">Peso: ${escapeHtml_(payload.pesoG)} g\n${escapeHtml_(payload.comprimentoCm)} x ${escapeHtml_(payload.larguraCm)} x ${escapeHtml_(payload.alturaCm)} cm\nValor declarado: ${escapeHtml_(payload.valorDeclarado || '0')}</div>
          </div>
        </div>
        <div class="code">ID local: ${escapeHtml_(idRegistro)}</div>
        <div class="note">Este PDF é provisório para validar login, formulário, histórico e impressão. O rótulo oficial entra quando ligarmos o CWS.</div>
      </div>
    </body>
  </html>`;
}

function escapeHtml_(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
