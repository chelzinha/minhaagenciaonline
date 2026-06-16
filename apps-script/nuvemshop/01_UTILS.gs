function nowIso_() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd'T'HH:mm:ss");
}

function asJson_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function asHtml_(title, message) {
  const html = `
    <html>
      <head>
        <meta charset="utf-8">
        <style>
          body{font-family:Arial,sans-serif;padding:24px;color:#1f2937}
          .box{max-width:680px;margin:0 auto;border:1px solid #e5e7eb;border-radius:12px;padding:24px}
          h1{font-size:22px;margin:0 0 12px}
          p{line-height:1.5}
          code{background:#f3f4f6;padding:2px 6px;border-radius:6px}
        </style>
      </head>
      <body>
        <div class="box">
          <h1>${title}</h1>
          <p>${message}</p>
        </div>
      </body>
    </html>`;
  return HtmlService.createHtmlOutput(html);
}

function getRoute_(e) {
  return ((e && e.parameter && e.parameter.route) || '').trim();
}

function parsePostBody_(e) {
  if (!e || !e.postData || !e.postData.contents) return {};
  try {
    return JSON.parse(e.postData.contents);
  } catch (err) {
    return { raw: e.postData.contents };
  }
}

function stringifySafe_(obj) {
  try {
    return JSON.stringify(obj);
  } catch (err) {
    return String(obj);
  }
}

function qs_(params) {
  const keys = Object.keys(params || {}).filter(function(k) {
    return params[k] !== '' && params[k] !== null && params[k] !== undefined;
  });
  if (!keys.length) return '';
  return '?' + keys.map(function(k) {
    return encodeURIComponent(k) + '=' + encodeURIComponent(params[k]);
  }).join('&');
}
