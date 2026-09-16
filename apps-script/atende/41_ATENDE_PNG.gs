/**
 * ============================================================
 * ATENDE - PNG COMERCIAL VIA CLOUDFLARE BROWSER RUN
 *
 * Fluxo:
 *
 * navegador
 *   -> google.script.run
 *   -> Apps Script
 *   -> Worker oficial do Atende
 *   -> Cloudflare Browser Run
 *   -> PNG 600x600
 *
 * O navegador nunca recebe o token da API.
 * ============================================================
 */

function ATENDE_renderCommercialPngV1(payload) {
  payload = payload || {};

  const html =
    String(payload.html || '');

  let filename =
    String(
      payload.filename ||
      'resultado-comercial.png'
    );

  if (!html.trim()) {
    throw new Error(
      'HTML do card comercial nao informado.'
    );
  }

  if (html.length > 500000) {
    throw new Error(
      'HTML do card comercial excede o limite permitido.'
    );
  }

  filename =
    filename
      .replace(
        /[^a-zA-Z0-9._-]+/g,
        '-'
      )
      .replace(
        /-+/g,
        '-'
      );

  if (!/\.png$/i.test(filename)) {
    filename += '.png';
  }

  /*
   * Usa exatamente a mesma configuracao oficial
   * ja utilizada pelo restante do Atende.
   *
   * Script Properties:
   * ATENDE_D1_API_URL
   * ATENDE_D1_API_TOKEN
   */
  const cfg =
    ATENDE_getD1Config_();

  const response =
    UrlFetchApp.fetch(
      cfg.apiUrl +
        '/render-commercial-png',
      {
        method: 'post',

        contentType:
          'application/json; charset=utf-8',

        headers: {
          Authorization:
            'Bearer ' +
            cfg.token
        },

        payload:
          JSON.stringify({
            html: html
          }),

        muteHttpExceptions: true,
        followRedirects: true
      }
    );

  const code =
    response.getResponseCode();

  if (
    code < 200 ||
    code >= 300
  ) {
    throw new Error(
      'PNG API HTTP ' +
      code +
      ': ' +
      response
        .getContentText()
        .slice(
          0,
          1000
        )
    );
  }

  const blob =
    response.getBlob();

  const bytes =
    blob.getBytes();

  if (
    !bytes ||
    bytes.length < 24
  ) {
    throw new Error(
      'Browser Run retornou um arquivo invalido.'
    );
  }

  const signature =
    bytes
      .slice(
        0,
        8
      )
      .map(
        function(value) {
          return value & 255;
        }
      )
      .join(',');

  if (
    signature !==
    '137,80,78,71,13,10,26,10'
  ) {
    throw new Error(
      'Browser Run nao retornou um PNG valido.'
    );
  }

  return {
    ok: true,

    filename:
      filename,

    mimeType:
      'image/png',

    base64:
      Utilities.base64Encode(
        bytes
      )
  };
}