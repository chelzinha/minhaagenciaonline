-- agf-mural 0002: perfil da equipe por login (aniversario e foto), editado em Usuarios internos.
-- A lista antiga por nome (equipe_aniversarios) continua lida enquanto o nome nao tiver perfil com aniversario.
CREATE TABLE IF NOT EXISTS equipe_perfis (
  username TEXT PRIMARY KEY,
  nome TEXT NOT NULL,
  ativo INTEGER NOT NULL DEFAULT 1 CHECK (ativo IN (0,1)),
  dia INTEGER CHECK (dia IS NULL OR dia BETWEEN 1 AND 31),
  mes INTEGER CHECK (mes IS NULL OR mes BETWEEN 1 AND 12),
  avatar TEXT NOT NULL DEFAULT '',
  avatar_em TEXT,
  atualizado_em TEXT NOT NULL,
  atualizado_por TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_perfis_ativos ON equipe_perfis(ativo, nome);
