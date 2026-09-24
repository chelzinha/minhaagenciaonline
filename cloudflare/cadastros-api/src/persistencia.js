/**
 * Executa o motor sobre o D1 e grava o resultado de forma idempotente.
 * Entrada: grafias agregadas de cid_postagens + decisoes humanas + planilha legada.
 * Saida:   cid_clientes, cid_nos, cid_grafias, cid_sugestoes, cid_ids_fundidos, cid_resumo.
 */
import { executarMotor, MOTOR_VERSAO, analisarNome, nomeExibicao } from './motor.js';

const LOTE = 90;

export async function hashId(prefixo, texto) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texto));
  return prefixo + [...new Uint8Array(bytes)].slice(0, 8).map((b) => b.toString(16).padStart(2, '0')).join('').toUpperCase();
}

export async function emLotes(db, stmts) {
  for (let i = 0; i < stmts.length; i += LOTE) await db.batch(stmts.slice(i, i + LOTE));
}

async function carregarEntrada(db) {
  const [nomes, decisoes, planilha, nosAtuais, clientesAtuais, locaisDec] = await db.batch([
    db.prepare(`SELECT origem, grafia, COUNT(*) postagens, ROUND(SUM(valor), 2) valor,
        SUM(local_codigo = 'AGF') l_agf, SUM(local_codigo = 'BALCAO') l_balcao, SUM(local_codigo = 'METRO') l_metro,
        SUM(CASE WHEN local_codigo = 'AGF' THEN valor ELSE 0 END) v_agf, SUM(CASE WHEN local_codigo = 'BALCAO' THEN valor ELSE 0 END) v_balcao,
        SUM(CASE WHEN local_codigo = 'METRO' THEN valor ELSE 0 END) v_metro
      FROM cid_postagens WHERE origem <> 'SEM_PORTAL' GROUP BY origem, grafia`),
    db.prepare(`SELECT id, tipo, chave_a, chave_b, valor, autor, criado_em FROM cid_decisoes WHERE ativo = 1 ORDER BY id`),
    db.prepare(`SELECT grafia, nome_manual FROM cid_planilha_legado`),
    db.prepare(`SELECT chave, cliente_id, regra FROM cid_nos`),
    db.prepare(`SELECT id, nome, fonte_nome, portal_chave, local_carteira, local_fonte FROM cid_clientes`),
    db.prepare(`SELECT chave, local, em FROM cid_local_decisoes`),
  ]);
  return {
    nomes: (nomes.results || []).map((r) => ({ origem: r.origem, nome: r.grafia, postagens: r.postagens, valor: r.valor })),
    decisoes: decisoes.results || [],
    planilha: (planilha.results || []).map((r) => [r.grafia, r.nome_manual]),
    nosAtuais: new Map((nosAtuais.results || []).map((r) => [r.chave, r])),
    clientesAtuais: new Map((clientesAtuais.results || []).map((r) => [r.id, r])),
    locaisPorGrafia: new Map((nomes.results || []).map((r) => [`${r.origem}\u0001${r.grafia}`, { AGF: r.l_agf || 0, BALCAO: r.l_balcao || 0, METRO: r.l_metro || 0, vAGF: r.v_agf || 0, vBALCAO: r.v_balcao || 0, vMETRO: r.v_metro || 0 }])),
    localDecisoes: new Map((locaisDec.results || []).map((r) => [r.chave, r])),
  };
}

function regraPorNo(resultado) {
  const regra = new Map();
  for (const l of resultado.log) {
    if (l.bloqueado) continue;
    if (!regra.has(l.b)) regra.set(l.b, l.regra);
    if (!regra.has(l.a)) regra.set(l.a, l.regra);
  }
  return regra;
}

