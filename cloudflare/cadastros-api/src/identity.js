export const SHARED_PORTALS = new Set([
  'BALCAO',
  'GAS SHOPPING METRO',
  'GAS SHOPPING CENTRO FASHION'
]);

export function clean(value) {
  const s = String(value ?? '').trim();
  return /^(null|undefined)$/i.test(s) ? '' : s;
}

// Somente diferenças tipográficas seguras. Pontuação e palavras são preservadas.
export function key(value) {
  return clean(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toUpperCase().replace(/\s+/g, ' ');
}

export function isSharedPortal(portal) {
  return SHARED_PORTALS.has(key(portal));
}

export function resolveIdentity(portal, sender, aliases) {
  const portalNorm = key(portal);
  const senderNorm = key(sender);
  if (!portalNorm) return { customerId: null, resolution: 'PENDING', reason: 'SEM_CLIENTE_PORTAL' };
  if (isSharedPortal(portalNorm)) {
    if (!senderNorm) return { customerId: null, resolution: 'PENDING', reason: 'SEM_REMETENTE' };
    // O alias confirmado do remetente vence; a coincidência exata com um
    // CLIENTE PORTAL direto também identifica o mesmo cliente sem criar alias.
    const customerId = aliases.get(`SENDER:${senderNorm}`) || aliases.get(`PORTAL:${senderNorm}`) || null;
    return { customerId, resolution: customerId ? 'SENDER_ALIAS' : 'PENDING', reason: customerId ? '' : 'REMETENTE_NOVO' };
  }
  const customerId = aliases.get(`PORTAL:${portalNorm}`) || null;
  return { customerId, resolution: customerId ? 'PORTAL' : 'PENDING', reason: customerId ? '' : 'PORTAL_NOVO' };
}
