// ============================================================
//  NORMALIZACAO E COMPATIBILIDADE DO PAINEL POSTAGENS
// ============================================================

function normalizePostagemRecord_(record) {
  var normalized = {};
  ATENDE_POSTAGENS_HEADERS.forEach(function(header) {
    normalized[header] = record[header] == null ? '' : record[header];
  });

  normalized['Objeto'] = normalizeObjectCode_(normalized['Objeto']);
  normalized['Data'] = parseDateTimeValue_(normalized['Data']) || normalized['Data'];
  normalized['Valor'] = normalizeNumberOrBlank_(normalized['Valor']);
  normalized['Peso (kg)'] = normalizeNumberOrBlank_(normalized['Peso (kg)']);
  normalized['Larg. (cm)'] = normalizeNumberOrBlank_(normalized['Larg. (cm)']);
  normalized['Comp. (cm)'] = normalizeNumberOrBlank_(normalized['Comp. (cm)']);
  normalized['Alt. (cm)'] = normalizeNumberOrBlank_(normalized['Alt. (cm)']);
  normalized['Diâm. (cm)'] = normalizeNumberOrBlank_(normalized['Diâm. (cm)']);
  normalized['VD'] = normalizeNumberOrBlank_(normalized['VD']);
  return normalized;
}

function buildColumns_(headers) {
  return headers.map(function(header) {
    return {
      key: header,
      label: header,
      width: ATENDE_COLUMN_WIDTHS[header] || 130,
      hidden: false,
      mono: /objeto|^codigo$|id|cpf|cnpj|cep|documento|contrato|cart[aã]o/i.test(header),
      numeric: /valor|^vd$|peso|larg|comp|alt|di[aâ]m|diam/i.test(header),
      type: /data|prev\./i.test(header) ? 'date' : (/valor|^vd$/i.test(header) ? 'money' : 'text'),
      group: /data|atendente|forma pagamento|^valor$|^tipo$|^formaPagamento$/i.test(header)
        ? 'atendimento'
        : 'postagem',
    };
  });
}

function formatCellForFront_(value, header) {
  if (header === 'Data') {
    var date = parseDateTimeValue_(value);
    return date ? Utilities.formatDate(date, ATENDE_CONFIG.TIMEZONE, 'dd/MM/yyyy HH:mm') : safe_(value);
  }
  if (value instanceof Date) {
    return Utilities.formatDate(value, ATENDE_CONFIG.TIMEZONE, 'dd/MM/yyyy HH:mm');
  }
  return value == null ? '' : value;
}

function parseDateTimeValue_(value) {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : new Date(value.getTime());
  }
  var text = safe_(value).trim();
  if (!text) return null;

  var match = text.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/);
  if (match) return buildLocalDate_(match[1], match[2], match[3], match[4], match[5], match[6]);

  match = text.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/);
  if (match) return buildLocalDate_(match[3], match[2], match[1], match[4], match[5], match[6]);

  return null;
}

function buildLocalDate_(year, month, day, hour, minute, second) {
  var date = new Date(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour || 0),
    Number(minute || 0),
    Number(second || 0),
    0
  );
  if (
    date.getFullYear() !== Number(year) ||
    date.getMonth() !== Number(month) - 1 ||
    date.getDate() !== Number(day)
  ) return null;
  return date;
}

function normalizeObjectCode_(value) {
  return safe_(value).trim().toUpperCase().replace(/\s+/g, '');
}

function normalizeNumberOrBlank_(value) {
  if (value === '' || value === null || value === undefined) return '';
  return parseBRNumber_(value);
}

function parseBRNumber_(value) {
  if (typeof value === 'number') return value;
  var text = safe_(value).trim();
  if (!text) return 0;
  if (text.indexOf(',') >= 0) return Number(text.replace(/\./g, '').replace(',', '.')) || 0;
  return Number(text) || 0;
}

function firstNumber_() {
  for (var i = 0; i < arguments.length; i++) {
    var value = arguments[i];
    if (value === null || value === undefined || value === '') continue;
    return parseBRNumber_(value);
  }
  return '';
}

function firstText_() {
  for (var i = 0; i < arguments.length; i++) {
    var value = arguments[i];
    if (value === null || value === undefined) continue;
    if (typeof value === 'object') continue;
    var text = String(value);
    if (text !== '') return text;
  }
  return '';
}

function firstObject_() {
  for (var i = 0; i < arguments.length; i++) {
    if (isObj_(arguments[i])) return arguments[i];
  }
  return {};
}

function firstArray_() {
  for (var i = 0; i < arguments.length; i++) {
    if (Array.isArray(arguments[i])) return arguments[i];
  }
  return [];
}

