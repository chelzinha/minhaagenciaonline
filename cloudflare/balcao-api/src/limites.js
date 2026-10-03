/* =====================================================
   LIMITE DE USO DAS ROTAS PÚBLICAS (/postar)
   Contagem por IP (guardado só como hash) em janelas de 1 hora no D1.
   Os limites são altos porque vários clientes saem pelo mesmo Wi-Fi da agência.
   ===================================================== */

export const LIMITES_HORA = { cep: 600, cotar: 300, salvar: 120 };
const JANELA_MS = 60 * 60 * 1000;

export async function hashIp(request, env) {
  const ip = request.headers.get('CF-Connecting-IP') || 'sem-ip';
  const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('agf-balcao|' + (env.IP_SALT || 'agf') + '|' + ip));
  return [...new Uint8Array(b)].slice(0, 12).map((x) => x.toString(16).padStart(2, '0')).join('');
}

/** Soma 1 no contador e recusa (429) quando passa do limite. Falha do contador não bloqueia o cliente. */
export async function conferirLimite(env, acao, ipHash) {
  const limite = LIMITES_HORA[acao];
  if (!limite) return;
  const janela = Math.floor(Date.now() / JANELA_MS);
  const chave = acao + ':' + ipHash + ':' + janela;
  let r;
  try {
    r = await env.DB.prepare(`INSERT INTO balcao_limites (chave, contagem, expira_em) VALUES (?1, 1, ?2)
      ON CONFLICT(chave) DO UPDATE SET contagem = contagem + 1 RETURNING contagem`)
      .bind(chave, (janela + 2) * JANELA_MS).first();
  } catch (e) { console.warn('[BALCAO][limite] contador indisponivel:', e.message); return; }
  if (r && Number(r.contagem) > limite) {
    throw Object.assign(new Error('Muitas tentativas seguidas. Aguarde alguns minutos ou fale com o atendente.'), { status: 429 });
  }
}
