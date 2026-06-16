/**
 * AGF SUPERFRETE — 45_SF_LOGOS.gs
 * Etapa 7C: upload de logo do cliente para uso na Etiqueta AGF por overlay.
 *
 * Regras:
 * - Aceita PNG, JPG/JPEG ou WEBP.
 * - Recomenda PNG transparente 600 x 240 px.
 * - Salva no Drive dentro de uma subpasta "AGF SuperFrete Logos".
 * - Atualiza LOGO_DRIVE_ID e LOGO_URL na aba SF_CLIENTES quando CLIENTE_ID existir.
 */

function action_sfAdminUploadClientLogo_(params) {
  const user = sfRequireAdmin_(params.sessionToken);
  return sfWithLock_(function () {
    const clienteId = sanitize_(params.clienteId || params.CLIENTE_ID);
    const nomeCliente = sanitize_(params.nomeCliente || params.NOME_CLIENTE || clienteId || 'cliente');
    const originalName = sanitize_(params.fileName || 'logo-cliente.png');
    const mimeType = sanitize_(params.mimeType || 'image/png').toLowerCase();
    const base64Input = sanitize_(params.base64 || params.dataUrl || '');
    const width = Number(params.width || 0) || 0;
    const height = Number(params.height || 0) || 0;

    if (!base64Input) throw new Error('Arquivo da logo não enviado.');
    if (!sfIsAllowedLogoMime_(mimeType)) throw new Error('Formato inválido. Use PNG, JPG ou WEBP.');

    const cleanBase64 = sfStripDataUrlPrefix_(base64Input);
    const bytes = Utilities.base64Decode(cleanBase64);
    if (!bytes || !bytes.length) throw new Error('Arquivo da logo está vazio.');
    if (bytes.length > 1024 * 1024) throw new Error('Logo muito grande. Envie uma imagem de até 1 MB.');

    const extension = sfLogoExtension_(mimeType, originalName);
    const safeName = sfSafeFileName_(nomeCliente || clienteId || 'cliente');
    const fileName = 'logo_' + safeName + '_' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMdd_HHmmss') + '.' + extension;

    const folder = sfGetLogosFolder_();
    const blob = Utilities.newBlob(bytes, mimeType, fileName);
    const file = folder.createFile(blob);

    try {
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    } catch (e) {
      // Algumas contas Workspace podem bloquear compartilhamento público. O overlay ainda usa base64 pelo Drive ID.
      sfLog_('WARN', 'SF_LOGOS', 'SHARING_NOT_APPLIED', {
        USUARIO_ID: user.USUARIO_ID,
        CLIENTE_ID: clienteId,
        MENSAGEM: e.message || String(e)
      });
    }

    const fileId = file.getId();
    const publicUrl = 'https://drive.google.com/uc?export=view&id=' + encodeURIComponent(fileId);

    if (clienteId) {
      const cliente = sfFindBy_(SF.SHEETS.CLIENTES, 'CLIENTE_ID', clienteId);
      if (cliente) {
        sfUpdateRowByHeaders_(SF.SHEETS.CLIENTES, cliente._row, {
          LOGO_DRIVE_ID: fileId,
          LOGO_URL: publicUrl,
          ATUALIZADO_EM: nowIso_()
        });
      }
    }

    sfLog_('INFO', 'SF_LOGOS', 'UPLOAD_CLIENT_LOGO', {
      USUARIO_ID: user.USUARIO_ID,
      CLIENTE_ID: clienteId,
      MENSAGEM: 'Logo de cliente enviada',
      PAYLOAD_JSON: safeJsonStringify_({ fileName: fileName, mimeType: mimeType, sizeBytes: bytes.length, width: width, height: height })
    });

    return {
      LOGO_DRIVE_ID: fileId,
      LOGO_URL: publicUrl,
      fileName: fileName,
      mimeType: mimeType,
      sizeBytes: bytes.length,
      width: width,
      height: height,
      previewDataUrl: 'data:' + mimeType + ';base64,' + Utilities.base64Encode(bytes)
    };
  });
}

function sfGetLogosFolder_() {
  let parent = null;
  const folderId = sanitize_(CFG && CFG.DRIVE_FOLDER_ID);
  if (folderId) {
    try { parent = DriveApp.getFolderById(folderId); } catch (e) { parent = null; }
  }
  if (!parent) parent = DriveApp.getRootFolder();

  const name = 'AGF SuperFrete Logos';
  const it = parent.getFoldersByName(name);
  if (it.hasNext()) return it.next();
  return parent.createFolder(name);
}

function sfIsAllowedLogoMime_(mimeType) {
  return ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'].indexOf(String(mimeType || '').toLowerCase()) >= 0;
}

function sfStripDataUrlPrefix_(value) {
  const s = String(value || '').trim();
  const idx = s.indexOf('base64,');
  return idx >= 0 ? s.slice(idx + 7) : s;
}

function sfLogoExtension_(mimeType, fileName) {
  const mt = String(mimeType || '').toLowerCase();
  if (mt === 'image/png') return 'png';
  if (mt === 'image/webp') return 'webp';
  if (mt === 'image/jpeg' || mt === 'image/jpg') return 'jpg';
  const ext = String(fileName || '').split('.').pop().toLowerCase();
  return ext || 'png';
}

function sfSafeFileName_(value) {
  return String(value || 'cliente')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 48) || 'cliente';
}

function sfBuildLogoDataUrl_(driveId) {
  const id = sanitize_(driveId);
  if (!id) return '';
  try {
    const file = DriveApp.getFileById(id);
    const blob = file.getBlob();
    const bytes = blob.getBytes();
    if (!bytes || !bytes.length || bytes.length > 1024 * 1024) return '';
    const mime = blob.getContentType() || 'image/png';
    if (!sfIsAllowedLogoMime_(mime)) return '';
    return 'data:' + mime + ';base64,' + Utilities.base64Encode(bytes);
  } catch (e) {
    sfLog_('WARN', 'SF_LOGOS', 'LOGO_DATA_URL_FAILED', { MENSAGEM: e.message || String(e), PAYLOAD_JSON: id });
    return '';
  }
}
