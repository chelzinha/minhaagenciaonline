const HEADER_ROW_FILTRO_DATA = 1;

function MENU_ABRIR_FILTRO_DATA() {
  const html = HtmlService
    .createHtmlOutputFromFile('SidebarFiltroData')
    .setTitle('Filtro por data');

  SpreadsheetApp.getUi().showSidebar(html);
}

function MENU_LIMPAR_FILTRO_DATA() {
  const sheet = SpreadsheetApp.getActiveSheet();

  limparFiltroData_(sheet);

  SpreadsheetApp.getActive().toast('Filtro de ANO/MÊS/DIA limpo.', 'Filtros', 4);

  return obterTotalValorLinhasVisiveisDaSheet_(sheet);
}

function aplicarFiltroData(payload) {
  payload = payload || {};

  const sheet = SpreadsheetApp.getActiveSheet();
  const headerRow = HEADER_ROW_FILTRO_DATA;

  const cols = localizarColunasFiltroData_(sheet, headerRow);

  const filter = obterOuCriarFiltroCompleto_(sheet, headerRow, [
    cols.colAno,
    cols.colMes,
    cols.colDia
  ]);

  limparCriteriosColunas_(filter, [
    cols.colAno,
    cols.colMes,
    cols.colDia
  ]);

  const anos = extrairListaNumericaFiltroData_(payload, 'anos', 'ano');
  const meses = extrairListaNumericaFiltroData_(payload, 'meses', 'mes');
  const dias = extrairListaNumericaFiltroData_(payload, 'dias', 'dia');

  if (anos !== null) {
    aplicarCriterioPorValoresVisiveis_(sheet, filter, cols.colAno, headerRow, anos);
  }

  if (meses !== null) {
    aplicarCriterioPorValoresVisiveis_(sheet, filter, cols.colMes, headerRow, meses);
  }

  if (dias !== null) {
    aplicarCriterioPorValoresVisiveis_(sheet, filter, cols.colDia, headerRow, dias);
  }

  SpreadsheetApp.flush();

  SpreadsheetApp.getActive().toast('Filtro aplicado com sucesso.', 'Filtros', 4);

  return obterTotalValorLinhasVisiveisDaSheet_(sheet);
}

function obterOpcoesFiltroData() {
  const sheet = SpreadsheetApp.getActiveSheet();
  const headerRow = HEADER_ROW_FILTRO_DATA;
  const lastRow = sheet.getLastRow();

  if (lastRow <= headerRow) {
    return {
      sheetName: sheet.getName(),
      combos: [],
      linhasEncontradas: 0,
      totalValor: 0
    };
  }

  const cols = localizarColunasFiltroDataValor_(sheet, headerRow);

  const minCol = Math.min(cols.colAno, cols.colMes, cols.colDia, cols.colValor);
  const maxCol = Math.max(cols.colAno, cols.colMes, cols.colDia, cols.colValor);

  const values = sheet
    .getRange(headerRow + 1, minCol, lastRow - headerRow, maxCol - minCol + 1)
    .getDisplayValues();

  const idxAno = cols.colAno - minCol;
  const idxMes = cols.colMes - minCol;
  const idxDia = cols.colDia - minCol;
  const idxValor = cols.colValor - minCol;

  const mapa = {};
  let linhasEncontradas = 0;
  let totalValor = 0;

  values.forEach(row => {
    const ano = numeroInteiroFiltroData_(row[idxAno]);
    const mes = numeroInteiroFiltroData_(row[idxMes]);
    const dia = numeroInteiroFiltroData_(row[idxDia]);
    const valor = numeroMoedaFiltroData_(row[idxValor]);

    if (!ano || !mes || !dia) return;
    if (mes < 1 || mes > 12) return;
    if (dia < 1 || dia > 31) return;

    const key = `${ano}|${mes}|${dia}`;

    if (!mapa[key]) {
      mapa[key] = {
        ano,
        mes,
        dia,
        linhas: 0,
        totalValor: 0
      };
    }

    mapa[key].linhas++;
    mapa[key].totalValor += valor;

    linhasEncontradas++;
    totalValor += valor;
  });

  const combos = Object.values(mapa)
    .sort((a, b) => {
      return a.ano - b.ano || a.mes - b.mes || a.dia - b.dia;
    });

  return {
    sheetName: sheet.getName(),
    combos,
    linhasEncontradas,
    totalValor
  };
}

