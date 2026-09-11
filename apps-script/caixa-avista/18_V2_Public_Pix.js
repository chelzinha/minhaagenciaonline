/**
 * Consulta pública mínima de uma cobrança Pix pelo TXID.
 * Não expõe cliente, operador, conta financeira ou dados contábeis.
 */
function v2PublicPix_(txidValue) {
  var txid = String(txidValue || '')
    .trim()
    .toUpperCase();

  if (!/^[A-Z0-9]{1,25}$/.test(txid)) {
    throw appError_(
      'Identificador da cobrança Pix inválido.',
      'INVALID_PUBLIC_PIX_TXID'
    );
  }

  var env = v2Environment_();
  var records = v2ReadObjects_(
    env.entries,
    CAIXA_V2_CFG.HEADERS.ENTRIES
  );

  var record = records.filter(function(item) {
    return String(item.pix_txid || '')
      .trim()
      .toUpperCase() === txid;
  })[0];

  if (!record) {
    throw appError_(
      'Cobrança Pix não encontrada.',
      'PUBLIC_PIX_NOT_FOUND'
    );
  }

  if (
    String(record.payment_ca_method || '') !==
      'PIX_PAGAMENTO_INSTANTANEO'
  ) {
    throw appError_(
      'O identificador informado não pertence a uma cobrança Pix.',
      'PUBLIC_PIX_NOT_PIX'
    );
  }

  var payment = v2PublicPixPayment_(env, record);
  var status = v2PublicPixStatus_(record);
  var payload = '';

  if (status === 'PENDENTE') {
    payload = v2PublicPixBuildPayload_(
      payment,
      Number(record.amount_cents || 0),
      txid
    );
  }

  return {
    ok: true,
    txid: txid,
    amountCents: Number(record.amount_cents || 0),
    status: status,
    payable: status === 'PENDENTE',
    pixPayload: payload,
    receiverName: v2PublicPixSanitizeText_(
      payment.pix_receiver_name,
      25
    ),
    city: v2PublicPixSanitizeText_(
      payment.pix_city,
      15
    ),
    receivedAt:
      status === 'PAGO'
        ? v2Iso_(record.pix_received_at)
        : ''
  };
}

function v2PublicPixPayment_(env, record) {
  var paymentId = String(record.payment_id || '').trim();
  var unitId = String(record.unit_id || '').trim();

  var matches = v2ReadObjects_(
    env.payments,
    CAIXA_V2_CFG.HEADERS.PAYMENTS
  ).filter(function(item) {
    var itemUnit = String(item.unit_id || '*').trim();

    return (
      String(item.payment_id || '').trim() === paymentId &&
      v2Bool_(item.active) &&
      (itemUnit === unitId || itemUnit === '*')
    );
  });

  matches.sort(function(first, second) {
    var firstExact =
      String(first.unit_id || '').trim() === unitId ? 0 : 1;
    var secondExact =
      String(second.unit_id || '').trim() === unitId ? 0 : 1;

    return firstExact - secondExact;
  });

  var payment = matches[0];

  if (!payment) {
    throw appError_(
      'Configuração Pix indisponível para esta cobrança.',
      'PUBLIC_PIX_CONFIG_NOT_FOUND'
    );
  }

  if (
    !v2Bool_(payment.pix_active) ||
    String(payment.pix_mode || '')
      .trim()
      .toUpperCase() !== 'LOCAL_STATIC'
  ) {
    throw appError_(
      'Esta cobrança Pix não está disponível para consulta pública.',
      'PUBLIC_PIX_DISABLED'
    );
  }

  var key = String(payment.pix_key || '').trim();
  var name = String(payment.pix_receiver_name || '').trim();
  var city = String(payment.pix_city || '').trim();

  if (
    !v2PublicPixKeyIsValid_(key) ||
    !name ||
    !city
  ) {
    throw appError_(
      'A configuração Pix desta unidade está inválida.',
      'PUBLIC_PIX_CONFIG_INVALID'
    );
  }

  return payment;
}

function v2PublicPixStatus_(record) {
  var entryStatus = String(record.status || '')
    .trim()
    .toUpperCase();
  var pixStatus = String(record.pix_status || '')
    .trim()
    .toUpperCase();

  if (
    entryStatus === 'EXCLUIDO' ||
    pixStatus === 'CANCELADO'
  ) {
    return 'CANCELADO';
  }

  if (pixStatus === 'CONFIRMADO') {
    return 'PAGO';
  }

  if (pixStatus === 'EXPIRADO') {
    return 'EXPIRADO';
  }

  if (pixStatus === 'ERRO') {
    return 'ERRO';
  }

  return 'PENDENTE';
}

