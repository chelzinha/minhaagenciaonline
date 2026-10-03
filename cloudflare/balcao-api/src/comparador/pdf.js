/* =====================================================
   COMPARADOR - PDF
   Renderiza o HTML do relatorio no Cloudflare Browser Rendering (binding BROWSER).
   Sem o binding, devolve 503 com codigo PDF_INDISPONIVEL e a tela imprime o HTML.
   ===================================================== */
import puppeteer from '@cloudflare/puppeteer';

export async function gerarPdf(env, html) {
  if (!env.BROWSER) throw Object.assign(new Error('Geração de PDF indisponível no servidor.'), { status: 503, code: 'PDF_INDISPONIVEL' });
  let browser;
  try {
    browser = await puppeteer.launch(env.BROWSER);
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0', timeout: 25000 });
    await page.evaluateHandle('document.fonts.ready');
    return await page.pdf({ format: 'A4', printBackground: true, preferCSSPageSize: true, margin: { top: 0, right: 0, bottom: 0, left: 0 } });
  } catch (e) {
    console.error('[COMPARADOR][pdf]', e.stack || e.message);
    throw Object.assign(new Error('Não foi possível gerar o PDF agora. Use a opção Imprimir.'), { status: 503, code: 'PDF_INDISPONIVEL' });
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}