function obterTotalValorLinhasVisiveis() {
  const sheet = SpreadsheetApp.getActiveSheet();
  return obterTotalValorLinhasVisiveisDaSheet_(sheet);
}

function obterTotalValorLinhasVisiveisDaSheet_(sheet) {
  SpreadsheetApp.flush();

  const headerRow = HEADER_ROW_FILTRO_DATA;
  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();

  if (lastRow <= headerRow || lastCol < 1) {
    return {
      totalValor: 0,
      linhasVisiveis: 0
    };
  }

  const cols = localizarColunasFiltroDataValor_(sheet, headerRow);

  const displayValues = sheet
    .getRange(headerRow + 1, 1, lastRow - headerRow, lastCol)
    .getDisplayValues();

  const rawValores = sheet
    .getRange(headerRow + 1, cols.colValor, lastRow - headerRow, 1)
    .getValues()
    .flat();

  const criterios = obterCriteriosOcultosDoFiltro_(sheet);

  let totalValor = 0;
  let linhasVisiveis = 0;

  displayValues.forEach((row, index) => {
    if (linhaEstaOcultaPorCriterios_(row, criterios)) return;

    const ano = numeroInteiroFiltroData_(row[cols.colAno - 1]);
    const mes = numeroInteiroFiltroData_(row[cols.colMes - 1]);
    const dia = numeroInteiroFiltroData_(row[cols.colDia - 1]);

    if (!ano || !mes || !dia) return;
    if (mes < 1 || mes > 12) return;
    if (dia < 1 || dia > 31) return;

    const valorRaw = rawValores[index];
    const valorDisplay = row[cols.colValor - 1];

    const valor = typeof valorRaw === 'number'
      ? valorRaw
      : numeroMoedaFiltroData_(valorDisplay);

    totalValor += valor;
    linhasVisiveis++;
  });

  return {
    totalValor,
    linhasVisiveis
  };
}

function obterCriteriosOcultosDoFiltro_(sheet) {
  const filter = sheet.getFilter();
  const criterios = [];

  if (!filter) return criterios;

  const range = filter.getRange();
  const startCol = range.getColumn();
  const numCols = range.getNumColumns();

  for (let relCol = 1; relCol <= numCols; relCol++) {
    let criteria = null;

    try {
      criteria = filter.getColumnFilterCriteria(relCol);
    } catch (err) {
      criteria = null;
    }

    if (!criteria) continue;

    let hiddenValues = [];

    try {
      hiddenValues = criteria.getHiddenValues() || [];
    } catch (err) {
      hiddenValues = [];
    }

    if (!hiddenValues.length) continue;

    const absCol = startCol + relCol - 1;

    criterios.push({
      absCol,
      hiddenSet: new Set(
        hiddenValues.map(v => normalizarValorFiltro_(v))
      )
    });
  }

  return criterios;
}

function linhaEstaOcultaPorCriterios_(row, criterios) {
  for (let i = 0; i < criterios.length; i++) {
    const criterio = criterios[i];
    const valorCelula = normalizarValorFiltro_(row[criterio.absCol - 1]);

    if (criterio.hiddenSet.has(valorCelula)) {
      return true;
    }
  }

  return false;
}

