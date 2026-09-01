export async function onRequest(context) {
  const service = context.env.SANTANDER_PIX_SERVICE;
  if (!service || typeof service.fetch !== 'function') {
    return Response.json({
      ok: false,
      error: 'Service Binding SANTANDER_PIX_SERVICE não configurado.',
      code: 'PIX_SERVICE_UNAVAILABLE'
    }, { status: 503 });
  }
  return service.fetch(context.request);
}
