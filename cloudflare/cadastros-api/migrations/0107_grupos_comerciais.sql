-- Grupos comerciais (02/10/2026).
-- Junta varios cadastros que comercialmente sao um cliente so. Serve SOMENTE para o CRM:
-- nome, ID e postagens de cada cadastro (cid_*) nao mudam e o Visao 360 nao e tocado.
-- Migracao ADITIVA: so cria tabelas novas. Nada existente e alterado.

-- 1) O grupo. No CRM ele aparece com o ID do cadastro principal (principal_id), por isso tratativas,
--    agenda e cadastro manual do CRM continuam funcionando sem mudar de formato.
CREATE TABLE IF NOT EXISTS crm_grupos (
  id             TEXT PRIMARY KEY,                                    -- GRP_XXXXXXXX
  nome           TEXT NOT NULL CHECK (length(trim(nome)) > 0),
  principal_id   TEXT NOT NULL,                                       -- cadastro que da o ID e o contato do grupo no CRM
  local_modo     TEXT NOT NULL DEFAULT 'AUTO' CHECK (local_modo IN ('AUTO', 'AGF', 'BALCAO', 'METRO')),
  criado_por     TEXT NOT NULL DEFAULT '',
  criado_em      TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_por TEXT NOT NULL DEFAULT '',
  atualizado_em  TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 2) Membros. cliente_id e a chave: um cadastro so pode estar em UM grupo (regra da Rachel), garantido pelo banco.
CREATE TABLE IF NOT EXISTS crm_grupo_membros (
  cliente_id   TEXT PRIMARY KEY,
  grupo_id     TEXT NOT NULL REFERENCES crm_grupos(id) ON DELETE CASCADE,
  incluido_por TEXT NOT NULL DEFAULT '',
  incluido_em  TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_crm_grupo_membros_grupo ON crm_grupo_membros(grupo_id);

-- 3) Sugestoes de grupo marcadas como "Nao sao o mesmo": nao voltam.
CREATE TABLE IF NOT EXISTS crm_grupo_sugestoes_rejeitadas (
  chave TEXT PRIMARY KEY,                                             -- IDs ordenados (e o grupo alvo, quando houver)
  autor TEXT NOT NULL DEFAULT '',
  em    TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 4) O CRM recalcula no proximo ciclo (a versao nova do motor tambem forca isso).
UPDATE cid_estado SET valor = '1', atualizado_em = CURRENT_TIMESTAMP WHERE chave = 'crm_pendente';
