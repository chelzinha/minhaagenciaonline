/* =====================================================
   BUSCA DE CEP (municipio e UF do destino)
   - 1o: cache no D1 (balcao_cep_cache, 30 dias).
   - 2o: API CEP dos Correios (credencial do contrato, so leitura de endereco).
   - 3o: ViaCEP, apenas se a API dos Correios falhar (marcado em "fonte").
   - NAO importa nada de ../preco nem de ../prazo.
   ===================================================== */
import { getCorreios, credenciaisConfiguradas, CORREIOS_BASE } from '../correios/cliente-correios.js';

const CACHE_DIAS = 30;
const limpo = (v) => String(v == null ? '' : v).trim();

function normalizar(cep, d, fonte) {
  const municipio = limpo(d.localidade || d.cidade || d.nomeLocalidade || d.municipio);
  const uf = limpo(d.uf || d.siglaUf || d.estado).toUpperCase();
  const logradouro = limpo(d.logradouro || [d.tipoLogradouro, d.nomeLogradouro].filter(Boolean).join(' '));
  return { cep, uf, municipio, bairro: limpo(d.bairro), logradouro, fonte };
}

async function lerCache(db, cep) {
  try {
    return await db.prepare(`SELECT cep, uf, municipio, bairro, logradouro, fonte FROM balcao_cep_cache
      WHERE cep=?1 AND consultado_em >= datetime('now', ?2)`).bind(cep, '-' + CACHE_DIAS + ' days').first();
  } catch (e) { console.warn('[BALCAO][cep] cache indisponivel:', e.message); return null; }
}

async function gravarCache(db, r) {
  try {
    await db.prepare(`INSERT INTO balcao_cep_cache (cep, uf, municipio, bairro, logradouro, fonte, consultado_em)
      VALUES (?1, ?2, ?3, ?4, ?5, ?6, datetime('now'))
      ON CONFLICT(cep) DO UPDATE SET uf=excluded.uf, municipio=excluded.municipio, bairro=excluded.bairro,
        logradouro=excluded.logradouro, fonte=excluded.fonte, consultado_em=excluded.consultado_em`)
      .bind(r.cep, r.uf, r.municipio, r.bairro, r.logradouro, r.fonte).run();
  } catch (e) { console.warn('[BALCAO][cep] falha ao gravar cache:', e.message); }
}

async function viaCep(cep) {
  const resp = await fetch(`https://viacep.com.br/ws/${cep}/json/`, { signal: AbortSignal.timeout(6000) });
  if (!resp.ok) throw new Error('ViaCEP ' + resp.status);
  const j = await resp.json();
  if (!j || j.erro) throw new Error('CEP não encontrado.');
  return j;
}

/** Endereco do CEP. Lanca erro 404 quando nenhuma fonte encontra o CEP. */
export async function buscarCep(env, cepInformado) {
  const cep = String(cepInformado || '').replace(/\D/g, '');
  if (cep.length !== 8) throw Object.assign(new Error('CEP precisa ter 8 dígitos.'), { status: 422 });

  const hit = await lerCache(env.DB, cep);
  if (hit && hit.uf && hit.municipio) return { ...hit, cache: true };

  const falhas = [];
  if (credenciaisConfiguradas(env)) {
    try {
      const j = await getCorreios(env, `${CORREIOS_BASE}/cep/v2/enderecos/${cep}`);
      const r = normalizar(cep, Array.isArray(j) ? j[0] || {} : j || {}, 'Correios');
      if (r.uf && r.municipio) { await gravarCache(env.DB, r); return r; }
      falhas.push('Correios sem município');
    } catch (e) { falhas.push(e.message); }
  }
  try {
    const r = normalizar(cep, await viaCep(cep), 'ViaCEP');
    if (r.uf && r.municipio) { await gravarCache(env.DB, r); return r; }
  } catch (e) { falhas.push(e.message); }
  console.warn('[BALCAO][cep] nao encontrado', cep, falhas.join(' | '));
  throw Object.assign(new Error('CEP não encontrado. Confira o número.'), { status: 404 });
}