function v2PublicPixBuildPayload_(payment, amountCents, txid) {
  var amount = Math.round(Number(amountCents || 0));

  if (!(amount > 0)) {
    throw appError_(
      'Valor da cobrança Pix inválido.',
      'PUBLIC_PIX_INVALID_AMOUNT'
    );
  }

  var key = String(payment.pix_key || '').trim();
  var name = v2PublicPixSanitizeText_(
    payment.pix_receiver_name,
    25
  );
  var city = v2PublicPixSanitizeText_(
    payment.pix_city,
    15
  );

  var merchantAccount =
    v2PublicPixEmv_('00', 'BR.GOV.BCB.PIX') +
    v2PublicPixEmv_('01', key);

  var additional =
    v2PublicPixEmv_('05', txid);

  var payloadWithoutCrc = [
    v2PublicPixEmv_('00', '01'),
    v2PublicPixEmv_('26', merchantAccount),
    v2PublicPixEmv_('52', '0000'),
    v2PublicPixEmv_('53', '986'),
    v2PublicPixEmv_('54', (amount / 100).toFixed(2)),
    v2PublicPixEmv_('58', 'BR'),
    v2PublicPixEmv_('59', name),
    v2PublicPixEmv_('60', city),
    v2PublicPixEmv_('62', additional),
    '6304'
  ].join('');

  return (
    payloadWithoutCrc +
    v2PublicPixCrc16_(payloadWithoutCrc)
  );
}

function v2PublicPixSanitizeText_(value, maxLength) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9 $%*+\-./:]/g, '')
    .slice(0, maxLength);
}

function v2PublicPixEmv_(id, value) {
  var text = String(value == null ? '' : value);

  return (
    id +
    String(text.length).padStart(2, '0') +
    text
  );
}

function v2PublicPixCrc16_(value) {
  var crc = 0xFFFF;

  for (var index = 0; index < value.length; index += 1) {
    crc ^= value.charCodeAt(index) << 8;

    for (var bit = 0; bit < 8; bit += 1) {
      crc = crc & 0x8000
        ? (crc << 1) ^ 0x1021
        : crc << 1;
      crc &= 0xFFFF;
    }
  }

  return crc
    .toString(16)
    .toUpperCase()
    .padStart(4, '0');
}

function v2PublicPixKeyIsValid_(value) {
  var key = String(value || '').trim();

  if (!key || key.length > 77 || /[\r\n\t]/.test(key)) {
    return false;
  }

  if (!/^\d+$/.test(key)) {
    return true;
  }

  if (key.length === 11) {
    return v2PublicPixCpfIsValid_(key);
  }

  if (key.length === 14) {
    return v2PublicPixCnpjIsValid_(key);
  }

  return false;
}

function v2PublicPixCpfIsValid_(digits) {
  if (!/^\d{11}$/.test(digits) || /^(\d)\1+$/.test(digits)) {
    return false;
  }

  var sum = 0;
  var index;

  for (index = 0; index < 9; index += 1) {
    sum += Number(digits[index]) * (10 - index);
  }

  var check = (sum * 10) % 11;
  if (check === 10) check = 0;
  if (check !== Number(digits[9])) return false;

  sum = 0;

  for (index = 0; index < 10; index += 1) {
    sum += Number(digits[index]) * (11 - index);
  }

  check = (sum * 10) % 11;
  if (check === 10) check = 0;

  return check === Number(digits[10]);
}

function v2PublicPixCnpjIsValid_(digits) {
  if (!/^\d{14}$/.test(digits) || /^(\d)\1+$/.test(digits)) {
    return false;
  }

  function calculate(base, weights) {
    var sum = 0;

    for (var index = 0; index < base.length; index += 1) {
      sum += Number(base[index]) * weights[index];
    }

    var remainder = sum % 11;
    return remainder < 2 ? 0 : 11 - remainder;
  }

  var first = calculate(
    digits.slice(0, 12),
    [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
  );

  var second = calculate(
    digits.slice(0, 12) + String(first),
    [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
  );

  return digits.slice(-2) === String(first) + String(second);
}