function formatPhone_(value) {
  var digits = safe_(value).replace(/\D/g, '');
  if (!digits) return '';
  if (digits.length === 11) return '(' + digits.slice(0, 2) + ') ' + digits.slice(2, 7) + '-' + digits.slice(7);
  if (digits.length === 10) return '(' + digits.slice(0, 2) + ') ' + digits.slice(2, 6) + '-' + digits.slice(6);
  return digits;
}

function isMeaningful_(value) {
  return value !== null && value !== undefined && safe_(value).trim() !== '';
}

function valuesEquivalent_(a, b) {
  if (a instanceof Date || b instanceof Date) {
    var da = parseDateTimeValue_(a);
    var db = parseDateTimeValue_(b);
    return da && db && da.getTime() === db.getTime();
  }
  return safe_(a).trim() === safe_(b).trim();
}

function parseJsonRoots_(jsonString) {
  var text = safe_(jsonString).replace(/^\uFEFF/, '').trim();
  if (!text) throw new Error('JSON vazio.');

  text = stripMarkdownFence_(text);
  try {
    return flattenJsonRoots_([JSON.parse(text)]);
  } catch (firstError) {
    var documents = splitJsonDocuments_(text);
    if (documents.length <= 1) {
      throw new Error('JSON invalido: ' + (firstError.message || String(firstError)));
    }
    try {
      return flattenJsonRoots_(documents.map(function(document) { return JSON.parse(document); }));
    } catch (multiError) {
      throw new Error('JSON invalido: ' + (multiError.message || String(multiError)));
    }
  }
}

function stripMarkdownFence_(text) {
  var trimmed = safe_(text).trim();
  var match = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return match ? match[1].trim() : trimmed;
}

function flattenJsonRoots_(documents) {
  var roots = [];
  documents.forEach(function(document) {
    if (Array.isArray(document)) roots = roots.concat(document);
    else roots.push(document);
  });
  return roots.filter(function(root) { return root !== null && root !== undefined; });
}

function splitJsonDocuments_(text) {
  var documents = [];
  var source = safe_(text);
  var index = 0;

  while (index < source.length) {
    while (index < source.length && /\s/.test(source[index])) index++;
    if (index >= source.length) break;

    var first = source[index];
    if (first !== '{' && first !== '[') {
      throw new Error('Conteudo inesperado antes do proximo JSON na posicao ' + index + '.');
    }

    var start = index;
    var depth = 0;
    var inString = false;
    var escaping = false;

    for (; index < source.length; index++) {
      var char = source[index];
      if (inString) {
        if (escaping) escaping = false;
        else if (char === '\\') escaping = true;
        else if (char === '"') inString = false;
        continue;
      }
      if (char === '"') {
        inString = true;
        continue;
      }
      if (char === '{' || char === '[') depth++;
      else if (char === '}' || char === ']') depth--;

      if (depth < 0) throw new Error('Fechamento inesperado de JSON na posicao ' + index + '.');
      if (depth === 0) {
        documents.push(source.slice(start, index + 1));
        index++;
        break;
      }
    }

    if (depth !== 0 || inString) {
      throw new Error('JSON incompleto a partir da posicao ' + start + '.');
    }
  }

  return documents;
}

function collectPayloadItems_(roots, matcher) {
  var results = [];
  var seenNodes = [];
  var seenItems = [];
  var maxDepth = 12;

  function hasSeen(list, item) {
    return list.indexOf(item) >= 0;
  }

  function addItem(item) {
    if (hasSeen(seenItems, item)) return;
    seenItems.push(item);
    results.push(item);
  }

  function addMatches(value) {
    if (!Array.isArray(value)) return false;
    var matches = value.filter(matcher);
    if (!matches.length) return false;
    matches.forEach(addItem);
    return true;
  }

  function visit(node, depth) {
    if (depth > maxDepth || node === null || node === undefined || typeof node !== 'object') return;
    if (hasSeen(seenNodes, node)) return;
    seenNodes.push(node);

    if (!Array.isArray(node) && matcher(node)) {
      addItem(node);
      return;
    }

    if (Array.isArray(node)) {
      if (addMatches(node)) return;
      node.forEach(function(child) { visit(child, depth + 1); });
      return;
    }

    Object.keys(node).forEach(function(key) {
      var value = node[key];
      if (Array.isArray(value)) {
        if (!addMatches(value)) visit(value, depth + 1);
      } else if (value && typeof value === 'object') {
        visit(value, depth + 1);
      }
    });
  }

  (Array.isArray(roots) ? roots : [roots]).forEach(function(root) { visit(root, 0); });
  return results;
}

function isObj_(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

function safe_(value) {
  return value === null || value === undefined ? '' : String(value);
}
