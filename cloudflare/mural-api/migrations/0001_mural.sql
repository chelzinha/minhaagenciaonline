-- agf-mural: Portal Interno vivo (mural, aniversarios, elogios, agenda)
-- Datas em UTC ISO-8601. Exclusao sempre logica (excluido_em), nunca DELETE.

CREATE TABLE IF NOT EXISTS mural_recados (
  id TEXT PRIMARY KEY,
  autor_username TEXT NOT NULL,
  autor_nome TEXT NOT NULL,
  categoria TEXT NOT NULL CHECK (categoria IN ('aviso','oper','lembrete','festa')),
  texto TEXT NOT NULL,
  fixado INTEGER NOT NULL DEFAULT 0 CHECK (fixado IN (0,1)),
  criado_em TEXT NOT NULL,
  excluido_em TEXT,
  excluido_por TEXT
);
CREATE INDEX IF NOT EXISTS idx_recados_ativos ON mural_recados(excluido_em, criado_em DESC);

CREATE TABLE IF NOT EXISTS mural_respostas (
  id TEXT PRIMARY KEY,
  recado_id TEXT NOT NULL REFERENCES mural_recados(id),
  autor_username TEXT NOT NULL,
  autor_nome TEXT NOT NULL,
  texto TEXT NOT NULL,
  criado_em TEXT NOT NULL,
  excluido_em TEXT
);
CREATE INDEX IF NOT EXISTS idx_respostas_recado ON mural_respostas(recado_id, criado_em);

CREATE TABLE IF NOT EXISTS mural_curtidas (
  recado_id TEXT NOT NULL REFERENCES mural_recados(id),
  username TEXT NOT NULL,
  nome TEXT NOT NULL,
  criado_em TEXT NOT NULL,
  PRIMARY KEY (recado_id, username)
);

CREATE TABLE IF NOT EXISTS equipe_aniversarios (
  id TEXT PRIMARY KEY,
  nome TEXT NOT NULL,
  dia INTEGER NOT NULL CHECK (dia BETWEEN 1 AND 31),
  mes INTEGER NOT NULL CHECK (mes BETWEEN 1 AND 12),
  atualizado_em TEXT NOT NULL,
  atualizado_por TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS mural_elogios (
  id TEXT PRIMARY KEY,
  de_username TEXT NOT NULL,
  de_nome TEXT NOT NULL,
  para_nome TEXT NOT NULL,
  texto TEXT NOT NULL,
  criado_em TEXT NOT NULL,
  excluido_em TEXT
);
CREATE INDEX IF NOT EXISTS idx_elogios_data ON mural_elogios(excluido_em, criado_em DESC);

-- tipo: feriado | interno.  dia_util: 0 = agencia fechada (nao conta), 1 = conta como dia util
CREATE TABLE IF NOT EXISTS agenda_eventos (
  id TEXT PRIMARY KEY,
  data TEXT NOT NULL,
  titulo TEXT NOT NULL,
  descricao TEXT NOT NULL DEFAULT '',
  tipo TEXT NOT NULL CHECK (tipo IN ('feriado','interno')),
  dia_util INTEGER NOT NULL DEFAULT 1 CHECK (dia_util IN (0,1)),
  criado_por TEXT NOT NULL DEFAULT 'sistema',
  criado_em TEXT NOT NULL,
  excluido_em TEXT
);
CREATE INDEX IF NOT EXISTS idx_agenda_data ON agenda_eventos(excluido_em, data);

CREATE TABLE IF NOT EXISTS mural_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL,
  acao TEXT NOT NULL,
  alvo TEXT,
  detalhe TEXT,
  criado_em TEXT NOT NULL
);

