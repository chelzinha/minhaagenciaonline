import baseApp from './ranking-balcao-wrapper.js';

// ============================================================
// ATENDE - PNG VIA CLOUDFLARE BROWSER RUN
//
// Este wrapper e aditivo.
// Somente intercepta:
//   GET  /png-browser-health
//   POST /render-commercial-png
//
// Todo o restante continua delegado ao ranking-balcao-wrapper.
// ============================================================

function authorizedPng(request, env) {
  const pngToken =
    request.headers.get('X-PNG-Render-Token') || '';

  const authorization =
    request.headers.get('Authorization') || '';

  const pngAuthorized =
    !!env.PNG_RENDER_TOKEN &&
    pngToken === env.PNG_RENDER_TOKEN;

  const apiAuthorized =
    !!env.ATENDE_API_TOKEN &&
    authorization === `Bearer ${env.ATENDE_API_TOKEN}`;

  return pngAuthorized || apiAuthorized;
}

function json(data, status = 200) {
  return new Response(
    JSON.stringify(data),
    {
      status,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store'
      }
    }
  );
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (
      request.method === 'GET' &&
      url.pathname === '/png-browser-health'
    ) {
      return json({
        ok: true,
        service: 'atende-png-browser',
        browserBinding: Boolean(env.BROWSER)
      });
    }

    if (
      request.method === 'POST' &&
      url.pathname === '/render-commercial-png'
    ) {
      if (!authorizedPng(request, env)) {
        return json(
          {
            ok: false,
            error: 'unauthorized'
          },
          401
        );
      }

      if (!env.BROWSER) {
        return json(
          {
            ok: false,
            error: 'browser_binding_missing'
          },
          500
        );
      }

      let body;

      try {
        body = await request.json();
      } catch {
        return json(
          {
            ok: false,
            error: 'invalid_json'
          },
          400
        );
      }

      const html =
        String(body?.html || '');

      if (!html.trim()) {
        return json(
          {
            ok: false,
            error: 'html_required'
          },
          400
        );
      }

      if (html.length > 500000) {
        return json(
          {
            ok: false,
            error: 'html_too_large'
          },
          413
        );
      }

      try {
        const screenshot =
          await env.BROWSER.quickAction(
            'screenshot',
            {
              html,
              viewport: {
                width: 600,
                height: 600,
                deviceScaleFactor: 1
              },
              screenshotOptions: {
                fullPage: false,
                omitBackground: false
              },
              gotoOptions: {
                waitUntil: 'networkidle0',
                timeout: 45000
              },
              waitForTimeout: 150
            }
          );

        const headers =
          new Headers(screenshot.headers);

        headers.set(
          'Cache-Control',
          'no-store'
        );

        return new Response(
          screenshot.body,
          {
            status: screenshot.status,
            headers
          }
        );
      } catch (error) {
        console.error(
          'Browser Run screenshot error:',
          error
        );

        return json(
          {
            ok: false,
            error: 'browser_render_failed',
            message:
              error instanceof Error
                ? error.message
                : String(error)
          },
          500
        );
      }
    }

    return baseApp.fetch(
      request,
      env,
      ctx
    );
  }
};