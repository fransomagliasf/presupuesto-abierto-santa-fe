const DATA_FILES = [
  "data/processed/gastos_por_objeto_2026-01-31.csv", "data/processed/gastos_por_objeto_2026-02-28.csv", "data/processed/gastos_por_objeto_2026-03-31.csv",
  "data/processed/gastos_por_objeto_2026-04-30.csv", "data/processed/gastos_por_objeto_2026-05-31.csv", "data/processed/gastos_por_objeto_2026-06-30.csv",
  "data/processed/gastos_por_objeto_2026-07-31.csv", "data/processed/gastos_por_objeto_2026-08-31.csv", "data/processed/gastos_por_objeto_2026-09-30.csv",
];
const RESOURCE_DATA_FILES = [
  "data/processed/recursos_por_rubro_2026-01-31.csv", "data/processed/recursos_por_rubro_2026-02-28.csv", "data/processed/recursos_por_rubro_2026-03-31.csv",
  "data/processed/recursos_por_rubro_2026-04-30.csv", "data/processed/recursos_por_rubro_2026-05-31.csv", "data/processed/recursos_por_rubro_2026-06-30.csv",
  "data/processed/recursos_por_rubro_2026-07-31.csv", "data/processed/recursos_por_rubro_2026-08-31.csv", "data/processed/recursos_por_rubro_2026-09-30.csv",
];
const $ = (selector) => document.querySelector(selector);
const currency = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });
const exactCurrency = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dateFormat = new Intl.DateTimeFormat("es-AR", { month: "short", year: "numeric", timeZone: "UTC" });
let data = [], selectedPeriods = new Set(), selectedPrograms = new Set(), expandedSecretaries = new Set(), activeChart = "bar", showBarValues = false, budgetChart = null, contributionChart = null, waterfallChart = null, tableSort = { key: "accrued", direction: "desc" };
let resourceData = [], resourceSelectedPeriods = new Set(), resourceExpandedMajors = new Set(), resourceActiveChart = "collection", resourceChart = null;

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
function formatExactCents(value) { return exactCurrency.format(value / 100); }
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
function filteredRows(includeAllPeriods = false) {
  const jurisdiction = $("#jurisdiction-filter").value, source = $("#source-filter").value, object = $("#object-filter").value;
  return data.filter((row) => (includeAllPeriods || selectedPeriods.has(row.fecha_corte)) && (!jurisdiction || row.jurisdiccion_nombre === jurisdiction) && (!jurisdiction || selectedPrograms.has(row.programa_nombre)) && (!source || row.fuente_financiamiento_nombre === source) && (!object || `${row.objeto_gasto_codigo} · ${row.objeto_gasto_nombre}` === object));
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
const barValueLabelsPlugin = {
  id: "barValueLabels",
  afterDatasetsDraw(chart) {
    if (activeChart !== "bar" || !showBarValues) return;
    const meta = chart.getDatasetMeta(0), values = chart.data.datasets[0].data, context = chart.ctx;
    context.save(); context.font = "700 11px system-ui, sans-serif"; context.textAlign = "center";
    meta.data.forEach((bar, index) => { const value = values[index]; context.fillStyle = value >= 0 ? "#187347" : "#a93642"; context.textBaseline = value >= 0 ? "bottom" : "top"; context.fillText(formatAxisAmount(value), bar.x, bar.y + (value >= 0 ? -7 : 7)); });
    context.restore();
  },
};
function renderChart(rows) {
  const periodValues = aggregatePeriods(rows), comparisonValues = aggregatePeriods(filteredRows(true)), comparisonIndex = new Map(comparisonValues.map((value, index) => [value.period, index]));
  const values = periodValues.map((value) => { const modification = value.current - value.approved, index = comparisonIndex.get(value.period), previous = index > 0 ? comparisonValues[index - 1] : null, previousModification = previous ? previous.current - previous.approved : 0; return { ...value, modification, monthlyModification: modification - previousModification, execution: executionPercent(value.accrued, value.current), expected: Number(value.period.split("/")[1]) * 100 / 12 }; }), chartTotal = $("#chart-total"), canvas = $("#budget-chart"), empty = $("#chart-empty");
  $("#bar-value-control").hidden = activeChart !== "bar";
  chartTotal.hidden = activeChart !== "bar" || !values.length;
  empty.hidden = Boolean(values.length); canvas.hidden = !values.length;
  if (budgetChart) { budgetChart.destroy(); budgetChart = null; }
  if (!values.length) return;
  if (typeof Chart === "undefined") { canvas.hidden = true; empty.hidden = false; empty.textContent = "No se pudo cargar la biblioteca de gráficos."; return; }
  empty.textContent = "No hay datos para esta combinación de filtros.";
  if (activeChart === "bar") { const latest = values.at(-1); chartTotal.innerHTML = `Modificación acumulada a ${escapeHtml(labelPeriod(latest.period))}: <strong class="${latest.modification >= 0 ? "positive" : "negative"}">${latest.modification >= 0 ? "+" : ""}${formatCents(latest.modification)}</strong>`; }
  const labels = values.map((value) => labelPeriod(value.period));
  let datasets, yOptions;
  if (activeChart === "line") {
    const maximum = Math.max(100, Math.ceil(Math.max(...values.flatMap((value) => [value.execution || 0, value.expected])) / 25) * 25);
    datasets = [
      { id: "execution", label: "Ejecución real", data: values.map((value) => value.execution), borderColor: "#7b3fc6", backgroundColor: "#7b3fc6", pointBackgroundColor: "#7b3fc6", pointRadius: 4, pointHoverRadius: 6, borderWidth: 3, tension: .28 },
      { id: "expected", label: "Ritmo esperado", data: values.map((value) => value.expected), borderColor: "#d59a13", backgroundColor: "#d59a13", pointBackgroundColor: "#fff", pointBorderColor: "#d59a13", pointBorderWidth: 2, pointRadius: 4, borderWidth: 2, borderDash: [7, 6], tension: 0 },
    ];
    yOptions = { min: 0, max: maximum, ticks: { stepSize: 25, callback: (value) => `${value}%` } };
    $("#chart-title").textContent = "Ejecución real y ritmo esperado";
    $("#chart-legend").innerHTML = '<span class="legend-execution"></span>% ejecutado <span class="legend-expected"></span>% esperado';
  } else {
    const largest = Math.max(...values.flatMap((value) => [Math.abs(value.monthlyModification), Math.abs(value.modification)]), 1), step = niceStep(largest / 3), limit = Math.max(step, Math.ceil(largest / step) * step);
    datasets = [
      { id: "monthly", type: "bar", label: "Movimiento mensual", data: values.map((value) => value.monthlyModification), backgroundColor: values.map((value) => value.monthlyModification > 0 ? "#26905f" : value.monthlyModification < 0 ? "#c74c56" : "#8c99a9"), borderRadius: 5, maxBarThickness: 54, order: 1 },
      { id: "cumulative", type: "line", label: "Modificación acumulada", data: values.map((value) => value.modification), borderColor: "rgba(18, 100, 163, .48)", backgroundColor: "rgba(18, 100, 163, .48)", pointBackgroundColor: "rgba(255, 255, 255, .82)", pointBorderColor: "rgba(18, 100, 163, .62)", pointBorderWidth: 2, pointRadius: 3, pointHoverRadius: 5, borderWidth: 2, tension: .25, order: 2 },
    ];
    yOptions = { min: -limit, max: limit, ticks: { stepSize: step, callback: formatAxisAmount } };
    $("#chart-title").textContent = "Movimientos mensuales y modificación acumulada";
    $("#chart-legend").innerHTML = '<span class="legend-positive"></span>Aumento mensual <span class="legend-negative"></span>Reducción mensual <span class="legend-cumulative"></span>Acumulado';
  }
  budgetChart = new Chart(canvas, {
    type: activeChart === "line" ? "line" : "bar",
    data: { labels, datasets },
    plugins: [barValueLabelsPlugin],
    options: {
      responsive: true, maintainAspectRatio: false, animation: { duration: 350 }, interaction: { mode: "index", intersect: false },
      layout: { padding: { top: showBarValues && activeChart === "bar" ? 18 : 4, right: 12, bottom: showBarValues && activeChart === "bar" ? 18 : 0, left: 8 } },
      plugins: {
        legend: { display: false },
        tooltip: { backgroundColor: "#fff", titleColor: "#15233b", bodyColor: "#46556d", borderColor: "#c7d5e2", borderWidth: 1, padding: 12, displayColors: true, callbacks: {
          label: (context) => activeChart === "line" ? `${context.dataset.label}: ${formatPercent(context.parsed.y)}` : `${context.dataset.label}: ${context.parsed.y >= 0 ? "+" : ""}${formatCents(context.parsed.y)}`,
          afterBody: (items) => { if (!items.length) return []; const value = values[items[0].dataIndex]; if (activeChart === "line") { const difference = value.execution === null ? null : value.execution - value.expected; return [difference === null ? "Diferencia: —" : `Diferencia: ${difference >= 0 ? "+" : ""}${difference.toLocaleString("es-AR", { maximumFractionDigits: 1 })} p.p.`]; } return [`Crédito aprobado: ${formatCents(value.approved)}`, `Crédito vigente: ${formatCents(value.current)}`]; },
        } },
      },
      scales: {
        x: { offset: activeChart === "bar", grid: { display: false }, border: { display: false }, ticks: { color: "#60708a", font: { size: 11 }, maxRotation: 0 } },
        y: { ...yOptions, border: { display: false }, grid: { color: (context) => context.tick.value === 0 ? "#526176" : "#dce3eb", lineWidth: (context) => context.tick.value === 0 ? 2 : 1 }, ticks: { ...yOptions.ticks, color: "#60708a", font: { size: 11 }, padding: 10 } },
      },
    },
  });
  $("#chart-note").textContent = values.length < 2 ? "Seleccioná más períodos para comparar la evolución." : activeChart === "line" ? "La línea esperada distribuye el 100% del crédito en doce meses. Posate sobre un punto para comparar." : "Cada barra muestra el cambio frente al mes anterior disponible. La línea azul muestra la modificación acumulada desde el crédito aprobado.";
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
function groupedRows(rows, labelForRow) {
  const groups = new Map(); rows.forEach((row) => { const label = labelForRow(row), group = groups.get(label) || []; group.push(row); groups.set(label, group); }); return groups;
}
function heatClass(execution, expected) { if (execution === null) return "heat-unknown"; const difference = execution - expected; return difference < -10 ? "heat-red" : difference < -5 ? "heat-yellow" : difference <= 5 ? "heat-green" : difference < 10 ? "heat-yellow" : "heat-blue"; }
function renderHeatmap(rows, latestPeriod) {
  const container = $("#execution-heatmap"), visiblePeriods = aggregatePeriods(rows).map((value) => value.period);
  if (!latestPeriod || !visiblePeriods.length) { container.innerHTML = '<p class="insight-empty">No hay períodos seleccionados.</p>'; return; }
  const jurisdictionSelected = $("#jurisdiction-filter").value;
  const labelForRow = (row) => jurisdictionSelected ? `${row.programa_codigo} · ${row.programa_nombre}` : `${row.jurisdiccion_nombre} · ${row.programa_codigo} · ${row.programa_nombre}`;
  const groups = groupedRows(rows, labelForRow), ranked = [...groups.entries()].map(([label, group]) => ({ label, group, credit: sum(group.filter((row) => row.fecha_corte === latestPeriod), "credito_vigente_centavos") })).sort((a, b) => b.credit - a.credit).slice(0, 10);
  const header = visiblePeriods.map((period) => `<th>${escapeHtml(labelPeriod(period).split(" ")[0])}</th>`).join("");
  const body = ranked.map(({ label, group }) => `<tr><th title="${escapeHtml(label)}">${escapeHtml(label)}</th>${visiblePeriods.map((period) => { const periodRows = group.filter((row) => row.fecha_corte === period), values = totals(periodRows), execution = executionPercent(values.accrued, values.current), expected = Number(period.split("/")[1]) * 100 / 12; return `<td class="${heatClass(execution, expected)}" title="${formatPercent(execution)} ejecutado; ${formatPercent(expected)} esperado">${formatPercent(execution)}</td>`; }).join("")}</tr>`).join("");
  container.innerHTML = ranked.length ? `<table class="heatmap-table"><thead><tr><th>Programa</th>${header}</tr></thead><tbody>${body}</tbody></table><p class="note">Se muestran los 10 programas con mayor crédito vigente del último período seleccionado.</p>` : '<p class="insight-empty">No hay programas para mostrar.</p>';
}
function insightGrouping(rows) {
  const byProgram = Boolean($("#jurisdiction-filter").value), labelForRow = byProgram ? (row) => `${row.programa_codigo} · ${row.programa_nombre}` : (row) => row.jurisdiccion_nombre;
  return { byProgram, groups: groupedRows(rows, labelForRow) };
}
function renderContribution(rows, latestPeriod) {
  if (contributionChart) { contributionChart.destroy(); contributionChart = null; }
  const { byProgram, groups } = insightGrouping(rows), items = [...groups.entries()].map(([label, group]) => { const values = totals(group); return { label, value: values.current - values.approved }; }).filter((item) => item.value !== 0).sort((a, b) => Math.abs(b.value) - Math.abs(a.value)).slice(0, 8);
  $("#contribution-note").textContent = latestPeriod ? `Mayores aportes acumulados por ${byProgram ? "programa" : "secretaría"} a ${labelPeriod(latestPeriod)}.` : "Sin período seleccionado.";
  if (!items.length || typeof Chart === "undefined") return;
  const largest = Math.max(...items.map((item) => Math.abs(item.value)), 1), step = niceStep(largest / 3), limit = Math.ceil(largest / step) * step;
  contributionChart = new Chart($("#contribution-chart"), { type: "bar", data: { labels: items.map((item) => item.label), datasets: [{ data: items.map((item) => item.value), backgroundColor: items.map((item) => item.value >= 0 ? "#26905f" : "#c74c56"), borderRadius: 4 }] }, options: { indexAxis: "y", responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { callbacks: { label: (context) => `${context.parsed.x >= 0 ? "+" : ""}${formatCents(context.parsed.x)}` } } }, scales: { x: { min: -limit, max: limit, grid: { color: (context) => context.tick.value === 0 ? "#526176" : "#e3e8ef" }, ticks: { stepSize: step, callback: formatAxisAmount } }, y: { grid: { display: false }, ticks: { autoSkip: false, font: { size: 10 } } } } } });
}
function renderAlerts(rows, latestPeriod) {
  const container = $("#budget-alerts"); if (!latestPeriod) { container.innerHTML = '<li class="insight-empty">Sin período seleccionado.</li>'; return; }
  const { byProgram, groups } = insightGrouping(rows), expected = Number(latestPeriod.split("/")[1]) * 100 / 12;
  const alerts = [...groups.entries()].map(([label, group]) => { const values = totals(group), execution = executionPercent(values.accrued, values.current), shortfall = execution === null ? 0 : expected - execution; return { label, values, execution, shortfall, score: Math.max(shortfall, 0) * values.current }; }).filter((item) => item.values.current > 0 && item.shortfall > 5).sort((a, b) => b.score - a.score).slice(0, 5);
  container.innerHTML = alerts.length ? alerts.map((item, index) => `<li><span>${index + 1}</span><div><strong>${escapeHtml(item.label)}</strong><small>${formatPercent(item.execution)} ejecutado · ${item.shortfall.toLocaleString("es-AR", { maximumFractionDigits: 1 })} p.p. bajo el ritmo · ${formatCents(item.values.current)} vigentes</small></div></li>`).join("") : `<li class="insight-empty">No hay ${byProgram ? "programas" : "secretarías"} con alertas relevantes.</li>`;
}
function renderWaterfall(latestPeriod) {
  if (waterfallChart) { waterfallChart.destroy(); waterfallChart = null; }
  $("#waterfall-approved").textContent = ""; $("#waterfall-current").textContent = "";
  if (!latestPeriod || typeof Chart === "undefined") return;
  const periodsAvailable = aggregatePeriods(filteredRows(true)).filter((value) => date({ fecha_corte: value.period }) <= date({ fecha_corte: latestPeriod })); if (!periodsAvailable.length) return;
  let running = 0; const labels = [], points = [], colors = [], changes = [];
  periodsAvailable.forEach((value) => { const next = value.current - value.approved, change = next - running; labels.push(labelPeriod(value.period)); points.push([running, next]); changes.push(change); colors.push(change >= 0 ? "#26905f" : "#c74c56"); running = next; });
  labels.push("Acumulado"); points.push([0, running]); changes.push(running); colors.push("#1264a3");
  const latest = periodsAvailable.at(-1); $("#waterfall-approved").textContent = `Aprobado: ${formatCents(latest.approved)}`; $("#waterfall-current").textContent = `Vigente: ${formatCents(latest.current)}`;
  waterfallChart = new Chart($("#waterfall-chart"), { type: "bar", data: { labels, datasets: [{ data: points, backgroundColor: colors, borderRadius: 4, maxBarThickness: 56 }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { callbacks: { label: (context) => { const change = changes[context.dataIndex]; return context.dataIndex === changes.length - 1 ? `Modificación acumulada: ${change >= 0 ? "+" : ""}${formatCents(change)}` : `Movimiento del mes: ${change >= 0 ? "+" : ""}${formatCents(change)}`; } } } }, scales: { x: { grid: { display: false } }, y: { grid: { color: (context) => context.tick.value === 0 ? "#526176" : "#e3e8ef" }, ticks: { callback: formatAxisAmount } } } } });
}
function renderInsights(rows, latestRows, latestPeriod) { renderHeatmap(rows, latestPeriod); renderContribution(latestRows, latestPeriod); renderAlerts(latestRows, latestPeriod); renderWaterfall(latestPeriod); }
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
  renderMetrics(latestRows, latestPeriod, previousPeriod, previousRows); renderRankings(latestRows, latestPeriod); renderChart(rows); renderTable(rows); renderInsights(rows, latestRows, latestPeriod);
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

function resourcePeriods() { return unique(resourceData.map((row) => row.fecha_corte)).sort((a, b) => date({ fecha_corte: a }) - date({ fecha_corte: b })); }
function resourceTotals(rows) {
  return {
    estimated: sum(rows, "recurso_estimado_centavos"), current: sum(rows, "recurso_vigente_centavos"), accrued: sum(rows, "recurso_devengado_centavos"),
    perceived: sum(rows, "recurso_percibido_centavos"), gap: sum(rows, "devengado_menos_percibido_centavos"),
  };
}
function collectionPercent(perceived, current) { return current > 0 ? perceived / current * 100 : null; }
function fillResourceGroupFilter() {
  const major = $("#resource-major-filter").value;
  const previous = $("#resource-group-filter").value;
  const groups = unique(resourceData.filter((row) => !major || row.rubro_mayor_codigo === major).map((row) => `${row.rubro_grupo_codigo} · ${row.rubro_grupo_nombre}`));
  populateSelect("#resource-group-filter", groups, "Todos los grupos");
  if (groups.includes(previous)) $("#resource-group-filter").value = previous;
}
function fillResourceFilters() {
  resourceSelectedPeriods = new Set(resourcePeriods());
  const byYear = new Map();
  resourcePeriods().forEach((period) => { const year = period.split("/")[2]; byYear.set(year, [...(byYear.get(year) || []), period]); });
  $("#resource-period-filter").innerHTML = [...byYear.entries()].map(([year, yearPeriods]) => `<section class="period-year"><div class="period-year-heading"><strong>${year}</strong><button class="small-action" type="button" data-resource-year="${year}">Todo el año</button></div><div class="month-list">${yearPeriods.map((period) => `<button type="button" class="month-option active" data-resource-period="${period}" aria-pressed="true">${escapeHtml(labelPeriod(period).split(" ")[0])}</button>`).join("")}</div></section>`).join("");
  populateSelect("#resource-major-filter", unique(resourceData.map((row) => row.rubro_mayor_codigo)).map((code) => { const row = resourceData.find((item) => item.rubro_mayor_codigo === code); return `${code} · ${row.rubro_mayor_nombre}`; }), "Todos los rubros");
  populateSelect("#resource-origin-filter", unique(resourceData.filter((row) => row.procedencia_codigo).map((row) => `${row.procedencia_codigo} · ${row.procedencia_nombre}`)), "Todas las procedencias");
  fillResourceGroupFilter();
}
function resourceFilteredRows(includeAllPeriods = false) {
  const majorValue = $("#resource-major-filter").value, groupValue = $("#resource-group-filter").value, originValue = $("#resource-origin-filter").value;
  const majorCode = majorValue.split(" · ")[0], groupCode = groupValue.split(" · ")[0], originCode = originValue.split(" · ")[0];
  return resourceData.filter((row) => (includeAllPeriods || resourceSelectedPeriods.has(row.fecha_corte)) && (!majorValue || row.rubro_mayor_codigo === majorCode) && (!groupValue || row.rubro_grupo_codigo === groupCode) && (!originValue || row.procedencia_codigo === originCode));
}
function aggregateResourcePeriods(rows) {
  const grouped = new Map();
  rows.forEach((row) => { const values = grouped.get(row.fecha_corte) || { period: row.fecha_corte, estimated: 0, current: 0, accrued: 0, perceived: 0 }; values.estimated += cents(row, "recurso_estimado_centavos"); values.current += cents(row, "recurso_vigente_centavos"); values.accrued += cents(row, "recurso_devengado_centavos"); values.perceived += cents(row, "recurso_percibido_centavos"); grouped.set(row.fecha_corte, values); });
  return [...grouped.values()].sort((a, b) => date({ fecha_corte: a.period }) - date({ fecha_corte: b.period }));
}
function resourceContext(period) {
  const major = $("#resource-major-filter").value || "Todos los rubros", group = $("#resource-group-filter").value || "Todos los grupos", origin = $("#resource-origin-filter").value || "Todas las procedencias";
  return `Período: ${period ? labelPeriod(period) : "sin selección"} · Rubro: ${major} · Grupo: ${group} · Procedencia: ${origin}`;
}
function renderResourceMetrics(latestRows, previousRows, latestPeriod, previousPeriod) {
  const values = resourceTotals(latestRows), previous = previousRows ? resourceTotals(previousRows) : null, rate = collectionPercent(values.perceived, values.current), expected = latestPeriod ? Number(latestPeriod.split("/")[1]) * 100 / 12 : null;
  $("#resource-metric-estimated").textContent = formatCents(values.estimated); $("#resource-metric-current").textContent = formatCents(values.current); $("#resource-metric-accrued").textContent = formatCents(values.accrued); $("#resource-metric-perceived").textContent = formatCents(values.perceived); $("#resource-metric-rate").textContent = formatPercent(rate);
  $("#resource-estimated-note").textContent = "Previsión original del ejercicio";
  const setNote = (selector, text, value) => { const element = $(selector); element.classList.remove("positive", "negative"); element.textContent = text; if (value !== null && value !== 0) element.classList.add(value > 0 ? "positive" : "negative"); };
  const modification = values.current - values.estimated;
  setNote("#resource-current-note", `Modificación acumulada: ${modification >= 0 ? "+" : "−"}${formatCents(Math.abs(modification))}`, modification);
  const accruedChange = previous ? values.accrued - previous.accrued : null, perceivedChange = previous ? values.perceived - previous.perceived : null;
  setNote("#resource-accrued-note", previousPeriod ? `Nuevos derechos vs. ${labelPeriod(previousPeriod)}: ${accruedChange >= 0 ? "+" : "−"}${formatCents(Math.abs(accruedChange))}` : "Sin período previo seleccionado", accruedChange);
  setNote("#resource-perceived-note", previousPeriod ? `Ingresado desde ${labelPeriod(previousPeriod)}: ${perceivedChange >= 0 ? "+" : "−"}${formatCents(Math.abs(perceivedChange))}` : "Sin período previo seleccionado", perceivedChange);
  const rateDifference = rate === null || expected === null ? null : rate - expected;
  setNote("#resource-rate-note", rateDifference === null ? "Sin período" : `${rateDifference >= 0 ? "+" : "−"}${Math.abs(rateDifference).toLocaleString("es-AR", { maximumFractionDigits: 1 })} p.p. frente al ritmo esperado`, rateDifference);
  $("#resource-summary-context").textContent = resourceContext(latestPeriod);
}
function renderResourceQuality() {
  const row = resourceData[0], container = $("#resource-quality-note");
  if (!row || row.total_general_reconcilia !== "no") { container.hidden = true; return; }
  const match = row.diferencias_total_general_centavos.match(/recurso_devengado=(-?\d+)/), difference = match ? Math.abs(Number(match[1])) : 0;
  container.hidden = false;
  container.innerHTML = `<strong>Control de calidad del documento fuente</strong><span>La suma de los conceptos es ${formatExactCents(difference)} menor que el TOTAL GENERAL impreso en devengado y percibido. La diferencia se repite en los nueve PDF; se muestran los conceptos extraídos sin alterar.</span>`;
}
function renderResourceChart(rows) {
  const selected = aggregateResourcePeriods(rows), all = aggregateResourcePeriods(resourceFilteredRows(true)), allIndex = new Map(all.map((value, index) => [value.period, index])), canvas = $("#resource-chart"), empty = $("#resource-chart-empty");
  if (resourceChart) { resourceChart.destroy(); resourceChart = null; }
  empty.hidden = Boolean(selected.length); canvas.hidden = !selected.length;
  if (!selected.length) { empty.textContent = "No hay datos para esta selección."; return; }
  if (typeof Chart === "undefined") { canvas.hidden = true; empty.hidden = false; empty.textContent = "No se pudo cargar la biblioteca de gráficos."; return; }
  const values = selected.map((value) => { const index = allIndex.get(value.period), previous = index > 0 ? all[index - 1] : null; return { ...value, rate: collectionPercent(value.perceived, value.current), accruedRate: collectionPercent(value.accrued, value.current), expected: Number(value.period.split("/")[1]) * 100 / 12, monthlyPerceived: value.perceived - (previous?.perceived || 0), monthlyAccrued: value.accrued - (previous?.accrued || 0), modification: value.current - value.estimated, monthlyModification: (value.current - value.estimated) - (previous ? previous.current - previous.estimated : 0) }; });
  let type = "line", datasets, y, tooltipFormatter;
  if (resourceActiveChart === "collection") {
    datasets = [
      { label: "% percibido", data: values.map((value) => value.rate), borderColor: "#008a81", backgroundColor: "#008a81", borderWidth: 3, pointRadius: 4, tension: .25 },
      { label: "% devengado", data: values.map((value) => value.accruedRate), borderColor: "#1264a3", backgroundColor: "#1264a3", borderWidth: 2, pointRadius: 3, tension: .25 },
      { label: "Ritmo esperado", data: values.map((value) => value.expected), borderColor: "#d59a13", backgroundColor: "#d59a13", borderWidth: 2, borderDash: [7, 6], pointRadius: 3 },
    ];
    const maximum = Math.max(100, Math.ceil(Math.max(...values.flatMap((value) => [value.rate || 0, value.accruedRate || 0, value.expected])) / 25) * 25); y = { min: 0, max: maximum, ticks: { stepSize: 25, callback: (value) => `${value}%` } }; tooltipFormatter = (context) => `${context.dataset.label}: ${formatPercent(context.parsed.y)}`;
    $("#resource-chart-title").textContent = "Recaudación y ritmo esperado"; $("#resource-chart-legend").innerHTML = '<span class="legend-resource-perceived"></span>Percibido <span class="legend-resource-accrued"></span>Devengado <span class="legend-expected"></span>Esperado'; $("#resource-chart-note").textContent = "El percibido mide dinero ingresado; el devengado, derechos de cobro reconocidos. La distancia entre ambas líneas ayuda a leer demoras o anticipos de cobranza.";
  } else if (resourceActiveChart === "income") {
    type = "bar"; datasets = [
      { label: "Percibido del mes", data: values.map((value) => value.monthlyPerceived), backgroundColor: "rgba(0, 138, 129, .82)", borderRadius: 5 },
      { label: "Devengado del mes", data: values.map((value) => value.monthlyAccrued), backgroundColor: "rgba(18, 100, 163, .55)", borderRadius: 5 },
    ]; y = { beginAtZero: true, ticks: { callback: formatAxisAmount } }; tooltipFormatter = (context) => `${context.dataset.label}: ${context.parsed.y >= 0 ? "+" : ""}${formatCents(context.parsed.y)}`;
    $("#resource-chart-title").textContent = "Ingresos y derechos generados en cada mes"; $("#resource-chart-legend").innerHTML = '<span class="legend-resource-perceived"></span>Percibido mensual <span class="legend-resource-accrued"></span>Devengado mensual'; $("#resource-chart-note").textContent = "Las barras muestran el incremento frente al cierre anterior, no el importe acumulado del informe.";
  } else {
    type = "bar"; const largest = Math.max(...values.flatMap((value) => [Math.abs(value.monthlyModification), Math.abs(value.modification)]), 1), step = niceStep(largest / 3), limit = Math.ceil(largest / step) * step;
    datasets = [
      { type: "bar", label: "Cambio mensual", data: values.map((value) => value.monthlyModification), backgroundColor: values.map((value) => value.monthlyModification >= 0 ? "#26905f" : "#c74c56"), borderRadius: 5, order: 1 },
      { type: "line", label: "Modificación acumulada", data: values.map((value) => value.modification), borderColor: "rgba(18, 100, 163, .55)", backgroundColor: "rgba(18, 100, 163, .55)", borderWidth: 2, pointRadius: 3, tension: .25, order: 2 },
    ]; y = { min: -limit, max: limit, ticks: { stepSize: step, callback: formatAxisAmount } }; tooltipFormatter = (context) => `${context.dataset.label}: ${context.parsed.y >= 0 ? "+" : ""}${formatCents(context.parsed.y)}`;
    $("#resource-chart-title").textContent = "Cambios en la estimación de recursos"; $("#resource-chart-legend").innerHTML = '<span class="legend-positive"></span>Aumento mensual <span class="legend-negative"></span>Reducción mensual <span class="legend-cumulative"></span>Acumulado'; $("#resource-chart-note").textContent = "Cada barra compara la modificación acumulada con el mes anterior; la línea muestra la diferencia total entre vigente y estimado.";
  }
  resourceChart = new Chart(canvas, { type, data: { labels: values.map((value) => labelPeriod(value.period)), datasets }, options: { responsive: true, maintainAspectRatio: false, interaction: { mode: "index", intersect: false }, plugins: { legend: { display: false }, tooltip: { backgroundColor: "#fff", titleColor: "#15233b", bodyColor: "#46556d", borderColor: "#c7d5e2", borderWidth: 1, padding: 12, callbacks: { label: tooltipFormatter } } }, scales: { x: { grid: { display: false }, border: { display: false } }, y: { ...y, border: { display: false }, grid: { color: (context) => context.tick.value === 0 ? "#526176" : "#dce3eb", lineWidth: (context) => context.tick.value === 0 ? 2 : 1 }, ticks: { ...y.ticks, color: "#60708a", padding: 10 } } } } });
}
function resourceAmountCell(value, total) { return `<td class="number">${formatCents(value)}<small class="cell-share">(${columnShare(value, total)} del total)</small></td>`; }
function renderResourceTable(rows, latestPeriod) {
  const latestRows = rows.filter((row) => row.fecha_corte === latestPeriod), overall = resourceTotals(latestRows), groups = new Map();
  latestRows.forEach((row) => { const key = `${row.rubro_mayor_codigo} · ${row.rubro_mayor_nombre}`, group = groups.get(key) || []; group.push(row); groups.set(key, group); });
  const ordered = [...groups.entries()].sort((a, b) => resourceTotals(b[1]).perceived - resourceTotals(a[1]).perceived);
  $("#resource-detail-table").innerHTML = ordered.map(([label, group]) => {
    const open = resourceExpandedMajors.has(label), values = resourceTotals(group), rate = collectionPercent(values.perceived, values.current);
    const children = open ? [...group].sort((a, b) => cents(b, "recurso_percibido_centavos") - cents(a, "recurso_percibido_centavos")).map((row) => { const child = resourceTotals([row]), childRate = collectionPercent(child.perceived, child.current), origin = row.procedencia_codigo ? `${row.procedencia_codigo} · ${row.procedencia_nombre}` : "Sin procedencia informada"; return `<tr class="breakdown-row"><td></td><td><strong>${escapeHtml(`${row.rubro_codigo} · ${row.rubro_nombre}`)}</strong><small>${escapeHtml(origin)}</small></td>${resourceAmountCell(child.estimated, overall.estimated)}${resourceAmountCell(child.current, overall.current)}${resourceAmountCell(child.accrued, overall.accrued)}${resourceAmountCell(child.perceived, overall.perceived)}<td class="number"><span class="execution-pill execution-${executionAssessment({ accrued: child.perceived, current: child.current }, latestPeriod).status}">${formatPercent(childRate)}</span></td><td class="number ${child.gap < 0 ? "negative" : ""}">${formatCents(child.gap)}</td></tr>`; }).join("") : "";
    return `<tr class="secretary-total"><td><button class="expand-row resource-expand-row" type="button" data-resource-major="${escapeHtml(label)}" aria-expanded="${open}"><span>${open ? "▾" : "▸"}</span>${escapeHtml(label)}</button></td><td>Total del rubro</td>${resourceAmountCell(values.estimated, overall.estimated)}${resourceAmountCell(values.current, overall.current)}${resourceAmountCell(values.accrued, overall.accrued)}${resourceAmountCell(values.perceived, overall.perceived)}<td class="number"><span class="execution-pill execution-${executionAssessment({ accrued: values.perceived, current: values.current }, latestPeriod).status}">${formatPercent(rate)}</span></td><td class="number ${values.gap < 0 ? "negative" : ""}">${formatCents(values.gap)}</td></tr>${children}`;
  }).join("");
  $("#resource-table-note").textContent = latestPeriod ? `Valores acumulados a ${labelPeriod(latestPeriod)}. La brecha es devengado menos percibido: si es positiva, existen derechos reconocidos aún no cobrados; si es negativa, hubo ingresos vinculados a derechos de períodos anteriores u otras diferencias de registro.` : "No hay datos para mostrar.";
}
function renderResources(renderGraph = true) {
  const rows = resourceFilteredRows(), selected = [...resourceSelectedPeriods].sort((a, b) => date({ fecha_corte: a }) - date({ fecha_corte: b })), latestPeriod = selected.at(-1), previousPeriod = selected.at(-2), latestRows = rows.filter((row) => row.fecha_corte === latestPeriod), previousRows = previousPeriod ? rows.filter((row) => row.fecha_corte === previousPeriod) : null;
  renderResourceMetrics(latestRows, previousRows, latestPeriod, previousPeriod); renderResourceQuality(); renderResourceTable(rows, latestPeriod); if (renderGraph) renderResourceChart(rows);
}
function resetResourceFilters() {
  resourceSelectedPeriods = new Set(resourcePeriods()); resourceExpandedMajors.clear(); $("#resource-major-filter").value = ""; $("#resource-origin-filter").value = ""; fillResourceGroupFilter();
  document.querySelectorAll("[data-resource-period]").forEach((button) => { button.classList.add("active"); button.setAttribute("aria-pressed", "true"); }); $("#resource-toggle-periods").textContent = "Quitar todos"; renderResources();
}
async function init() {
  try {
    data = (await Promise.all(DATA_FILES.map((file) => fetch(file).then((response) => { if (!response.ok) throw new Error(file); return response.text(); })))).flatMap(parseCSV);
    resourceData = (await Promise.all(RESOURCE_DATA_FILES.map((file) => fetch(file).then((response) => { if (!response.ok) throw new Error(file); return response.text(); })))).flatMap(parseCSV);
    fillFilters(); fillResourceFilters(); render(); renderResources(false);
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
    document.querySelectorAll(".chart-tab").forEach((tab) => tab.addEventListener("click", () => { activeChart = tab.dataset.chart; document.querySelectorAll(".chart-tab").forEach((item) => { item.classList.toggle("active", item === tab); item.setAttribute("aria-selected", String(item === tab)); }); renderChart(filteredRows()); }));
    $("#show-bar-values").addEventListener("change", (event) => { showBarValues = event.target.checked; renderChart(filteredRows()); });
    document.querySelectorAll(".header-tabs [data-page]").forEach((button) => button.addEventListener("click", () => { const page = button.dataset.page; document.querySelectorAll(".page-view").forEach((view) => { view.hidden = view.id !== `page-${page}`; }); document.querySelectorAll(".header-tabs [data-page]").forEach((item) => { item.classList.toggle("active", item === button); item.setAttribute("aria-selected", String(item === button)); }); }));
    document.querySelectorAll(".tracking-tabs [data-tracking]").forEach((button) => button.addEventListener("click", () => { const tracking = button.dataset.tracking; document.querySelectorAll(".tracking-view").forEach((view) => { view.hidden = view.id !== `tracking-${tracking}`; }); document.querySelectorAll(".tracking-tabs [data-tracking]").forEach((item) => { item.classList.toggle("active", item === button); item.setAttribute("aria-selected", String(item === button)); }); $("#updated-at").textContent = tracking === "resources" ? `${resourceData.length.toLocaleString("es-AR")} conceptos cargados · último cierre: ${labelPeriod(resourcePeriods().at(-1))}` : `${data.length.toLocaleString("es-AR")} partidas cargadas · último cierre: ${labelPeriod(periods().at(-1))}`; if (tracking === "resources") requestAnimationFrame(() => renderResources()); }));
    $("#detail-table").addEventListener("click", (event) => { const button = event.target.closest(".expand-row"); if (!button) return; const name = button.dataset.secretary; expandedSecretaries.has(name) ? expandedSecretaries.delete(name) : expandedSecretaries.add(name); renderTable(filteredRows()); });
    document.querySelectorAll(".sort-header").forEach((button) => button.addEventListener("click", () => { const key = button.dataset.sort; if (tableSort.key === key) tableSort.direction = tableSort.direction === "asc" ? "desc" : "asc"; else { tableSort.key = key; tableSort.direction = key === "name" || key === "breakdown" ? "asc" : "desc"; } renderTable(filteredRows()); }));
    $("#clear-filters").addEventListener("click", resetFilters);
    $("#download-summary").addEventListener("click", downloadSummary);
    $("#resource-period-filter").addEventListener("click", (event) => {
      const yearButton = event.target.closest("[data-resource-year]");
      if (yearButton) { const year = yearButton.dataset.resourceYear, yearPeriods = resourcePeriods().filter((period) => period.endsWith(`/${year}`)), allSelected = yearPeriods.every((period) => resourceSelectedPeriods.has(period)); yearPeriods.forEach((period) => allSelected ? resourceSelectedPeriods.delete(period) : resourceSelectedPeriods.add(period)); }
      else { const button = event.target.closest("[data-resource-period]"); if (!button) return; resourceSelectedPeriods.has(button.dataset.resourcePeriod) ? resourceSelectedPeriods.delete(button.dataset.resourcePeriod) : resourceSelectedPeriods.add(button.dataset.resourcePeriod); }
      document.querySelectorAll("[data-resource-period]").forEach((button) => { const active = resourceSelectedPeriods.has(button.dataset.resourcePeriod); button.classList.toggle("active", active); button.setAttribute("aria-pressed", String(active)); }); $("#resource-toggle-periods").textContent = resourceSelectedPeriods.size === resourcePeriods().length ? "Quitar todos" : "Seleccionar todos"; renderResources();
    });
    $("#resource-toggle-periods").addEventListener("click", () => { resourceSelectedPeriods = resourceSelectedPeriods.size === resourcePeriods().length ? new Set() : new Set(resourcePeriods()); document.querySelectorAll("[data-resource-period]").forEach((button) => { const active = resourceSelectedPeriods.has(button.dataset.resourcePeriod); button.classList.toggle("active", active); button.setAttribute("aria-pressed", String(active)); }); $("#resource-toggle-periods").textContent = resourceSelectedPeriods.size ? "Quitar todos" : "Seleccionar todos"; renderResources(); });
    $("#resource-major-filter").addEventListener("change", () => { resourceExpandedMajors.clear(); fillResourceGroupFilter(); renderResources(); });
    ["#resource-group-filter", "#resource-origin-filter"].forEach((id) => $(id).addEventListener("change", () => { resourceExpandedMajors.clear(); renderResources(); }));
    $("#resource-clear-filters").addEventListener("click", resetResourceFilters);
    $("#resource-detail-table").addEventListener("click", (event) => { const button = event.target.closest("[data-resource-major]"); if (!button) return; const key = button.dataset.resourceMajor; resourceExpandedMajors.has(key) ? resourceExpandedMajors.delete(key) : resourceExpandedMajors.add(key); renderResourceTable(resourceFilteredRows(), [...resourceSelectedPeriods].sort((a, b) => date({ fecha_corte: a }) - date({ fecha_corte: b })).at(-1)); });
    document.querySelectorAll("[data-resource-chart]").forEach((button) => button.addEventListener("click", () => { resourceActiveChart = button.dataset.resourceChart; document.querySelectorAll("[data-resource-chart]").forEach((item) => { item.classList.toggle("active", item === button); item.setAttribute("aria-selected", String(item === button)); }); renderResourceChart(resourceFilteredRows()); }));
  } catch (error) { $("#updated-at").textContent = "No se pudieron cargar los datos."; console.error(error); }
}
init();
