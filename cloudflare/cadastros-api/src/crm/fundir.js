/**
 * Quando a limpeza do Cadastro junta dois clientes, o ID antigo some. O que o CRM tinha no ID antigo
 * (tratativas, agenda, checklists, notas, cadastro manual) passa para o ID que ficou.
 */
export function statementsFusaoCrm(db, pares) {
  const s = statementsMoverCrm(db, pares, { cadastro: true });
  // grupos comerciais: o ID que ficou herda o lugar do antigo no grupo (se ja estiver em outro grupo, continua la)
  for (const [antigo, novo] of pares) {
    if (!antigo || !novo || antigo === novo) continue;
    s.push(db.prepare(`UPDATE OR IGNORE crm_grupo_membros SET cliente_id=? WHERE cliente_id=?`).bind(novo, antigo));
    s.push(db.prepare(`DELETE FROM crm_grupo_membros WHERE cliente_id=?`).bind(antigo));
    s.push(db.prepare(`UPDATE crm_grupos SET principal_id=? WHERE principal_id=? AND EXISTS (SELECT 1 FROM crm_grupo_membros m WHERE m.grupo_id=crm_grupos.id AND m.cliente_id=?)`).bind(novo, antigo, novo));
  }
  return s;
}

/**
 * Leva o que o CRM tem num ID (tratativas, agenda, checklists, notas, interacoes) para outro ID e completa o cadastro manual.
 * cadastro=true (juncao de clientes): o cadastro manual tambem passa para o ID que ficou e o antigo e apagado.
 * cadastro=false (grupos comerciais): o cadastro manual de cada membro fica intacto, para voltar inteiro se o grupo for desfeito;
 * o contato do grupo no CRM e o do cadastro principal.
 */
export function statementsMoverCrm(db, pares, { cadastro = false } = {}) {
  const s = [];
  for (const [antigo, novo] of pares) {
    if (!antigo || !novo || antigo === novo) continue;
    s.push(db.prepare(`UPDATE crm_tratativas SET ENTIDADE_ID=? WHERE TIPO_ENTIDADE='CLIENTE' AND ENTIDADE_ID=?`).bind(novo, antigo));
    s.push(db.prepare(`UPDATE crm_agenda SET ENTIDADE_ID=CASE WHEN ENTIDADE_ID=? THEN ? ELSE ENTIDADE_ID END, CLIENTE_ID=CASE WHEN CLIENTE_ID=? THEN ? ELSE CLIENTE_ID END WHERE ENTIDADE_ID=? OR CLIENTE_ID=?`).bind(antigo, novo, antigo, novo, antigo, antigo));
    s.push(db.prepare(`UPDATE crm_checklists SET CLIENTE_MASTER_ID=CASE WHEN CLIENTE_MASTER_ID=? THEN ? ELSE CLIENTE_MASTER_ID END, ORIGEM_ID=CASE WHEN ORIGEM_ID=? THEN ? ELSE ORIGEM_ID END WHERE CLIENTE_MASTER_ID=? OR ORIGEM_ID=?`).bind(antigo, novo, antigo, novo, antigo, antigo));
    s.push(db.prepare(`UPDATE crm_anotacoes SET ENTIDADE_ID=? WHERE ENTIDADE_TIPO='CLIENTE' AND ENTIDADE_ID=?`).bind(novo, antigo));
    s.push(db.prepare(`UPDATE crm_interacoes SET CLIENTE_ID=CASE WHEN CLIENTE_ID=? THEN ? ELSE CLIENTE_ID END, ENTIDADE_ID=CASE WHEN ENTIDADE_ID=? THEN ? ELSE ENTIDADE_ID END WHERE CLIENTE_ID=? OR ENTIDADE_ID=?`).bind(antigo, novo, antigo, novo, antigo, antigo));
    if (!cadastro) continue;
    // cadastro manual: se o ID que ficou nao tem cadastro, herda o do antigo; se tem, completa so o que estiver vazio
    s.push(db.prepare(`INSERT OR IGNORE INTO crm_cadastro(CLIENTE_ID, ORIGEM, CRIADO_EM, ATUALIZADO_EM) SELECT ?, 'ATENDE', CRIADO_EM, ATUALIZADO_EM FROM crm_cadastro WHERE CLIENTE_ID=?`).bind(novo, antigo));
    s.push(db.prepare(`UPDATE crm_cadastro SET ${COLS.map((c) => `${c}=COALESCE(${c}, (SELECT ${c} FROM crm_cadastro WHERE CLIENTE_ID=?))`).join(',')} WHERE CLIENTE_ID=?`).bind(...COLS.map(() => antigo), novo));
    s.push(db.prepare(`DELETE FROM crm_cadastro WHERE CLIENTE_ID=? AND ORIGEM='ATENDE'`).bind(antigo));
  }
  return s;
}
const COLS = ['CLIENTE', 'NOME_FANTASIA', 'RAZAO_SOCIAL', 'CNPJ_CPF', 'PESSOA_CONTATO', 'WHATSAPP', 'TELEFONE', 'EMAIL', 'ENDERECO', 'NUMERO', 'COMPLEMENTO', 'BAIRRO', 'CEP',
  'CIDADE', 'UF', 'SEGMENTO_PREDOMINANTE', 'NUMERO_CONTRATO', 'CARTAO_POSTAGEM', 'STATUS_COMERCIAL', 'OBSERVACOES', 'ULTIMA_VISITA', 'ULTIMO_RESULTADO_VISITA',
  'CHECKLIST_ULTIMA_VISITA_ID', 'DATA_PROXIMO_FOLLOWUP', 'PROXIMA_ACAO_MANUAL', 'ACAO_ATUAL', 'MIDIA', 'LINK_MIDIA_DIRETO', 'RESPONSAVEL_CARTEIRA', 'RESPONSAVEL_ID',
  'STATUS_CADASTRO', 'TRATATIVA_ATIVA_ID', 'ULTIMA_ATIVIDADE_ID', 'PROXIMA_ATIVIDADE_EM',
  'CODIGO_PORTAL', 'CONTRATO_PORTAL', 'CARTAO_PORTAL', 'COD_ADM_PORTAL', 'TIPO_CONTRATO_PORTAL', 'VIGENCIA_CONTRATO_PORTAL'];