function limparFiltroData_(sheet) {
  const headerRow = HEADER_ROW_FILTRO_DATA;

  const filter = sheet.getFilter();
  if (!filter) return;

  const cols = localizarColunasFiltroData_(sheet, headerRow);

  const filtroCompleto = obterOuCriarFiltroCompleto_(sheet, headerRow, [
    cols.colAno,
    cols.colMes,
    cols.colDia
  ]);

  limparCriteriosColunas_(filtroCompleto, [
    cols.colAno,
    cols.colMes,
    cols.colDia
  ]);

  SpreadsheetApp.flush();
}

function limparFiltrosAbaAtual() {
  const sheet = SpreadsheetApp.getActiveSheet();
  limparTodosFiltrosDaAba_(sheet);
  SpreadsheetApp.getActive().toast('Filtros da aba atual limpos.', 'Filtros', 4);
}

function limparFiltrosTodasAbas() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheets = ss.getSheets();

  sheets.forEach(sheet => {
    limparTodosFiltrosDaAba_(sheet);
  });

  SpreadsheetApp.getActive().toast('Filtros de todas as abas limpos.', 'Filtros', 4);
}

function limparTodosFiltrosDaAba_(sheet) {
  const filter = sheet.getFilter();

  if (!filter) return;

  const range = filter.getRange();

  filter.remove();
  range.createFilter();

  SpreadsheetApp.flush();
}

function localizarColunasFiltroData_(sheet, headerRow) {
  const lastCol = sheet.getLastColumn();

  const headers = sheet
    .getRange(headerRow, 1, 1, lastCol)
    .getValues()[0]
    .map(normalizarHeaderFiltroData_);

  const colAno = headers.indexOf('ANO') + 1;
  const colMes = headers.indexOf('MES') + 1;
  const colDia = headers.indexOf('DIA') + 1;

  if (!colAno || !colMes || !colDia) {
    throw new Error('Não encontrei as colunas ANO, MÊS e DIA na linha ' + headerRow + '.');
  }

  return {
    colAno,
    colMes,
    colDia
  };
}

function localizarColunasFiltroDataValor_(sheet, headerRow) {
  const lastCol = sheet.getLastColumn();

  const headers = sheet
    .getRange(headerRow, 1, 1, lastCol)
    .getValues()[0]
    .map(normalizarHeaderFiltroData_);

  const colAno = headers.indexOf('ANO') + 1;
  const colMes = headers.indexOf('MES') + 1;
  const colDia = headers.indexOf('DIA') + 1;
  const colValor = headers.indexOf('VALOR') + 1;

  if (!colAno || !colMes || !colDia) {
    throw new Error('Não encontrei as colunas ANO, MÊS e DIA na linha ' + headerRow + '.');
  }

  if (!colValor) {
    throw new Error('Não encontrei a coluna VALOR na linha ' + headerRow + '.');
  }

  return {
    colAno,
    colMes,
    colDia,
    colValor
  };
}

function obterOuCriarFiltroCompleto_(sheet, headerRow, requiredCols) {
  let filter = sheet.getFilter();

  const lastRow = Math.max(sheet.getLastRow(), headerRow);
  const lastCol = sheet.getLastColumn();
  const maxRequiredCol = Math.max.apply(null, requiredCols || [lastCol]);

  if (!lastCol) {
    throw new Error('A aba atual não tem colunas para aplicar filtro.');
  }

  if (!filter) {
    return sheet
      .getRange(headerRow, 1, lastRow - headerRow + 1, lastCol)
      .createFilter();
  }

  const range = filter.getRange();
  const startRow = range.getRow();
  const startCol = range.getColumn();
  const endCol = startCol + range.getNumColumns() - 1;

  const filtroCobreColunasNecessarias =
    startRow === headerRow &&
    startCol === 1 &&
    endCol >= maxRequiredCol;

  if (filtroCobreColunasNecessarias) {
    return filter;
  }

  filter.remove();

  return sheet
    .getRange(headerRow, 1, lastRow - headerRow + 1, lastCol)
    .createFilter();
}

function limparCriteriosColunas_(filter, cols) {
  cols.forEach(col => {
    try {
      filter.removeColumnFilterCriteria(col);
    } catch (err) {}
  });
}

