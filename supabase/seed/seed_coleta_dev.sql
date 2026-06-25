-- =====================================================================================
-- seed_coleta_dev.sql
-- Dados FICTÍCIOS para desenvolvimento do módulo Rotas de Coleta.
-- NÃO usar em produção. Todos os registros usam o prefixo "TEST" no nome para
-- facilitar identificação e limpeza:
--   delete from coleta.coleta_objetos where rota_parada_id in (
--     select id from coleta.rota_paradas where rota_id in (
--       select id from coleta.rotas where observacao like 'TEST%'));
--   delete from coleta.rota_paradas where rota_id in (select id from coleta.rotas where observacao like 'TEST%');
--   delete from coleta.rotas where observacao like 'TEST%';
--   delete from coleta.pontos_coleta where nome like 'TEST%';
--   delete from core.coletadores where nome like 'TEST%';
-- Idempotente: ON CONFLICT (id) DO NOTHING.
-- Depende de: 0002 (core.coletadores) e 0003 (schema coleta).
-- Nota: UUIDs abaixo usam apenas dígitos hexadecimais (sufixos c#, a#, b###, e#).
-- =====================================================================================

-- 1) Coletadores (3) -----------------------------------------------------------------
insert into core.coletadores (id, nome, cpf, telefone, status_coletador) values
  ('11111111-1111-1111-1111-1111111111c1', 'TEST Coletador Alfa',   '000.000.000-01', '(85) 90000-0001', 'ativo'),
  ('11111111-1111-1111-1111-1111111111c2', 'TEST Coletador Bravo',  '000.000.000-02', '(85) 90000-0002', 'ativo'),
  ('11111111-1111-1111-1111-1111111111c3', 'TEST Coletador Charlie','000.000.000-03', '(85) 90000-0003', 'inativo')
on conflict (id) do nothing;

-- 2) Pontos de coleta (5) — Fortaleza/CE ---------------------------------------------
insert into coleta.pontos_coleta
  (id, nome, razao_social, cnpj_cpf, endereco, numero, bairro, cep, cidade, uf, latitude, longitude, janela_atendimento, status_ponto) values
  ('22222222-2222-2222-2222-2222222222a1', 'TEST Ponto Aldeota',    'TEST Loja Aldeota LTDA',   '00.000.000/0001-01', 'Av. Santos Dumont',    '1500', 'Aldeota',       '60150-161', 'Fortaleza', 'CE', -3.7340000, -38.4980000, '08:00-12:00', 'ativo'),
  ('22222222-2222-2222-2222-2222222222a2', 'TEST Ponto Meireles',   'TEST Comercio Meireles ME','00.000.000/0001-02', 'Av. Beira Mar',        '2200', 'Meireles',      '60165-121', 'Fortaleza', 'CE', -3.7250000, -38.4900000, '09:00-13:00', 'ativo'),
  ('22222222-2222-2222-2222-2222222222a3', 'TEST Ponto Centro',     'TEST Atacado Centro SA',   '00.000.000/0001-03', 'Rua General Sampaio',  '420',  'Centro',        '60020-010', 'Fortaleza', 'CE', -3.7270000, -38.5270000, '08:00-17:00', 'ativo'),
  ('22222222-2222-2222-2222-2222222222a4', 'TEST Ponto Cocó',       'TEST Servicos Coco LTDA',  '00.000.000/0001-04', 'Av. Washington Soares', '909', 'Edson Queiroz', '60811-341', 'Fortaleza', 'CE', -3.7720000, -38.4790000, '10:00-14:00', 'ativo'),
  ('22222222-2222-2222-2222-2222222222a5', 'TEST Ponto Messejana',  'TEST Distrib Messejana ME','00.000.000/0001-05', 'Av. Frei Cirilo',      '3200', 'Messejana',     '60840-285', 'Fortaleza', 'CE', -3.8330000, -38.4900000, '08:00-12:00', 'bloqueado')
on conflict (id) do nothing;

-- 3) Rotas (2) -----------------------------------------------------------------------
insert into coleta.rotas (id, data_rota, coletador_id, status_rota, hora_inicio, hora_fim, observacao) values
  ('33333333-3333-3333-3333-3333333333d1', current_date,     '11111111-1111-1111-1111-1111111111c1', 'em_andamento', '08:00', null, 'TEST rota manhã — zona leste'),
  ('33333333-3333-3333-3333-3333333333d2', current_date + 1, '11111111-1111-1111-1111-1111111111c2', 'planejada',    null,    null, 'TEST rota tarde — zona sul')
on conflict (id) do nothing;

-- 4) Paradas -------------------------------------------------------------------------
-- Rota 1: 3 paradas (Aldeota, Meireles, Centro). Rota 2: 2 paradas (Cocó, Messejana).
insert into coleta.rota_paradas
  (id, rota_id, ponto_coleta_id, ordem, status_parada, hora_prevista, hora_chegada, hora_saida, qtde_coletada, observacao) values
  ('44444444-4444-4444-4444-44444444b101', '33333333-3333-3333-3333-3333333333d1', '22222222-2222-2222-2222-2222222222a1', 1, 'concluida',    '08:15', '08:18', '08:30', 12, 'TEST parada ok'),
  ('44444444-4444-4444-4444-44444444b102', '33333333-3333-3333-3333-3333333333d1', '22222222-2222-2222-2222-2222222222a2', 2, 'em_andamento', '08:45', '08:50', null,    0,  'TEST coletando'),
  ('44444444-4444-4444-4444-44444444b103', '33333333-3333-3333-3333-3333333333d1', '22222222-2222-2222-2222-2222222222a3', 3, 'pendente',     '09:20', null,    null,    0,  'TEST aguardando'),
  ('44444444-4444-4444-4444-44444444b201', '33333333-3333-3333-3333-3333333333d2', '22222222-2222-2222-2222-2222222222a4', 1, 'pendente',     '13:00', null,    null,    0,  'TEST planejada'),
  ('44444444-4444-4444-4444-44444444b202', '33333333-3333-3333-3333-3333333333d2', '22222222-2222-2222-2222-2222222222a5', 2, 'pendente',     '13:40', null,    null,    0,  'TEST planejada')
on conflict (id) do nothing;

-- 5) Objetos coletados ---------------------------------------------------------------
insert into coleta.coleta_objetos (id, rota_parada_id, tipo_servico, qtd, valor, observacao) values
  ('55555555-5555-5555-5555-5555555550e1', '44444444-4444-4444-4444-44444444b101', 'SEDEX', 8, 240.00, 'TEST lote A'),
  ('55555555-5555-5555-5555-5555555550e2', '44444444-4444-4444-4444-44444444b101', 'PAC',   4, 96.00,  'TEST lote B'),
  ('55555555-5555-5555-5555-5555555550e3', '44444444-4444-4444-4444-44444444b102', 'SEDEX', 3, 90.00,  'TEST parcial')
on conflict (id) do nothing;
