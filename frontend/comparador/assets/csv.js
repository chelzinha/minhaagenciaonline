function detectDelimiter(line) {
  const candidates = [";", ",", "\t"];
  let best = ";";
  let max = -1;
  for (const delimiter of candidates) {
    const count = [...line].filter((char) => char === delimiter).length;
    if (count > max) {
      max = count;
      best = delimiter;
    }
  }
  return best;
}

function parseLine(line, delimiter) {
  const fields = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      if (quoted && line[index + 1] === '"') {
        value += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === delimiter && !quoted) {
      fields.push(value);
      value = "";
    } else {
      value += char;
    }
  }
  fields.push(value);
  return fields;
}

export function parseCsv(text) {
  const clean = String(text ?? "").replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = clean.split("\n").filter((line) => line.trim() !== "");
  if (!lines.length) return { headers: [], rows: [], delimiter: ";" };

  const delimiter = detectDelimiter(lines[0]);
  const headers = parseLine(lines[0], delimiter).map((header) => header.trim().toUpperCase());
  const rows = lines.slice(1).map((line) => {
    const values = parseLine(line, delimiter);
    return headers.reduce((record, header, index) => {
      record[header] = values[index]?.trim() ?? "";
      return record;
    }, {});
  });
  return { headers, rows, delimiter };
}

export async function readCsvFile(file) {
  const text = await file.text();
  return parseCsv(text);
}

export function validateCsvHeaders(headers) {
  const required = ["SERVICO", "PESO", "VALOR", "CEP", "CIDADE", "UF", "ALTURA", "LARGURA", "COMPRIMENTO"];
  const missing = required.filter((header) => !headers.includes(header));
  return { valid: missing.length === 0, missing };
}