-- Feriados 2026 e 2027 (nacionais, Ceara e Fortaleza). Ponto facultativo conta como dia util.
INSERT OR IGNORE INTO agenda_eventos (id, data, titulo, descricao, tipo, dia_util, criado_em) VALUES
 ('fer-2026-01-01','2026-01-01','Confraternização Universal','Feriado nacional, agência fechada','feriado',0,'2026-10-03T00:00:00Z'),
 ('fer-2026-02-16','2026-02-16','Carnaval','Ponto facultativo','feriado',1,'2026-10-03T00:00:00Z'),
 ('fer-2026-02-17','2026-02-17','Carnaval','Ponto facultativo','feriado',1,'2026-10-03T00:00:00Z'),
 ('fer-2026-03-19','2026-03-19','São José','Feriado estadual, agência fechada','feriado',0,'2026-10-03T00:00:00Z'),
 ('fer-2026-03-25','2026-03-25','Data Magna do Ceará','Feriado estadual, agência fechada','feriado',0,'2026-10-03T00:00:00Z'),
 ('fer-2026-04-03','2026-04-03','Sexta-feira Santa','Feriado nacional, agência fechada','feriado',0,'2026-10-03T00:00:00Z'),
 ('fer-2026-04-13','2026-04-13','Aniversário de Fortaleza','Feriado municipal, agência fechada','feriado',0,'2026-10-03T00:00:00Z'),
 ('fer-2026-04-21','2026-04-21','Tiradentes','Feriado nacional, agência fechada','feriado',0,'2026-10-03T00:00:00Z'),
 ('fer-2026-05-01','2026-05-01','Dia do Trabalho','Feriado nacional, agência fechada','feriado',0,'2026-10-03T00:00:00Z'),
 ('fer-2026-06-04','2026-06-04','Corpus Christi','Ponto facultativo','feriado',1,'2026-10-03T00:00:00Z'),
 ('fer-2026-08-15','2026-08-15','Nossa Senhora da Assunção','Feriado municipal, agência fechada','feriado',0,'2026-10-03T00:00:00Z'),
 ('fer-2026-09-07','2026-09-07','Independência do Brasil','Feriado nacional, agência fechada','feriado',0,'2026-10-03T00:00:00Z'),
 ('fer-2026-10-12','2026-10-12','Nossa Senhora Aparecida','Feriado nacional, agência fechada','feriado',0,'2026-10-03T00:00:00Z'),
 ('fer-2026-11-02','2026-11-02','Finados','Feriado nacional, agência fechada','feriado',0,'2026-10-03T00:00:00Z'),
 ('fer-2026-11-15','2026-11-15','Proclamação da República','Feriado nacional, agência fechada','feriado',0,'2026-10-03T00:00:00Z'),
 ('fer-2026-11-20','2026-11-20','Dia da Consciência Negra','Feriado nacional, agência fechada','feriado',0,'2026-10-03T00:00:00Z'),
 ('fer-2026-12-25','2026-12-25','Natal','Feriado nacional, agência fechada','feriado',0,'2026-10-03T00:00:00Z'),
 ('fer-2027-01-01','2027-01-01','Confraternização Universal','Feriado nacional, agência fechada','feriado',0,'2026-10-03T00:00:00Z'),
 ('fer-2027-02-08','2027-02-08','Carnaval','Ponto facultativo','feriado',1,'2026-10-03T00:00:00Z'),
 ('fer-2027-02-09','2027-02-09','Carnaval','Ponto facultativo','feriado',1,'2026-10-03T00:00:00Z'),
 ('fer-2027-03-19','2027-03-19','São José','Feriado estadual, agência fechada','feriado',0,'2026-10-03T00:00:00Z'),
 ('fer-2027-03-25','2027-03-25','Data Magna do Ceará','Feriado estadual, agência fechada','feriado',0,'2026-10-03T00:00:00Z'),
 ('fer-2027-03-26','2027-03-26','Sexta-feira Santa','Feriado nacional, agência fechada','feriado',0,'2026-10-03T00:00:00Z'),
 ('fer-2027-04-13','2027-04-13','Aniversário de Fortaleza','Feriado municipal, agência fechada','feriado',0,'2026-10-03T00:00:00Z'),
 ('fer-2027-04-21','2027-04-21','Tiradentes','Feriado nacional, agência fechada','feriado',0,'2026-10-03T00:00:00Z'),
 ('fer-2027-05-01','2027-05-01','Dia do Trabalho','Feriado nacional, agência fechada','feriado',0,'2026-10-03T00:00:00Z'),
 ('fer-2027-05-27','2027-05-27','Corpus Christi','Ponto facultativo','feriado',1,'2026-10-03T00:00:00Z'),
 ('fer-2027-08-15','2027-08-15','Nossa Senhora da Assunção','Feriado municipal, agência fechada','feriado',0,'2026-10-03T00:00:00Z'),
 ('fer-2027-09-07','2027-09-07','Independência do Brasil','Feriado nacional, agência fechada','feriado',0,'2026-10-03T00:00:00Z'),
 ('fer-2027-10-12','2027-10-12','Nossa Senhora Aparecida','Feriado nacional, agência fechada','feriado',0,'2026-10-03T00:00:00Z'),
 ('fer-2027-11-02','2027-11-02','Finados','Feriado nacional, agência fechada','feriado',0,'2026-10-03T00:00:00Z'),
 ('fer-2027-11-15','2027-11-15','Proclamação da República','Feriado nacional, agência fechada','feriado',0,'2026-10-03T00:00:00Z'),
 ('fer-2027-11-20','2027-11-20','Dia da Consciência Negra','Feriado nacional, agência fechada','feriado',0,'2026-10-03T00:00:00Z'),
 ('fer-2027-12-25','2027-12-25','Natal','Feriado nacional, agência fechada','feriado',0,'2026-10-03T00:00:00Z');
