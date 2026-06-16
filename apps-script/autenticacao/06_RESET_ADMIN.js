/**
 * Contingência administrativa: redefine a senha do usuário admin,
 * revoga sessões anteriores e registra a nova senha temporária.
 */
function resetAdminPasswordAndLog() {
  const temporaryPassword = 'AGF-' + agfRandomToken_(6);
  createOrUpdateAgfUser('admin', 'Administrador', temporaryPassword, 'admin', true);
  console.log('==========================================');
  console.log('LOGIN ADMINISTRATIVO REDEFINIDO');
  console.log('Login: admin');
  console.log('Senha temporária: ' + temporaryPassword);
  console.log('Altere a senha depois do primeiro acesso.');
  console.log('==========================================');
  return { ok: true, login: 'admin', temporaryPassword: temporaryPassword };
}