export async function executarMotorD1(env, autor = 'SISTEMA') {
  const db = env.DB;
  const t0 = Date.now();
  const entrada = await carregarEntrada(db);
  const unir = [], separar = [], nomeManual = new Map();
  for (const d of entrada.decisoes) {
    if (d.tipo === 'UNIR') unir.push([d.chave_a, d.chave_b]);
    else if (d.tipo === 'SEPARAR') separar.push([d.chave_a, d.chave_b]);
    else if (d.tipo === 'NOME') nomeManual.set(d.chave_a, { valor: d.valor, id: d.id });
  }
  const r = executarMotor(entrada.nomes, { unir, separar, planilha: entrada.planilha });
  const planilhaPorNo = new Map();
  for (const [grafia, manual] of entrada.planilha) {
    const k = 'S:' + analisarNome(grafia).core;
    if (r.nos.has(k) && !planilhaPorNo.has(k)) planilhaPorNo.set(k, manual);
  }
  const regra = regraPorNo(r);

  // ---- IDs estaveis por grupo
  const postagensNo = (k) => r.nos.get(k)?.postagens || 0;
  const grupos = [];
  for (const g of r.grupos) {
    let id = null;
    if (g.portal) id = await hashId('CLI_P', g.portal);
    grupos.push({ ...g, id, votos: new Map() });
  }
  // voto por ID antigo (pelo volume de postagens dos nos que ja apontavam para ele)
  for (const g of grupos) {
    for (const k of g.chaves) {
      const antigo = entrada.nosAtuais.get(k)?.cliente_id;
      if (antigo) g.votos.set(antigo, (g.votos.get(antigo) || 0) + postagensNo(k) + 1);
    }
  }
  const idUsado = new Set(grupos.filter((g) => g.id).map((g) => g.id));
  const ordem = grupos.filter((g) => !g.id).sort((a, b) => b.chaves.reduce((s, k) => s + postagensNo(k), 0) - a.chaves.reduce((s, k) => s + postagensNo(k), 0));
  for (const g of ordem) {
    const candidatos = [...g.votos.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id).filter((id) => !id.startsWith('CLI_P'));
    g.id = candidatos.find((id) => !idUsado.has(id)) || null;
    if (!g.id) g.id = await hashId('CLI_', [...g.chaves].sort()[0]);
    let n = 1;
    while (idUsado.has(g.id)) g.id = await hashId('CLI_', [...g.chaves].sort()[0] + '#' + n++);
    idUsado.add(g.id);
  }

  // ---- nome final: decisao manual > Portal > mais completo
  for (const g of grupos) {
    let manual = null;                                     // a decisao de nome mais recente do grupo vence
    for (const k of g.chaves) { const d = nomeManual.get(k); if (d && (!manual || d.id > manual.id)) manual = d; }
    if (manual && !g.portal) { g.nomeFinal = manual.valor; g.fonteFinal = 'MANUAL'; continue; }
    g.nomeFinal = g.nome; g.fonteFinal = g.fonteNome;
    if (g.portal) continue;
    // nome corrigido a mao na planilha antiga, se for pelo menos tao completo quanto o escolhido
    const palavras = (x) => analisarNome(x).core.split(' ').filter(Boolean).length;
    for (const k of g.chaves) {
      const pl = planilhaPorNo.get(k);
      if (pl && palavras(pl) >= palavras(g.nomeFinal)) { g.nomeFinal = nomeExibicao(pl); g.fonteFinal = 'PLANILHA'; break; }
    }
  }

  // ---- diff e gravacao
  const stmts = [];
  const novoIdDoNo = new Map();
  for (const g of grupos) for (const k of g.chaves) novoIdDoNo.set(k, g.id);

  // ---- LOCAL da carteira = LOCAL das postagens no Atende.
  //      So um LOCAL: esse. Mais de um: o LOCAL com mais postagens (empate: mais valor). Empate total: fila (NULL).
  //      O admin pode trocar; a troca dele vence.
  const locaisDoGrupo = new Map();
  for (const [gk, chave] of r.grafiaNo) {
    if (!chave) continue;
    const id = novoIdDoNo.get(chave), l = entrada.locaisPorGrafia.get(gk);
    if (!id || !l) continue;
    const acc = locaisDoGrupo.get(id) || { AGF: 0, BALCAO: 0, METRO: 0, vAGF: 0, vBALCAO: 0, vMETRO: 0 };
    for (const x of ['AGF', 'BALCAO', 'METRO']) { acc[x] += l[x]; acc['v' + x] += l['v' + x]; }
    locaisDoGrupo.set(id, acc);
  }
  let naFila = 0;
  for (const g of grupos) {
    let dec = null;
    for (const k of g.chaves) { const d = entrada.localDecisoes.get(k); if (d && (!dec || d.em > dec.em)) dec = d; }
    const cont = locaisDoGrupo.get(g.id) || { AGF: 0, BALCAO: 0, METRO: 0, vAGF: 0, vBALCAO: 0, vMETRO: 0 };
    const usados = ['AGF', 'BALCAO', 'METRO'].filter((x) => cont[x] > 0)
      .sort((a, b) => (cont[b] - cont[a]) || (cont['v' + b] - cont['v' + a]));
    const empate = usados.length > 1 && cont[usados[0]] === cont[usados[1]] && cont['v' + usados[0]] === cont['v' + usados[1]];
    if (dec) { g.local = dec.local; g.localFonte = 'ADMIN'; }
    else if (usados.length === 1) { g.local = usados[0]; g.localFonte = 'AUTO'; }
    else if (usados.length > 1 && !empate) { g.local = usados[0]; g.localFonte = 'PREDOMINANTE'; }
    else { g.local = null; g.localFonte = null; if (usados.length) naFila++; }
  }
  const idsNovos = new Set(grupos.map((g) => g.id));

  for (const g of grupos) {
    const atual = entrada.clientesAtuais.get(g.id);
    const portalChave = g.portal || null;
    if (!atual) {
      stmts.push(db.prepare(`INSERT INTO cid_clientes(id, nome, fonte_nome, portal_chave, local_carteira, local_fonte) VALUES(?,?,?,?,?,?)
        ON CONFLICT(id) DO UPDATE SET nome=excluded.nome, fonte_nome=excluded.fonte_nome, portal_chave=excluded.portal_chave,
        local_carteira=excluded.local_carteira, local_fonte=excluded.local_fonte, atualizado_em=CURRENT_TIMESTAMP`)
        .bind(g.id, g.nomeFinal, g.fonteFinal, portalChave, g.local, g.localFonte));
    } else if (atual.nome !== g.nomeFinal || atual.fonte_nome !== g.fonteFinal || (atual.portal_chave || null) !== portalChave
      || (atual.local_carteira || null) !== g.local || (atual.local_fonte || null) !== g.localFonte) {
      stmts.push(db.prepare(`UPDATE cid_clientes SET nome=?, fonte_nome=?, portal_chave=?, local_carteira=?, local_fonte=?, situacao='ATIVO', atualizado_em=CURRENT_TIMESTAMP WHERE id=?`)
        .bind(g.nomeFinal, g.fonteFinal, portalChave, g.local, g.localFonte, g.id));
    }
  }
  // IDs que sumiram: registrar para onde foram (maior volume) e remover
  const fundidos = [];
  for (const [id] of entrada.clientesAtuais) {
    if (idsNovos.has(id)) continue;
    const destino = new Map();
    for (const [k, no] of entrada.nosAtuais) {
      if (no.cliente_id !== id) continue;
      const novo = novoIdDoNo.get(k);
      if (novo) destino.set(novo, (destino.get(novo) || 0) + postagensNo(k) + 1);
    }
    const para = [...destino.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
    if (para) {
      fundidos.push([id, para]);
      stmts.push(db.prepare(`INSERT INTO cid_ids_fundidos(id_antigo, id_novo) VALUES(?,?) ON CONFLICT(id_antigo) DO UPDATE SET id_novo=excluded.id_novo, em=CURRENT_TIMESTAMP`).bind(id, para));
      stmts.push(db.prepare(`UPDATE cid_ids_fundidos SET id_novo=? WHERE id_novo=?`).bind(para, id));
    }
  }
  // nos
  for (const g of grupos) {
    for (const k of g.chaves) {
      const atual = entrada.nosAtuais.get(k);
      const rg = regra.get(k) || (k.startsWith('P:') ? 'PORTAL' : 'NOME_UNICO');
      if (!atual) stmts.push(db.prepare(`INSERT INTO cid_nos(chave, tipo, cliente_id, regra) VALUES(?,?,?,?)`).bind(k, k[0], g.id, rg));
      else if (atual.cliente_id !== g.id || atual.regra !== rg) stmts.push(db.prepare(`UPDATE cid_nos SET cliente_id=?, regra=?, atualizado_em=CURRENT_TIMESTAMP WHERE chave=?`).bind(g.id, rg, k));
    }
  }
  for (const [k] of entrada.nosAtuais) if (!r.nos.has(k)) stmts.push(db.prepare(`DELETE FROM cid_nos WHERE chave=?`).bind(k));
  await emLotes(db, stmts);

  // grafias (INSERT OR REPLACE, so o necessario)
  const gstmts = [];
  const atuaisG = await db.prepare(`SELECT origem, grafia, no_chave FROM cid_grafias`).all();
  const mapaG = new Map((atuaisG.results || []).map((x) => [`${x.origem}\u0001${x.grafia}`, x.no_chave]));
  for (const [gk, chave] of r.grafiaNo) {
    if (mapaG.has(gk) && mapaG.get(gk) === chave) continue;
    const [origem, grafia] = gk.split('\u0001');
    gstmts.push(db.prepare(`INSERT INTO cid_grafias(origem, grafia, no_chave) VALUES(?,?,?) ON CONFLICT(origem, grafia) DO UPDATE SET no_chave=excluded.no_chave`).bind(origem, grafia, chave));
  }
  await emLotes(db, gstmts);
  // grafias que nao existem mais nas postagens (ex.: origem CF incorporada ao METRO) saem
  const vivas = new Set(r.grafiaNo.keys());
  const mortas = [...mapaG.keys()].filter((gk) => !vivas.has(gk));
  await emLotes(db, mortas.map((gk) => { const [o, g] = gk.split('\u0001'); return db.prepare(`DELETE FROM cid_grafias WHERE origem=? AND grafia=?`).bind(o, g); }));
  // clientes orfaos (sem no) saem
  await db.prepare(`DELETE FROM cid_clientes WHERE id NOT IN (SELECT DISTINCT cliente_id FROM cid_nos WHERE cliente_id IS NOT NULL)`).run();

  // sugestoes: substitui tudo
  const sstmts = [db.prepare(`DELETE FROM cid_sugestoes`)];
  for (const s of r.sugestoes) {
    const ca = novoIdDoNo.get(s.a), cb = novoIdDoNo.get(s.b);
    if (!ca || !cb || ca === cb) continue;
    const [a, b] = s.a < s.b ? [s.a, s.b] : [s.b, s.a];
    const [x, y] = s.a < s.b ? [ca, cb] : [cb, ca];
    sstmts.push(db.prepare(`INSERT OR IGNORE INTO cid_sugestoes(par, chave_a, chave_b, cliente_a, cliente_b, score, motivo) VALUES(?,?,?,?,?,?,?)`)
      .bind(`${a}|${b}`, a, b, x, y, s.score, s.motivo));
  }
  await emLotes(db, sstmts);
  await reconstruirResumo(db);

  const contagem = {};
  for (const l of r.log) { const k = l.bloqueado ? `BLOQUEADO_${l.bloqueado}` : l.regra; contagem[k] = (contagem[k] || 0) + 1; }
  const resumo = {
    versao: MOTOR_VERSAO, ms: Date.now() - t0, grafias: entrada.nomes.length, nos: r.nos.size, clientes: grupos.length,
    sugestoes: r.sugestoes.length, descartadas: r.descartados.length, fundidos: fundidos.length, filaLocal: naFila, regras: contagem,
    gravacoes: stmts.length + gstmts.length,
  };
  await db.batch([
    db.prepare(`INSERT INTO cid_execucoes(tipo, autor, resumo_json) VALUES('MOTOR', ?, ?)`).bind(autor, JSON.stringify(resumo)),
    db.prepare(`UPDATE cid_estado SET valor='0', atualizado_em=CURRENT_TIMESTAMP WHERE chave='motor_pendente'`),
  ]);
  return resumo;
}

export async function reconstruirResumo(db) {
  await db.batch([
    db.prepare(`DELETE FROM cid_resumo`),
    db.prepare(`INSERT INTO cid_resumo(cliente_id, aba, postagens, valor, grafias, local_agf, local_balcao, local_metro, local_vazio, primeira, ultima)
      SELECT n.cliente_id, p.origem, COUNT(*), ROUND(SUM(p.valor), 2), COUNT(DISTINCT p.grafia),
        SUM(p.local_codigo = 'AGF'), SUM(p.local_codigo = 'BALCAO'), SUM(p.local_codigo = 'METRO'), SUM(p.local_codigo NOT IN ('AGF','BALCAO','METRO')),
        MIN(p.data_postagem), MAX(p.data_postagem)
      FROM cid_postagens p
      JOIN cid_grafias g ON g.origem = p.origem AND g.grafia = p.grafia
      JOIN cid_nos n ON n.chave = g.no_chave
      WHERE n.cliente_id IS NOT NULL
      GROUP BY n.cliente_id, p.origem`),
  ]);
}