function aplicarCriterioPorValoresVisiveis_(sheet, filter, absCol, headerRow, valoresSelecionados) {
  const lastRow = sheet.getLastRow();

  if (lastRow <= headerRow) return;

  const selecionados = new Set(
    (valoresSelecionados || [])
      .map(numeroInteiroFiltroData_)
      .filter(v => v !== null)
  );

  const displayValues = sheet
    .getRange(headerRow + 1, absCol, lastRow - headerRow, 1)
    .getDisplayValues()
    .flat()
    .map(v => String(v || '').trim());

  const valoresUnicos = Array.from(new Set(displayValues));

  const valoresOcultos = valoresUnicos.filter(v => {
    const n = numeroInteiroFiltroData_(v);
    return !selecionados.has(n);
  });

  const criteria = SpreadsheetApp
    .newFilterCriteria()
    .setHiddenValues(valoresOcultos)
    .build();

  filter.setColumnFilterCriteria(absCol, criteria);
}

function extrairListaNumericaFiltroData_(payload, chavePlural, chaveSingular) {
  let raw;

  if (Object.prototype.hasOwnProperty.call(payload, chavePlural)) {
    raw = payload[chavePlural];
  } else if (Object.prototype.hasOwnProperty.call(payload, chaveSingular)) {
    raw = payload[chaveSingular];
  } else {
    return null;
  }

  if (raw === null || raw === undefined || raw === '') {
    return null;
  }

  const lista = Array.isArray(raw) ? raw : [raw];

  return Array.from(
    new Set(
      lista
        .map(numeroInteiroFiltroData_)
        .filter(v => v !== null)
    )
  );
}

function normalizarHeaderFiltroData_(valor) {
  return String(valor || '')
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase();
}

function normalizarValorFiltro_(valor) {
  return String(valor === null || valor === undefined ? '' : valor)
    .trim();
}

function numeroInteiroFiltroData_(valor) {
  if (valor === null || valor === undefined || valor === '') return null;

  const n = Number(
    String(valor)
      .trim()
      .replace(',', '.')
  );

  if (!Number.isFinite(n)) return null;

  return Math.trunc(n);
}

function numeroMoedaFiltroData_(valor) {
  if (valor === null || valor === undefined || valor === '') return 0;

  if (typeof valor === 'number') {
    return Number.isFinite(valor) ? valor : 0;
  }

  let txt = String(valor)
    .trim()
    .replace(/\s/g, '')
    .replace(/[^\d,.\-]/g, '');

  if (!txt || txt === '-') return 0;

  const negativo = txt.includes('-');
  txt = txt.replace(/-/g, '');

  const lastComma = txt.lastIndexOf(',');
  const lastDot = txt.lastIndexOf('.');

  if (lastComma >= 0 && lastDot >= 0) {
    if (lastComma > lastDot) {
      txt = txt.replace(/\./g, '').replace(',', '.');
    } else {
      txt = txt.replace(/,/g, '');
    }
  } else if (lastComma >= 0) {
    txt = txt.replace(/\./g, '').replace(',', '.');
  } else if (lastDot >= 0) {
    const parts = txt.split('.');

    if (parts.length > 2) {
      const decimal = parts.pop();
      txt = parts.join('') + '.' + decimal;
    } else if (parts.length === 2 && parts[1].length === 3) {
      txt = parts.join('');
    }
  }

  const n = Number(txt);

  if (!Number.isFinite(n)) return 0;

  return negativo ? -n : n;
}

function TESTE_OBTER_OPCOES_FILTRO_DATA() {
  const resultado = obterOpcoesFiltroData();
  Logger.log(JSON.stringify(resultado, null, 2));
}

function TESTE_TOTAL_VALOR_VISIVEL() {
  const resultado = obterTotalValorLinhasVisiveis();
  Logger.log(JSON.stringify(resultado, null, 2));
}