const DATA_FILES = [
  "data/processed/gastos_por_objeto_2026-01-31.csv", "data/processed/gastos_por_objeto_2026-02-28.csv", "data/processed/gastos_por_objeto_2026-03-31.csv",
  "data/processed/gastos_por_objeto_2026-04-30.csv", "data/processed/gastos_por_objeto_2026-05-31.csv", "data/processed/gastos_por_objeto_2026-06-30.csv",
  "data/processed/gastos_por_objeto_2026-07-31.csv", "data/processed/gastos_por_objeto_2026-08-31.csv", "data/processed/gastos_por_objeto_2026-09-30.csv",
];
const $ = (selector) => document.querySelector(selector);
const currency = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });
const dateFormat = new Intl.DateTimeFormat("es-AR", { month: "short", year: "numeric", timeZone: "UTC" });
let data = [], selectedPeriods = new Set(), selectedPrograms = new Set(), expandedSecretaries = new Set(), activeChart = "line", showBarValues = false, tableSort = { key: "accrued", direction: "desc" };

function parseCSV(text) {
  const records = []; let record = [], field = "", quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index], next = text[index + 1];
    if (char === '"' && quoted && next === '"') { field += '"'; index += 1; }
    else if (char === '"') quoted = !quoted;
    else if (char === "," && !quoted) { record.push(field); field = ""; }
    else if ((char === "\n" || char === "\r") && !quoted) { if (char === "\r" && next === "\n") index += 1; record.push(field); if (record.some(Boolean)) records.push(record); record = []; field = ""; }
    else field += char;
  }
  record.push(field); if (record.some(Boolean)) records.push(record);
  const [columns, ...rows] = records;
  return rows.map((row) => Object.fromEntries(columns.map((column, index) => [column, row[index] ?? ""])));
}
function cents(row, field) { return Number(row[field] || 0); }
function date(row) { const [day, month, year] = row.fecha_corte.split("/"); return new Date(Date.UTC(year, month - 1, day)); }
function labelPeriod(value) { return dateFormat.format(date({ fecha_corte: value })); }
function unique(values) { return [...new Set(values)].sort((a, b) => a.localeCompare(b, "es")); }
function escapeHtml(value) { return String(value).replace(/[&<>"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[char]); }
function formatCents(value) { return currency.format(value / 100); }
function formatAxisAmount(value) { const pesos = Math.abs(value) / 100, sign = value < 0 ? "−" : ""; if (pesos >= 1e9) return `${sign}$ ${(pesos / 1e9).toLocaleString("es-AR", { maximumFractionDigits: 1 })} mil M`; if (pesos >= 1e6) return `${sign}$ ${(pesos / 1e6).toLocaleString("es-AR", { maximumFractionDigits: 1 })} M`; return `${sign}${currency.format(pesos)}`; }
function niceStep(value) { if (!value || value <= 0) return 1; const magnitude = 10 ** Math.floor(Math.log10(value)), fraction = value / magnitude, rounded = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10; return rounded * magnitude; }
function sum(rows, field) { return rows.reduce((total, row) => total + cents(row, field), 0); }
function executionPercent(accrued, current) { return current > 0 ? accrued / current * 100 : null; }
function formatPercent(value) { return value === null ? "—" : `${value.toLocaleString("es-AR", { maximumFractionDigits: 1 })}%`; }
function populateSelect(id, values, label) { $(id).innerHTML = `<option value="">${label}</option>${values.map((v) => `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`).join("")}`; }
function periods() { return unique(data.map((row) => row.fecha_corte)).sort((a, b) => date({ fecha_corte: a }) - date({ fecha_corte: b })); }

function fillFilters() {
  selectedPeriods = new Set(periods());
  const byYear = new Map();
  periods().forEach((period) => { const year = period.split("/")[2]; byYear.set(year, [...(byYear.get(year) || []), period]); });
  $("#period-filter").innerHTML = [...byYear.entries()].map(([year, yearPeriods]) => `<section class="period-year"><div class="period-year-heading"><strong>${year}</strong><button class="small-action" type="button" data-year="${year}">Todo el año</button></div><div class="month-list">${yearPeriods.map((period) => `<button type="button" class="month-option active" data-period="${period}" aria-pressed="true">${escapeHtml(labelPeriod(period).split(" ")[0])}</button>`).join("")}</div></section>`).join("");
  populateSelect("#jurisdiction-filter", unique(data.map((r) => r.jurisdiccion_nombre)), "Todas las secretarías");
  populateSelect("#source-filter", unique(data.map((r) => r.fuente_financiamiento_nombre)), "Todas las fuentes");
  populateSelect("#object-filter", unique(data.map((r) => `${r.objeto_gasto_codigo} · ${r.objeto_gasto_nombre}`)), "Todos los objetos");
}
function programsForSelectedJurisdiction() { const jurisdiction = $("#jurisdiction-filter").value; return unique(data.filter((row) => row.jurisdiccion_nombre === jurisdiction).map((row) => row.programa_nombre)); }
function renderProgramChips() {
  const panel = $("#program-panel"), programs = programsForSelectedJurisdiction();
  panel.hidden = !programs.length;
  if (!programs.length) return;
  $("#program-title").textContent = `Programas de ${$("#jurisdiction-filter").value}`;
  $("#program-filter").innerHTML = programs.map((program) => `<div class="program-option"><label><input type="checkbox" data-program="${escapeHtml(program)}" ${selectedPrograms.has(program) ? "checked" : ""}><span>${escapeHtml(program)}</span></label><button class="only-program" type="button" data-only-program="${escapeHtml(program)}">Únicamente</button></div>`).join("");
}
function filteredRows() {
  const jurisdiction = $("#jurisdiction-filter").value, source = $("#source-filter").value, object = $("#object-filter").value;
  return data.filter((row) => selectedPeriods.has(row.fecha_corte) && (!jurisdiction || row.jurisdiccion_nombre === jurisdiction) && (!jurisdiction || selectedPrograms.has(row.programa_nombre)) && (!source || row.fuente_financiamiento_nombre === source) && (!object || `${row.objeto_gasto_codigo} · ${row.objeto_gasto_nombre}` === object));
}
function aggregatePeriods(rows) {
  const byPeriod = new Map();
  rows.forEach((row) => { const values = byPeriod.get(row.fecha_corte) || { period: row.fecha_corte, approved: 0, current: 0, accrued: 0 }; values.approved += cents(row, "credito_aprobado_centavos"); values.current += cents(row, "credito_vigente_centavos"); values.accrued += cents(row, "devengado_centavos"); byPeriod.set(row.fecha_corte, values); });
  return [...byPeriod.values()].sort((a, b) => date({ fecha_corte: a.period }) - date({ fecha_corte: b.period }));
}
function selectedPeriodSequence() { return [...selectedPeriods].sort((a, b) => date({ fecha_corte: a }) - date({ fecha_corte: b })); }
function selectionDetails(latestPeriod, previousPeriod) {
  const jurisdictionSelected = $("#jurisdiction-filter").value;
  const availablePrograms = programsForSelectedJurisdiction();
  const selectedNames = availablePrograms.filter((program) => selectedPrograms.has(program));
  let programs = "Todos los programas";
  if (jurisdictionSelected) {
    if (!selectedNames.length) programs = "Ningún programa";
    else if (selectedNames.length === availablePrograms.length) programs = `Todos (${selectedNames.length})`;
    else if (selectedNames.length <= 2) programs = selectedNames.join("; ");
    else programs = `${selectedNames.slice(0, 2).join("; ")} y ${selectedNames.length - 2} más`;
  }
  return {
    jurisdiction: jurisdictionSelected || "Todas las secretarías",
    programs,
    period: latestPeriod ? labelPeriod(latestPeriod) : "Sin período seleccionado",
    previous: previousPeriod ? labelPeriod(previousPeriod) : "",
    source: $("#source-filter").value,
    object: $("#object-filter").value,
  };
}
function selectionDescription(latestPeriod, previousPeriod) {
  const details = selectionDetails(latestPeriod, previousPeriod);
  const pieces = [`Secretaría: ${details.jurisdiction}`, `Programas: ${details.programs}`, `Período: ${details.period}`];
  if (details.previous) pieces.push(`Comparación: ${details.previous}`);
  if (details.source) pieces.push(`Fuente: ${details.source}`);
  if (details.object) pieces.push(`Objeto: ${details.object}`);
  return pieces.join(" · ");
}
function renderMetrics(rows, latestPeriod, previousPeriod, previousRows) {
  const values = totals(rows), approved = values.approved, current = values.current, accrued = values.accrued, available = values.available;
  const execution = executionPercent(accrued, current);
  $("#metric-approved").textContent = formatCents(approved); $("#metric-current").textContent = formatCents(current); $("#metric-accrued").textContent = formatCents(accrued); $("#metric-available").textContent = formatCents(available);
  const setTrend = (selector, label, change) => { const element = $(selector); element.classList.remove("positive", "negative"); element.textContent = change === null ? "Sin período previo seleccionado" : `${label}: ${change >= 0 ? "+" : "−"}${formatCents(Math.abs(change))}`; if (change !== null && change !== 0) element.classList.add(change > 0 ? "positive" : "negative"); };
  const modification = current - approved;
  setTrend("#metric-approved-change", "Modificación acumulada", modification);
  const previousValues = previousRows ? totals(previousRows) : null;
  setTrend("#metric-current-change", previousPeriod ? `Variación vs. ${labelPeriod(previousPeriod)}` : "Variación", previousValues ? current - previousValues.current : null);
  setTrend("#metric-accrued-change", previousPeriod ? `Variación vs. ${labelPeriod(previousPeriod)}` : "Variación", previousValues ? accrued - previousValues.accrued : null);
  setTrend("#metric-available-change", previousPeriod ? `Variación vs. ${labelPeriod(previousPeriod)}` : "Variación", previousValues ? available - previousValues.available : null);
  $("#metric-execution").textContent = formatPercent(execution);
  const monthNumber = latestPeriod ? Number(latestPeriod.split("/")[1]) : 0;
  const expected = monthNumber ? monthNumber * 100 / 12 : null;
  const executionDifference = execution === null || expected === null ? null : execution - expected;
  const executionNote = $("#metric-execution-benchmark"); executionNote.classList.remove("positive", "negative"); executionNote.textContent = executionDifference === null ? "Sin período" : `${executionDifference >= 0 ? "+" : "−"}${Math.abs(executionDifference).toLocaleString("es-AR", { maximumFractionDigits: 1 })} p.p. frente al ritmo esperado`; if (executionDifference !== null && executionDifference !== 0) executionNote.classList.add(executionDifference > 0 ? "positive" : "negative");
  $("#summary-context").textContent = selectionDescription(latestPeriod, previousPeriod);
}
function chartTooltip(value, series) {
  if (series === "execution" || series === "expected") {
    const difference = value.execution === null ? null : value.execution - value.expected;
    return `<div class="tooltip-period">${escapeHtml(labelPeriod(value.period))}</div><div class="tooltip-row"><span class="tooltip-key key-execution">Ejecución real</span><strong>${formatPercent(value.execution)}</strong></div><div class="tooltip-row"><span class="tooltip-key key-expected">Ritmo esperado</span><strong>${formatPercent(value.expected)}</strong></div><div class="tooltip-divider"></div><div class="tooltip-row"><span>Diferencia</span><strong class="${difference >= 0 ? "positive" : "negative"}">${difference === null ? "—" : `${difference >= 0 ? "+" : ""}${difference.toLocaleString("es-AR", { maximumFractionDigits: 1 })} p.p.`}</strong></div><p>El esperado distribuye el 100% en doce meses.</p>`;
  }
  return `<div class="tooltip-period">${escapeHtml(labelPeriod(value.period))}</div><div class="tooltip-row"><span class="tooltip-key key-modification">Modificación</span><strong class="${value.modification >= 0 ? "positive" : "negative"}">${value.modification >= 0 ? "+" : ""}${formatCents(value.modification)}</strong></div><div class="tooltip-divider"></div><div class="tooltip-row"><span>Crédito aprobado</span><strong>${formatCents(value.approved)}</strong></div><div class="tooltip-row"><span>Crédito vigente</span><strong>${formatCents(value.current)}</strong></div>`;
}
function renderChart(rows) {
  const values = aggregatePeriods(rows).map((value) => ({ ...value, modification: value.current - value.approved, execution: executionPercent(value.accrued, value.current), expected: Number(value.period.split("/")[1]) * 100 / 12 })), chart = $("#chart");
  $("#bar-value-control").hidden = activeChart !== "bar";
  if (!values.length) { chart.innerHTML = "<p class='note'>No hay datos para esta combinación de filtros.</p>"; return; }
  const width = 900, height = 340, pad = { top: 26, right: 28, bottom: 54, left: 96 };
  let min = 0, max, ticks;
  if (activeChart === "line") {
    max = Math.max(100, Math.ceil(Math.max(...values.flatMap((value) => [value.execution || 0, value.expected])) / 25) * 25);
    ticks = Array.from({ length: Math.floor(max / 25) + 1 }, (_, index) => index * 25);
  } else {
    const largest = Math.max(...values.map((value) => Math.abs(value.modification)), 1), step = niceStep(largest / 3), limit = Math.max(step, Math.ceil(largest / step) * step);
    min = -limit; max = limit; ticks = []; for (let tick = min; tick <= max + step / 2; tick += step) ticks.push(Math.abs(tick) < step / 1000 ? 0 : tick);
  }
  const plotWidth = width - pad.left - pad.right;
  const x = (i) => activeChart === "bar" ? pad.left + (i + .5) * plotWidth / values.length : values.length === 1 ? width / 2 : pad.left + 18 + i * (plotWidth - 36) / (values.length - 1);
  const y = (value) => height - pad.bottom - (value - min) / (max - min || 1) * (height - pad.top - pad.bottom);
  const axes = ticks.map((tick) => { const yy = y(tick); return `<line class="grid-line" x1="${pad.left}" x2="${width - pad.right}" y1="${yy}" y2="${yy}"/><text class="axis-label" x="${pad.left - 12}" y="${yy + 4}" text-anchor="end">${activeChart === "line" ? `${tick}%` : formatAxisAmount(tick)}</text>`; }).join("");
  const labels = values.map((value, index) => `<text class="axis-label" x="${x(index)}" y="${height - 16}" text-anchor="middle">${escapeHtml(labelPeriod(value.period))}</text>`).join("");
  let marks = "", zeroLine = "";
  if (activeChart === "line") {
    const path = (field) => values.map((value, index) => `${index ? "L" : "M"}${x(index).toFixed(1)},${y(value[field]).toFixed(1)}`).join(" ");
    marks = `<path class="line-execution" d="${path("execution")}"/><path class="line-expected" d="${path("expected")}"/>` + values.map((value, index) => `<circle class="chart-point point-execution" data-index="${index}" data-series="execution" cx="${x(index)}" cy="${y(value.execution || 0)}" r="5"/><circle class="chart-point point-expected" data-index="${index}" data-series="expected" cx="${x(index)}" cy="${y(value.expected)}" r="4"/>`).join("");
    $("#chart-title").textContent = "Ejecución real y ritmo esperado";
    $("#chart-legend").innerHTML = '<span class="legend-execution"></span>% ejecutado <span class="legend-expected"></span>% esperado';
  } else {
    const band = Math.min(52, (width - pad.left - pad.right) / Math.max(values.length * 1.8, 2));
    const zeroY = y(0);
    zeroLine = `<line class="zero-line" x1="${pad.left}" x2="${width - pad.right}" y1="${zeroY}" y2="${zeroY}"/>`;
    marks = values.map((value, index) => { const modificationY = y(value.modification), status = value.modification > 0 ? "positive-bar" : value.modification < 0 ? "negative-bar" : "zero-bar", valueLabel = showBarValues ? `<text class="bar-value ${value.modification >= 0 ? "bar-value-positive" : "bar-value-negative"}" x="${x(index)}" y="${value.modification >= 0 ? modificationY - 9 : modificationY + 18}" text-anchor="middle">${escapeHtml(formatAxisAmount(value.modification))}</text>` : ""; return `<rect class="chart-point bar-modification ${status}" data-index="${index}" data-series="modification" x="${x(index) - band / 2}" y="${Math.min(zeroY, modificationY)}" width="${band}" height="${Math.max(2, Math.abs(zeroY - modificationY))}" rx="5"/>${valueLabel}`; }).join("");
    $("#chart-title").textContent = "Evolución de las modificaciones presupuestarias";
    $("#chart-legend").innerHTML = '<span class="legend-positive"></span>Aumento <span class="legend-negative"></span>Reducción';
  }
  chart.innerHTML = `<svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMidYMid meet">${axes}${zeroLine}${marks}${labels}</svg><div id="chart-tooltip" class="chart-tooltip" role="status"></div>`;
  chart.dataset.values = JSON.stringify(values);
  $("#chart-note").textContent = values.length < 2 ? "Seleccioná más períodos para comparar la evolución." : activeChart === "line" ? "La línea esperada distribuye el 100% del crédito en doce meses. Posate sobre un punto para comparar." : "Cada barra muestra crédito vigente menos crédito aprobado. Verde indica aumento y rojo indica reducción.";
}
function rankingLabel(row, dimension) {
  if (dimension === "program") return `${row.jurisdiccion_nombre} · ${row.programa_codigo} · ${row.programa_nombre}`;
  if (dimension === "source") return row.fuente_financiamiento_nombre;
  if (dimension === "object") return `${row.objeto_gasto_codigo} · ${row.objeto_gasto_nombre}`;
  return row.jurisdiccion_nombre;
}
function rankingGroups(rows, dimension, period) {
  const groups = new Map();
  rows.forEach((row) => { const label = rankingLabel(row, dimension), group = groups.get(label) || []; group.push(row); groups.set(label, group); });
  const expected = period ? Number(period.split("/")[1]) * 100 / 12 : 0;
  return [...groups.entries()].map(([label, group]) => {
    const values = totals(group), execution = executionPercent(values.accrued, values.current);
    return { label, values, execution, expected, modification: values.current - values.approved, shortfall: execution === null ? null : expected - execution };
  });
}
function rankingList(items, valueRenderer, emptyMessage) {
  if (!items.length) return `<li class="ranking-empty">${escapeHtml(emptyMessage)}</li>`;
  return items.slice(0, 5).map((item, index) => `<li><span class="ranking-position">${index + 1}</span><div><strong title="${escapeHtml(item.label)}">${escapeHtml(item.label)}</strong><small>${valueRenderer(item)}</small></div></li>`).join("");
}
function renderRankings(rows, latestPeriod) {
  const dimension = $("#ranking-dimension").value, groups = rankingGroups(rows, dimension, latestPeriod);
  const under = groups.filter((item) => item.execution !== null && item.shortfall > 0).sort((a, b) => b.shortfall - a.shortfall);
  const defunded = groups.filter((item) => item.modification < 0).sort((a, b) => a.modification - b.modification);
  const funded = groups.filter((item) => item.modification > 0).sort((a, b) => b.modification - a.modification);
  const over = groups.filter((item) => item.execution !== null).sort((a, b) => b.execution - a.execution);
  $("#ranking-under").innerHTML = rankingList(under, (item) => `${formatPercent(item.execution)} ejecutado · esperado ${formatPercent(item.expected)}`, "Sin grupos con crédito vigente");
  $("#ranking-defunded").innerHTML = rankingList(defunded, (item) => `${formatCents(Math.abs(item.modification))} menos que el aprobado`, "Sin reducciones de crédito");
  $("#ranking-funded").innerHTML = rankingList(funded, (item) => `+${formatCents(item.modification)} sobre el aprobado`, "Sin aumentos de crédito");
  $("#ranking-over").innerHTML = rankingList(over, (item) => `${formatPercent(item.execution)} del crédito vigente`, "Sin grupos con crédito vigente");
  const dimensionName = { jurisdiction: "secretaría", program: "programa", source: "fuente", object: "objeto del gasto" }[dimension];
  $("#ranking-context").textContent = latestPeriod ? `Ranking por ${dimensionName} para ${labelPeriod(latestPeriod)}, dentro de los filtros seleccionados.` : "Seleccioná al menos un período para calcular los rankings.";
}
function totals(rows) { return { approved: sum(rows, "credito_aprobado_centavos"), current: sum(rows, "credito_vigente_centavos"), accrued: sum(rows, "devengado_centavos"), available: sum(rows, "credito_disponible_centavos") }; }
function executionAssessment(values, period) {
  const actual = executionPercent(values.accrued, values.current);
  if (actual === null || !period) return { actual, expected: null, status: "unknown" };
  const month = Number(period.split("/")[1]), expected = month * 100 / 12, difference = actual - expected;
  const status = difference < -10 ? "red" : difference < -5 ? "yellow" : difference <= 5 ? "green" : difference < 10 ? "yellow" : "blue";
  return { actual, expected, status };
}
function columnShare(value, total) { return total ? `${(value / total * 100).toLocaleString("es-AR", { maximumFractionDigits: 1 })}%` : "—"; }
function amountCell(value, columnTotal) { return `<td class="number"><span>${formatCents(value)}</span><small class="cell-share">(${columnShare(value, columnTotal)} del total)</small></td>`; }
function totalCells(values, period, columnTotals) {
  const assessment = executionAssessment(values, period);
  const difference = assessment.actual === null ? null : assessment.actual - assessment.expected;
  const title = assessment.expected === null ? "Porcentaje no disponible" : `${formatPercent(assessment.actual)} ejecutado; ritmo lineal esperado a ${period}: ${formatPercent(assessment.expected)}; diferencia ${difference.toLocaleString("es-AR", { maximumFractionDigits: 1 })} puntos porcentuales.`;
  return `${amountCell(values.approved, columnTotals.approved)}${amountCell(values.current, columnTotals.current)}${amountCell(values.accrued, columnTotals.accrued)}${amountCell(values.available, columnTotals.available)}<td class="number"><span class="execution-pill execution-${assessment.status}" title="${escapeHtml(title)}">${formatPercent(assessment.actual)}</span></td>`;
}
function sortedGroups(entries) {
  const direction = tableSort.direction === "asc" ? 1 : -1;
  return [...entries].sort(([labelA, rowsA], [labelB, rowsB]) => {
    if (tableSort.key === "name" || tableSort.key === "breakdown") return labelA.localeCompare(labelB, "es") * direction;
    const valuesA = totals(rowsA), valuesB = totals(rowsB);
    const metric = tableSort.key === "execution" ? null : tableSort.key;
    const a = metric ? valuesA[metric] : executionPercent(valuesA.accrued, valuesA.current) ?? -Infinity;
    const b = metric ? valuesB[metric] : executionPercent(valuesB.accrued, valuesB.current) ?? -Infinity;
    return (a - b) * direction;
  });
}
function updateSortHeaders() {
  document.querySelectorAll(".sort-header").forEach((button) => { const active = button.dataset.sort === tableSort.key; button.classList.toggle("active", active); button.querySelector("span").textContent = active ? tableSort.direction === "asc" ? "↑" : "↓" : ""; });
}
function renderTable(rows) {
  const latestPeriod = aggregatePeriods(rows).at(-1)?.period, visibleRows = rows.filter((row) => row.fecha_corte === latestPeriod), breakdown = $("#detail-breakdown-filter").value;
  const columnTotals = totals(visibleRows);
  const bySecretary = new Map(); visibleRows.forEach((row) => { const group = bySecretary.get(row.jurisdiccion_nombre) || []; group.push(row); bySecretary.set(row.jurisdiccion_nombre, group); });
  const entries = sortedGroups([...bySecretary.entries()]);
  $("#detail-table").innerHTML = entries.map(([name, secretaryRows]) => {
    const open = expandedSecretaries.has(name), subdivisions = new Map();
    secretaryRows.forEach((row) => { const label = breakdown === "program" ? `${row.programa_codigo} · ${row.programa_nombre}` : breakdown === "source" ? row.fuente_financiamiento_nombre : `${row.objeto_gasto_codigo} · ${row.objeto_gasto_nombre}`; const group = subdivisions.get(label) || []; group.push(row); subdivisions.set(label, group); });
    const children = open ? sortedGroups([...subdivisions.entries()]).map(([label, group]) => `<tr class="breakdown-row"><td></td><td>${escapeHtml(label)}</td>${totalCells(totals(group), latestPeriod, columnTotals)}</tr>`).join("") : "";
    return `<tr class="secretary-total"><td><button class="expand-row" type="button" data-secretary="${escapeHtml(name)}" aria-expanded="${open}"><span aria-hidden="true">${open ? "▾" : "▸"}</span>${escapeHtml(name)}</button></td><td>Total de secretaría</td>${totalCells(totals(secretaryRows), latestPeriod, columnTotals)}</tr>${children}`;
  }).join("");
  const breakdownName = { program: "programa", source: "fuente de financiamiento", object: "objeto del gasto" }[breakdown];
  $("#table-note").textContent = latestPeriod ? `Totales de ${labelPeriod(latestPeriod)}. Los porcentajes entre paréntesis muestran la participación sobre el total visible de cada columna. Usá la flecha para ver el detalle por ${breakdownName}.` : "No hay partidas para mostrar.";
  updateSortHeaders();
}
function render() {
  const rows = filteredRows(), periodsSelected = selectedPeriodSequence(), latestPeriod = periodsSelected.at(-1), previousPeriod = periodsSelected.at(-2);
  const latestRows = rows.filter((row) => row.fecha_corte === latestPeriod);
  const previousRows = previousPeriod ? rows.filter((row) => row.fecha_corte === previousPeriod) : null;
  renderMetrics(latestRows, latestPeriod, previousPeriod, previousRows); renderRankings(latestRows, latestPeriod); renderChart(rows); renderTable(rows);
}
function resetFilters() {
  selectedPeriods = new Set(periods()); selectedPrograms.clear(); expandedSecretaries.clear(); $("#jurisdiction-filter").value = ""; $("#source-filter").value = ""; $("#object-filter").value = "";
  document.querySelectorAll(".month-option[data-period]").forEach((chip) => { chip.classList.add("active"); chip.setAttribute("aria-pressed", "true"); });
  $("#toggle-periods").textContent = "Quitar todos"; renderProgramChips(); render();
}
function downloadSummary() {
  const canvas = document.createElement("canvas"), context = canvas.getContext("2d");
  const selected = selectedPeriodSequence(), latestPeriod = selected.at(-1), previousPeriod = selected.at(-2), details = selectionDetails(latestPeriod, previousPeriod);
  canvas.width = 1200; canvas.height = 760;
  context.fillStyle = "#f3f6fa"; context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "#0b365b"; context.fillRect(0, 0, canvas.width, 235);
  context.fillStyle = "#bfdef5"; context.font = "700 20px system-ui, sans-serif"; context.fillText("MUNICIPALIDAD DE SANTA FE", 64, 45);
  context.fillStyle = "#ffffff"; context.font = "700 42px system-ui, sans-serif"; context.fillText("Resumen de ejecución presupuestaria", 64, 98);
  context.font = "600 18px system-ui, sans-serif"; context.fillStyle = "#ffffff"; context.fillText(`Secretaría: ${details.jurisdiction}`, 64, 138, 1070);
  context.font = "400 17px system-ui, sans-serif"; context.fillStyle = "#d8e9f7"; context.fillText(`Programa(s): ${details.programs}`, 64, 171, 1070);
  context.fillText(`Período analizado: ${details.period}${details.previous ? ` · Comparación: ${details.previous}` : ""}`, 64, 202, 1070);
  const items = [
    ["Crédito aprobado", "#metric-approved", "#metric-approved-change"], ["Crédito vigente", "#metric-current", "#metric-current-change"], ["Devengado", "#metric-accrued", "#metric-accrued-change"],
    ["Disponible", "#metric-available", "#metric-available-change"], ["% ejecutado", "#metric-execution", "#metric-execution-benchmark"],
  ];
  const gap = 18, margin = 64, cardWidth = (canvas.width - margin * 2 - gap * 2) / 3, cardHeight = 150, startY = 275;
  items.forEach(([label, selector, detailSelector], index) => {
    const col = index % 3, row = Math.floor(index / 3), x = margin + col * (cardWidth + gap), y = startY + row * (cardHeight + gap);
    context.fillStyle = "#ffffff"; context.beginPath(); context.roundRect(x, y, cardWidth, cardHeight, 14); context.fill();
    context.fillStyle = "#60708a"; context.font = "600 18px system-ui, sans-serif"; context.fillText(label, x + 22, y + 39);
    context.fillStyle = "#15233b"; context.font = "700 28px system-ui, sans-serif"; context.fillText($(selector).textContent, x + 22, y + 88, cardWidth - 44);
    context.fillStyle = "#60708a"; context.font = "400 14px system-ui, sans-serif"; context.fillText($(detailSelector).textContent, x + 22, y + 121, cardWidth - 44);
  });
  context.fillStyle = "#60708a"; context.font = "400 14px system-ui, sans-serif"; context.fillText("Fuente: Estado de Ejecución del Presupuesto de Gastos por Objeto · Municipalidad de Santa Fe", 64, 725);
  canvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob), anchor = document.createElement("a");
    const filePeriod = (selectedPeriodSequence().at(-1) || "santa-fe").replaceAll("/", "-");
    anchor.href = url; anchor.download = `resumen-presupuestario-${filePeriod}.png`; anchor.click(); URL.revokeObjectURL(url);
  }, "image/png");
}
async function init() {
  try {
    data = (await Promise.all(DATA_FILES.map((file) => fetch(file).then((response) => { if (!response.ok) throw new Error(file); return response.text(); })))).flatMap(parseCSV);
    fillFilters(); render();
    $("#updated-at").textContent = `${data.length.toLocaleString("es-AR")} partidas cargadas · último cierre: ${labelPeriod(periods().at(-1))}`;
    $("#period-filter").addEventListener("click", (event) => {
      const yearButton = event.target.closest("[data-year]");
      if (yearButton) {
        const year = yearButton.dataset.year, yearPeriods = periods().filter((period) => period.endsWith(`/${year}`)), allSelected = yearPeriods.every((period) => selectedPeriods.has(period));
        yearPeriods.forEach((period) => allSelected ? selectedPeriods.delete(period) : selectedPeriods.add(period));
      } else {
        const chip = event.target.closest("[data-period]"); if (!chip) return;
        const period = chip.dataset.period; selectedPeriods.has(period) ? selectedPeriods.delete(period) : selectedPeriods.add(period);
      }
      document.querySelectorAll(".month-option[data-period]").forEach((chip) => { chip.classList.toggle("active", selectedPeriods.has(chip.dataset.period)); chip.setAttribute("aria-pressed", selectedPeriods.has(chip.dataset.period)); });
      const isAllSelected = selectedPeriods.size === periods().length;
      $("#toggle-periods").textContent = isAllSelected ? "Quitar todos" : "Seleccionar todos";
      render();
    });
    $("#jurisdiction-filter").addEventListener("change", () => { selectedPrograms = new Set(programsForSelectedJurisdiction()); expandedSecretaries.clear(); renderProgramChips(); render(); });
    $("#program-filter").addEventListener("change", (event) => { const checkbox = event.target.closest("[data-program]"); if (!checkbox) return; checkbox.checked ? selectedPrograms.add(checkbox.dataset.program) : selectedPrograms.delete(checkbox.dataset.program); renderProgramChips(); render(); });
    $("#program-filter").addEventListener("click", (event) => { const onlyButton = event.target.closest("[data-only-program]"); if (!onlyButton) return; selectedPrograms = new Set([onlyButton.dataset.onlyProgram]); renderProgramChips(); render(); });
    $("#select-all-programs").addEventListener("click", () => { selectedPrograms = new Set(programsForSelectedJurisdiction()); renderProgramChips(); render(); });
    $("#clear-programs").addEventListener("click", () => { selectedPrograms.clear(); renderProgramChips(); render(); });
    $("#toggle-program-panel").addEventListener("click", () => { const body = $("#program-panel-body"), collapsed = !body.hidden; body.hidden = collapsed; $("#toggle-program-panel").textContent = collapsed ? "Mostrar" : "Reducir"; $("#toggle-program-panel").setAttribute("aria-expanded", String(!collapsed)); });
    $("#toggle-filter-sidebar").addEventListener("click", () => { const body = $("#filter-sidebar-body"), collapsed = !body.hidden; body.hidden = collapsed; $("#dashboard-layout").classList.toggle("filters-collapsed", collapsed); $("#toggle-filter-sidebar").textContent = collapsed ? "›" : "‹"; $("#toggle-filter-sidebar").setAttribute("aria-expanded", String(!collapsed)); $("#toggle-filter-sidebar").setAttribute("aria-label", collapsed ? "Desplegar filtros" : "Plegar filtros"); });
    $("#toggle-periods").addEventListener("click", () => { selectedPeriods = selectedPeriods.size === periods().length ? new Set() : new Set(periods()); $("#toggle-periods").textContent = selectedPeriods.size ? "Quitar todos" : "Seleccionar todos"; document.querySelectorAll(".month-option[data-period]").forEach((chip) => { chip.classList.toggle("active", selectedPeriods.has(chip.dataset.period)); chip.setAttribute("aria-pressed", selectedPeriods.has(chip.dataset.period)); }); render(); });
    ["#source-filter", "#object-filter", "#detail-breakdown-filter", "#ranking-dimension"].forEach((id) => $(id).addEventListener("change", render));
    $("#chart").addEventListener("pointermove", (event) => { const mark = event.target.closest(".chart-point"), tooltip = $("#chart-tooltip"); if (!mark || !tooltip) { if (tooltip) tooltip.classList.remove("visible"); return; } const value = JSON.parse($("#chart").dataset.values)[Number(mark.dataset.index)]; tooltip.innerHTML = chartTooltip(value, mark.dataset.series); const rect = $("#chart").getBoundingClientRect(); tooltip.style.left = `${Math.max(4, Math.min(event.clientX - rect.left + 12, rect.width - 270))}px`; tooltip.style.top = `${Math.max(event.clientY - rect.top - 130, 4)}px`; tooltip.classList.add("visible"); });
    $("#chart").addEventListener("pointerleave", () => $("#chart-tooltip")?.classList.remove("visible"));
    document.querySelectorAll(".chart-tab").forEach((tab) => tab.addEventListener("click", () => { activeChart = tab.dataset.chart; document.querySelectorAll(".chart-tab").forEach((item) => { item.classList.toggle("active", item === tab); item.setAttribute("aria-selected", String(item === tab)); }); renderChart(filteredRows()); }));
    $("#show-bar-values").addEventListener("change", (event) => { showBarValues = event.target.checked; renderChart(filteredRows()); });
    document.querySelectorAll(".header-tabs [data-page]").forEach((button) => button.addEventListener("click", () => { const page = button.dataset.page; document.querySelectorAll(".page-view").forEach((view) => { view.hidden = view.id !== `page-${page}`; }); document.querySelectorAll(".header-tabs [data-page]").forEach((item) => { item.classList.toggle("active", item === button); item.setAttribute("aria-selected", String(item === button)); }); }));
    $("#detail-table").addEventListener("click", (event) => { const button = event.target.closest(".expand-row"); if (!button) return; const name = button.dataset.secretary; expandedSecretaries.has(name) ? expandedSecretaries.delete(name) : expandedSecretaries.add(name); renderTable(filteredRows()); });
    document.querySelectorAll(".sort-header").forEach((button) => button.addEventListener("click", () => { const key = button.dataset.sort; if (tableSort.key === key) tableSort.direction = tableSort.direction === "asc" ? "desc" : "asc"; else { tableSort.key = key; tableSort.direction = key === "name" || key === "breakdown" ? "asc" : "desc"; } renderTable(filteredRows()); }));
    $("#clear-filters").addEventListener("click", resetFilters);
    $("#download-summary").addEventListener("click", downloadSummary);
  } catch (error) { $("#updated-at").textContent = "No se pudieron cargar los datos."; console.error(error); }
}
init();
