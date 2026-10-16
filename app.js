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
const FUND_DATA_FILES = [
  "data/processed/fondos_especiales_2026-01-31.csv", "data/processed/fondos_especiales_2026-02-28.csv", "data/processed/fondos_especiales_2026-03-31.csv",
  "data/processed/fondos_especiales_2026-04-30.csv", "data/processed/fondos_especiales_2026-05-31.csv", "data/processed/fondos_especiales_2026-06-30.csv",
  "data/processed/fondos_especiales_2026-07-31.csv", "data/processed/fondos_especiales_2026-08-31.csv", "data/processed/fondos_especiales_2026-09-30.csv",
];
const FINANCING_DATA_FILES = [
  "data/processed/gastos_por_fuente_2026-01-31.csv", "data/processed/gastos_por_fuente_2026-02-28.csv", "data/processed/gastos_por_fuente_2026-03-31.csv",
  "data/processed/gastos_por_fuente_2026-04-30.csv", "data/processed/gastos_por_fuente_2026-05-31.csv", "data/processed/gastos_por_fuente_2026-06-30.csv",
  "data/processed/gastos_por_fuente_2026-07-31.csv", "data/processed/gastos_por_fuente_2026-08-31.csv", "data/processed/gastos_por_fuente_2026-09-30.csv",
];
const $ = (selector) => document.querySelector(selector);
const currency = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });
const exactCurrency = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dateFormat = new Intl.DateTimeFormat("es-AR", { month: "short", year: "numeric", timeZone: "UTC" });
const updateDateFormat = new Intl.DateTimeFormat("es-AR", { month: "long", year: "numeric", timeZone: "UTC" });
let data = [], selectedPeriods = new Set(), selectedPrograms = new Set(), expandedSecretaries = new Set(), activeChart = "bar", showBarValues = true, bridgeFocusPeriod = null, budgetChart = null, budgetSizeChart = null, rankingExecutionChart = null, rankingFundingChart = null, contributionChart = null, tableSort = { key: "name", direction: "asc" };
let resourceData = [], resourceSelectedPeriods = new Set(), resourceSelectedMajors = new Set(), resourceSelectedDetails = new Set(), resourceExpandedMajors = new Set(), resourceActiveChart = "collection", resourceGrowthDimension = "major", resourceShowValues = true, resourceChart = null, resourceGrowthChart = null, resourceOriginChart = null, resourceConcentrationChart = null;
let fundData = [], fundSelectedPeriods = new Set(), fundExpandedOrigins = new Set(), fundActiveChart = "flow", fundRankingMetric = "perceived", fundShowValues = true, fundChart = null, fundOriginChart = null;
let financingData = [], financingCompositionChart = null, financingExecutionChart = null;
const TABLE_PAGE_SIZE = 5;
let expenseTablePage = 1, resourceTablePage = 1, fundTablePage = 1, guideTablePage = 1, guideExpandedSecretaries = new Set(), activeDownloadView = "expenses";
let heatmapExpanded = false;

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
function formatBillions(value) { return `${value < 0 ? "−" : ""}$ ${(Math.abs(value) / 100000000000).toLocaleString("es-AR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} mil M`; }
function signedVariation(value, base) {
  const sign = value > 0 ? "+" : value < 0 ? "−" : "";
  const percentage = base ? Math.abs(value / base * 100) : null;
  return `${sign}${formatCents(Math.abs(value))}${percentage === null ? "" : ` (${sign}${formatPercent(percentage)})`}`;
}
function populateSelect(id, values, label) { $(id).innerHTML = `<option value="">${label}</option>${values.map((v) => `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`).join("")}`; }
function populateSelectOptions(id, options, label) { $(id).innerHTML = `<option value="">${label}</option>${options.map((option) => `<option value="${escapeHtml(option.value)}">${escapeHtml(option.label)}</option>`).join("")}`; }
function selectedOptionText(selector, fallback) { const select = $(selector); return select.value ? select.selectedOptions[0]?.textContent || fallback : fallback; }
function setFilterEnabled(id, enabled) { const select = $(id); select.disabled = !enabled; select.closest(".filter-step")?.classList.toggle("is-disabled", !enabled); }
function updatedLabel(period) { return period ? `Actualizado a ${updateDateFormat.format(date({ fecha_corte: period }))}` : "Sin datos disponibles"; }
function paginate(items, requestedPage, pageSize = TABLE_PAGE_SIZE) { const pages = Math.max(1, Math.ceil(items.length / pageSize)), page = Math.min(Math.max(1, requestedPage), pages), start = (page - 1) * pageSize; return { items: items.slice(start, start + pageSize), page, pages, start, pageSize }; }
function renderPagination(selector, state, type, total) {
  if (!total) { $(selector).innerHTML = ""; return; }
  const pageButtons = state.pages > 1 ? Array.from({ length: state.pages }, (_, index) => `<button type="button" class="${index + 1 === state.page ? "active" : ""}" data-pagination="${type}" data-page="${index + 1}" aria-label="Página ${index + 1}" aria-current="${index + 1 === state.page ? "page" : "false"}">${index + 1}</button>`).join("") : "";
  $(selector).innerHTML = `<span>${state.start + 1}–${Math.min(state.start + state.pageSize, total)} de ${total}</span>${state.pages > 1 ? `<button type="button" data-pagination="${type}" data-page="${state.page - 1}" ${state.page === 1 ? "disabled" : ""} aria-label="Página anterior">‹</button>${pageButtons}<button type="button" data-pagination="${type}" data-page="${state.page + 1}" ${state.page === state.pages ? "disabled" : ""} aria-label="Página siguiente">›</button>` : ""}`;
}
function periods() { return unique(data.map((row) => row.fecha_corte)).sort((a, b) => date({ fecha_corte: a }) - date({ fecha_corte: b })); }

function fillFilters() {
  selectedPeriods = new Set(periods());
  const byYear = new Map();
  periods().forEach((period) => { const year = period.split("/")[2]; byYear.set(year, [...(byYear.get(year) || []), period]); });
  $("#period-filter").innerHTML = [...byYear.entries()].map(([year, yearPeriods]) => `<section class="period-year"><div class="period-year-heading"><strong>${year}</strong><button class="small-action" type="button" data-year="${year}">Todo el año</button></div><div class="month-list">${yearPeriods.map((period) => `<button type="button" class="month-option active" data-period="${period}" aria-pressed="true">${escapeHtml(labelPeriod(period).split(" ")[0])}</button>`).join("")}</div></section>`).join("");
  populateSelect("#jurisdiction-filter", unique(data.map((r) => r.jurisdiccion_nombre)), "Todas las secretarías");
  fillExpenseDependentFilters();
}
function programsForSelectedJurisdiction() { const jurisdiction = $("#jurisdiction-filter").value, programs = new Map(); data.filter((row) => row.jurisdiccion_nombre === jurisdiction).forEach((row) => programs.set(row.programa_codigo, row.programa_nombre)); return [...programs.entries()].sort(([codeA], [codeB]) => codeA.localeCompare(codeB, "es", { numeric: true })).map(([, name]) => name); }
function expenseRowsForDependentFilters() {
  const jurisdiction = $("#jurisdiction-filter").value;
  if (!jurisdiction) return data;
  return data.filter((row) => row.jurisdiccion_nombre === jurisdiction && selectedPrograms.has(row.programa_nombre));
}
function fillExpenseObjectFilter() {
  const previous = $("#object-filter").value, source = $("#source-filter").value;
  const rows = source ? expenseRowsForDependentFilters().filter((row) => row.fuente_financiamiento_nombre === source) : [];
  const options = [...new Map(rows.map((row) => [row.objeto_gasto_codigo, { value: row.objeto_gasto_codigo, label: row.objeto_gasto_nombre }])).values()].sort((a, b) => a.label.localeCompare(b.label, "es"));
  populateSelectOptions("#object-filter", options, source ? "Todos los objetos" : "Seleccioná una fuente primero");
  if (options.some((option) => option.value === previous)) $("#object-filter").value = previous;
  syncExpenseFilterState();
}
function fillExpenseDependentFilters() {
  const previous = $("#source-filter").value;
  const ready = Boolean($("#jurisdiction-filter").value) && selectedPrograms.size > 0;
  const options = ready ? unique(expenseRowsForDependentFilters().map((row) => row.fuente_financiamiento_nombre)) : [];
  populateSelect("#source-filter", options, ready ? "Todas las fuentes" : "Seleccioná una secretaría primero");
  if (options.includes(previous)) $("#source-filter").value = previous;
  fillExpenseObjectFilter();
}
function syncExpenseFilterState() {
  const hasJurisdiction = Boolean($("#jurisdiction-filter").value), hasPrograms = hasJurisdiction && selectedPrograms.size > 0;
  setFilterEnabled("#source-filter", hasPrograms);
  setFilterEnabled("#object-filter", hasPrograms && Boolean($("#source-filter").value));
}
function renderProgramChips() {
  const panel = $("#program-panel"), programs = programsForSelectedJurisdiction();
  panel.hidden = !programs.length;
  if (!programs.length) return;
  $("#program-title").textContent = `Programas de ${$("#jurisdiction-filter").value}`;
  $("#program-filter").innerHTML = programs.map((program) => `<div class="program-option"><label><input type="checkbox" data-program="${escapeHtml(program)}" ${selectedPrograms.has(program) ? "checked" : ""}><span>${escapeHtml(program)}</span></label><button class="only-program" type="button" data-only-program="${escapeHtml(program)}">Únicamente</button></div>`).join("");
}
function filteredRows(includeAllPeriods = false) {
  const jurisdiction = $("#jurisdiction-filter").value, source = $("#source-filter").value, object = $("#object-filter").value;
  return data.filter((row) => (includeAllPeriods || selectedPeriods.has(row.fecha_corte)) && (!jurisdiction || row.jurisdiccion_nombre === jurisdiction) && (!jurisdiction || selectedPrograms.has(row.programa_nombre)) && (!source || row.fuente_financiamiento_nombre === source) && (!object || row.objeto_gasto_codigo === object));
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
    object: selectedOptionText("#object-filter", ""),
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
function renderMetrics(rows, latestPeriod, previousPeriod) {
  const values = totals(rows), approved = values.approved, current = values.current, accrued = values.accrued, available = values.available;
  const execution = executionPercent(accrued, current);
  $("#metric-current").textContent = formatCents(current); $("#metric-available").textContent = formatCents(available);
  const modification = current - approved;
  const currentNote = $("#metric-current-change"); currentNote.classList.remove("positive", "negative"); currentNote.textContent = `Vs. crédito aprobado: ${signedVariation(modification, approved)}`; if (modification !== 0) currentNote.classList.add(modification > 0 ? "positive" : "negative");
  const availableShare = current ? available / current * 100 : null;
  const availableNote = $("#metric-available-change"); availableNote.classList.remove("positive", "negative"); availableNote.textContent = availableShare === null ? "Sin crédito vigente para comparar" : `${formatPercent(availableShare)} del crédito vigente aún sin devengar`;
  $("#metric-execution").textContent = formatPercent(execution);
  const monthNumber = latestPeriod ? Number(latestPeriod.split("/")[1]) : 0;
  const expected = monthNumber ? monthNumber * 100 / 12 : null;
  const executionDifference = execution === null || expected === null ? null : execution - expected;
  const executionNote = $("#metric-execution-benchmark"); executionNote.classList.remove("positive", "negative"); executionNote.textContent = executionDifference === null ? "Sin período" : `${executionDifference >= 0 ? "+" : "−"}${Math.abs(executionDifference).toLocaleString("es-AR", { maximumFractionDigits: 1 })} p.p. frente al ritmo esperado`; if (executionDifference !== null && executionDifference !== 0) executionNote.classList.add(executionDifference > 0 ? "positive" : "negative");
  $("#summary-context").textContent = selectionDescription(latestPeriod, previousPeriod);
}
function renderBudgetSize(rows, latestPeriod) {
  if (budgetSizeChart) { budgetSizeChart.destroy(); budgetSizeChart = null; }
  const canvas = $("#budget-size-chart"), empty = $("#budget-size-empty"), jurisdiction = $("#jurisdiction-filter").value, byProgram = Boolean(jurisdiction), groups = new Map();
  rows.forEach((row) => { const label = byProgram ? row.programa_nombre : row.jurisdiccion_nombre; groups.set(label, (groups.get(label) || 0) + cents(row, "credito_vigente_centavos")); });
  const ranked = [...groups.entries()].map(([label, value]) => ({ label, value })).filter((item) => item.value > 0).sort((a, b) => b.value - a.value), total = ranked.reduce((sumValue, item) => sumValue + item.value, 0), top = ranked.slice(0, 8), otherValue = ranked.slice(8).reduce((sumValue, item) => sumValue + item.value, 0), palette = ["#1264a3", "#008a81", "#7b3fc6", "#e0a71b", "#c45059", "#438dcc", "#34755b", "#8754aa", "#9aa7b7"], items = [...top, ...(otherValue > 0 ? [{ label: "Otros", value: otherValue }] : [])].map((item, index) => ({ ...item, color: palette[index] }));
  $("#budget-size-context").textContent = latestPeriod ? `${byProgram ? "Programas" : "Secretarías"} · ${labelPeriod(latestPeriod)}` : "Sin período seleccionado";
  $("#budget-size-note").textContent = items.length ? `Cada tramo representa crédito vigente, no ejecución. ${byProgram ? `Se muestran los programas incluidos dentro de ${jurisdiction}.` : "Se muestran las ocho secretarías con mayor crédito; el resto se agrupa como Otros."}` : "No hay crédito vigente para la selección actual.";
  $("#budget-size-legend").innerHTML = items.map((item) => `<li><i style="background:${item.color}"></i><span>${escapeHtml(item.label)}</span><strong>${formatCents(item.value)}</strong><small>${columnShare(item.value, total)}</small></li>`).join("");
  canvas.hidden = !items.length; empty.hidden = Boolean(items.length); if (!items.length) { empty.textContent = "No hay datos para esta selección."; return; }
  if (typeof Chart === "undefined") { canvas.hidden = true; empty.hidden = false; empty.textContent = "No se pudo cargar la biblioteca de gráficos."; return; }
  budgetSizeChart = new Chart(canvas, { type: "bar", data: { labels: ["Crédito vigente"], datasets: items.map((item) => ({ label: item.label, data: [item.value], rawValue: item.value, backgroundColor: item.color, borderColor: "#fff", borderWidth: 1, borderRadius: 3, barThickness: 42 })) }, options: { indexAxis: "y", responsive: true, maintainAspectRatio: false, interaction: { mode: "nearest", intersect: true }, plugins: { legend: { display: false }, tooltip: { backgroundColor: "#fff", titleColor: "#15233b", bodyColor: "#46556d", borderColor: "#c7d5e2", borderWidth: 1, padding: 11, callbacks: { label: (context) => `${context.dataset.label}: ${formatCents(context.dataset.rawValue)} (${columnShare(context.dataset.rawValue, total)})` } } }, scales: { x: { stacked: true, beginAtZero: true, grid: { color: "#e4e9ef" }, ticks: { callback: formatAxisAmount } }, y: { stacked: true, display: false } } } });
}
const barValueLabelsPlugin = {
  id: "barValueLabels",
  afterDatasetsDraw(chart) {
    if (!showBarValues || !["bar", "current"].includes(activeChart)) return;
    const meta = chart.getDatasetMeta(0), dataset = chart.data.datasets[0], values = dataset.displayValues || dataset.data, context = chart.ctx;
    context.save(); context.font = "700 11px system-ui, sans-serif"; context.textAlign = "center";
    meta.data.forEach((bar, index) => {
      const value = values[index], label = formatAxisAmount(value), height = 17, halfWidth = context.measureText(label).width / 2 + 5;
      let y = bar.y + (value >= 0 ? -12 : 12); y = Math.max(chart.chartArea.top + height / 2, Math.min(chart.chartArea.bottom - height / 2, y));
      const x = Math.max(chart.chartArea.left + halfWidth, Math.min(chart.chartArea.right - halfWidth, bar.x));
      context.fillStyle = "rgba(255,255,255,.9)"; context.beginPath(); context.roundRect(x - halfWidth, y - height / 2, halfWidth * 2, height, 4); context.fill();
      context.fillStyle = value >= 0 ? "#187347" : "#a93642"; context.textBaseline = "middle"; context.fillText(label, x, y);
    });
    context.restore();
  },
};
const rankingExpectedLinePlugin = {
  id: "rankingExpectedLine",
  afterDatasetsDraw(chart, _args, options) {
    if (!Number.isFinite(options?.value)) return;
    const x = chart.scales.x.getPixelForValue(options.value), context = chart.ctx; context.save(); context.strokeStyle = "#a56f00"; context.lineWidth = 2; context.setLineDash([5, 5]); context.beginPath(); context.moveTo(x, chart.chartArea.top); context.lineTo(x, chart.chartArea.bottom); context.stroke(); context.restore();
  },
};
const rankingGroupDividerPlugin = {
  id: "rankingGroupDivider",
  afterDraw(chart, _args, options) {
    const split = Number(options?.split || 0), bars = chart.getDatasetMeta(0).data;
    if (!split || split >= bars.length) return;
    const y = (bars[split - 1].y + bars[split].y) / 2, context = chart.ctx; context.save(); context.strokeStyle = "#aeb9c6"; context.lineWidth = 1; context.setLineDash([4, 4]); context.beginPath(); context.moveTo(chart.chartArea.left, y); context.lineTo(chart.chartArea.right, y); context.stroke(); context.restore();
  },
};
const rankingPercentLabelsPlugin = {
  id: "rankingPercentLabels",
  afterDatasetsDraw(chart, _args, options) {
    const values = options?.values || [], meta = chart.getDatasetMeta(0), context = chart.ctx; context.save(); context.font = "800 12px system-ui, sans-serif"; context.textBaseline = "middle";
    meta.data.forEach((bar, index) => {
      const label = formatPercent(values[index]), width = context.measureText(label).width + 10, anchor = Math.max(chart.chartArea.left, Math.min(chart.chartArea.right, bar.x));
      let x = anchor - width - 4, fill = "#fff", text = "#173b5d";
      if (bar.x - bar.base >= width + 12) { x = anchor - width - 5; fill = "rgba(12,74,45,.82)"; text = "#fff"; }
      else { x = Math.min(chart.chartArea.right - width, anchor + 5); }
      context.fillStyle = fill; context.beginPath(); context.roundRect(x, bar.y - 10, width, 20, 5); context.fill(); context.fillStyle = text; context.textAlign = "center"; context.fillText(label, x + width / 2, bar.y);
    });
    context.restore();
  },
};
const rankingFundingLabelsPlugin = {
  id: "rankingFundingLabels",
  afterDatasetsDraw(chart, _args, options) {
    const values = options?.values || [], meta = chart.getDatasetMeta(0), context = chart.ctx; context.save(); context.font = "800 12px system-ui, sans-serif"; context.textBaseline = "middle";
    meta.data.forEach((bar, index) => {
      const value = values[index], label = `${value > 0 ? "+" : ""}${formatPercent(value)}`, width = context.measureText(label).width + 12, positive = value >= 0;
      let x = positive ? bar.x + 6 : bar.x - width - 6; x = Math.max(chart.chartArea.left, Math.min(chart.chartArea.right - width, x));
      context.fillStyle = "rgba(255,255,255,.92)"; context.beginPath(); context.roundRect(x, bar.y - 10, width, 20, 5); context.fill(); context.fillStyle = positive ? "#187347" : "#a93642"; context.textAlign = "center"; context.fillText(label, x + width / 2, bar.y);
    });
    context.restore();
  },
};
const mainBarValueLabelsPlugin = {
  id: "mainBarValueLabels",
  afterDatasetsDraw(chart, _args, options) {
    if (!options?.display) return;
    const context = chart.ctx; context.save(); context.font = "700 10px system-ui, sans-serif"; context.textAlign = "center";
    chart.data.datasets.forEach((dataset, datasetIndex) => { if ((dataset.type || chart.config.type) !== "bar") return; const meta = chart.getDatasetMeta(datasetIndex); meta.data.forEach((bar, index) => { const value = Number(dataset.data[index] || 0); context.fillStyle = value >= 0 ? "#155c39" : "#a93642"; context.textBaseline = value >= 0 ? "bottom" : "top"; context.fillText(formatAxisAmount(value), bar.x, bar.y + (value >= 0 ? -6 : 6)); }); });
    context.restore();
  },
};
const financingBarLabelsPlugin = {
  id: "financingBarLabels",
  afterDatasetsDraw(chart) {
    const meta = chart.getDatasetMeta(0), values = chart.data.datasets[0].data, context = chart.ctx;
    context.save(); context.font = "800 13px system-ui, sans-serif"; context.textBaseline = "middle";
    meta.data.forEach((bar, index) => { const label = formatPercent(values[index]), width = context.measureText(label).width, outside = chart.chartArea.right - bar.x > width + 14; context.fillStyle = outside ? "#173b5d" : "#fff"; context.textAlign = outside ? "left" : "right"; context.fillText(label, bar.x + (outside ? 8 : -8), bar.y); });
    context.restore();
  },
};
const resourceGrowthLabelsPlugin = {
  id: "resourceGrowthLabels",
  afterDatasetsDraw(chart) {
    const dataset = chart.data.datasets[0], meta = chart.getDatasetMeta(0), context = chart.ctx;
    context.save(); context.font = "700 11px system-ui, sans-serif"; context.textBaseline = "middle";
    meta.data.forEach((bar, index) => { const value = dataset.data[index], label = `${formatBillions(value)} (${formatPercent(dataset.shares[index])})`; context.fillStyle = value >= 0 ? "#187347" : "#a93642"; context.textAlign = value >= 0 ? "left" : "right"; context.fillText(label, bar.x + (value >= 0 ? 8 : -8), bar.y); });
    context.restore();
  },
};
const contributionValueLabelsPlugin = {
  id: "contributionValueLabels",
  afterDatasetsDraw(chart) {
    const dataset = chart.data.datasets[0], meta = chart.getDatasetMeta(0), context = chart.ctx;
    context.save(); context.font = "700 11px system-ui, sans-serif"; context.textBaseline = "middle";
    meta.data.forEach((bar, index) => { const value = dataset.data[index]; context.fillStyle = value >= 0 ? "#187347" : "#a93642"; context.textAlign = value >= 0 ? "left" : "right"; context.fillText(`${value > 0 ? "+" : ""}${formatAxisAmount(value)}`, bar.x + (value >= 0 ? 8 : -8), bar.y); });
    context.restore();
  },
};
function monthlyModificationBreakdown(period, previousPeriod, rows) {
  const aggregate = (targetPeriod) => { const groups = new Map(); if (!targetPeriod) return groups; rows.filter((row) => row.fecha_corte === targetPeriod).forEach((row) => { const values = groups.get(row.jurisdiccion_nombre) || { approved: 0, current: 0 }; values.approved += cents(row, "credito_aprobado_centavos"); values.current += cents(row, "credito_vigente_centavos"); groups.set(row.jurisdiccion_nombre, values); }); return new Map([...groups].map(([label, values]) => [label, values.current - values.approved])); };
  const current = aggregate(period), previous = aggregate(previousPeriod), labels = new Set([...current.keys(), ...previous.keys()]);
  const items = [...labels].map((label) => ({ label, value: (current.get(label) || 0) - (previous.get(label) || 0) })).filter((item) => item.value !== 0).sort((a, b) => Math.abs(b.value) - Math.abs(a.value));
  const grossTotal = items.reduce((total, item) => total + Math.abs(item.value), 0);
  return { grossTotal, items: items.map((item) => ({ ...item, share: grossTotal ? Math.abs(item.value) / grossTotal * 100 : null })) };
}
function monthlyProgramModificationHighlights(period, previousPeriod, rows) {
  const aggregate = (targetPeriod) => {
    const groups = new Map(); if (!targetPeriod) return groups;
    rows.filter((row) => row.fecha_corte === targetPeriod).forEach((row) => { const key = `${row.jurisdiccion_nombre}\u0000${row.programa_nombre}`, item = groups.get(key) || { secretary: row.jurisdiccion_nombre, program: row.programa_nombre, approved: 0, current: 0 }; item.approved += cents(row, "credito_aprobado_centavos"); item.current += cents(row, "credito_vigente_centavos"); groups.set(key, item); });
    return new Map([...groups].map(([key, item]) => [key, { ...item, modification: item.current - item.approved }]));
  };
  const current = aggregate(period), previous = aggregate(previousPeriod), keys = new Set([...current.keys(), ...previous.keys()]);
  const items = [...keys].map((key) => { const currentItem = current.get(key), previousItem = previous.get(key), reference = currentItem || previousItem; return { secretary: reference.secretary, program: reference.program, value: (currentItem?.modification || 0) - (previousItem?.modification || 0) }; }).filter((item) => item.value !== 0);
  const positives = items.filter((item) => item.value > 0).sort((a, b) => b.value - a.value), negatives = items.filter((item) => item.value < 0).sort((a, b) => a.value - b.value);
  const positive = positives[0] || null, negative = negatives[0] || [...positives].reverse().find((item) => item !== positive) || positive || null;
  return { positive, negative, negativeFallback: !negatives.length && Boolean(negative) };
}
function renderBridgeExplanation(items, focusIndex) {
  const item = items[focusIndex], previousButton = $("#bridge-previous"), nextButton = $("#bridge-next");
  if (!item) { $("#bridge-explanation-title").textContent = "Breve explicación"; $("#bridge-explanation-period").textContent = "Sin período"; $("#bridge-explanation-summary").textContent = "No hay información para los filtros seleccionados."; $("#bridge-explanation-leaders").innerHTML = ""; $("#bridge-program-highlights").innerHTML = ""; previousButton.disabled = true; nextButton.disabled = true; return; }
  const sign = item.change > 0 ? "+" : item.change < 0 ? "−" : "";
  $("#bridge-explanation-title").textContent = `Breve explicación · ${labelPeriod(item.period)}`;
  $("#bridge-explanation-period").textContent = `Movimiento neto: ${sign}${formatCents(Math.abs(item.change))}`;
  $("#bridge-explanation-summary").textContent = `Durante el mes hubo movimientos por ${formatCents(item.breakdown.grossTotal)} entre aumentos y reducciones. La modificación acumulada llegó a ${item.end >= 0 ? "+" : "−"}${formatCents(Math.abs(item.end))}.`;
  $("#bridge-explanation-leaders").innerHTML = item.leaders.length ? item.leaders.map((leader) => `<li><strong>${escapeHtml(leader.label)}</strong><small class="${leader.value >= 0 ? "positive" : "negative"}">${leader.value >= 0 ? "+" : "−"}${formatCents(Math.abs(leader.value))} · ${formatPercent(leader.share)} del movimiento mensual</small></li>`).join("") : "<li>Sin modificaciones registradas.</li>";
  const highlights = item.programHighlights, programRows = [];
  if (highlights.positive) programRows.push({ label: "Mayor aumento", ...highlights.positive });
  if (highlights.negative) programRows.push({ label: highlights.negativeFallback ? "Menor aumento (sin reducciones)" : "Mayor reducción", ...highlights.negative });
  $("#bridge-program-highlights").innerHTML = programRows.length ? programRows.map((program) => `<li><span>${escapeHtml(program.label)}</span><strong>${escapeHtml(program.program)}</strong><small>${escapeHtml(program.secretary)}</small><b class="${program.value >= 0 ? "positive" : "negative"}">${program.value >= 0 ? "+" : "−"}${formatCents(Math.abs(program.value))}</b></li>`).join("") : "<li>Sin modificaciones por programa.</li>";
  previousButton.disabled = focusIndex <= 0; nextButton.disabled = focusIndex >= items.length - 1;
}
function renderChart(rows) {
  const periodValues = aggregatePeriods(rows), allRows = filteredRows(true), comparisonValues = aggregatePeriods(allRows), latestSelectedPeriod = periodValues.at(-1)?.period;
  const values = periodValues.map((value) => ({ ...value, execution: executionPercent(value.accrued, value.current), expected: Number(value.period.split("/")[1]) * 100 / 12 })), canvas = $("#budget-chart"), empty = $("#chart-empty");
  $(".bridge-layout").classList.toggle("bridge-line-mode", activeChart !== "bar"); $(".bridge-explanation").hidden = activeChart !== "bar";
  $("#bar-value-control").hidden = activeChart === "line";
  empty.hidden = Boolean(values.length); canvas.hidden = !values.length;
  if (budgetChart) { budgetChart.destroy(); budgetChart = null; }
  if (!values.length) { renderBridgeExplanation([], -1); return; }
  if (typeof Chart === "undefined") { canvas.hidden = true; empty.hidden = false; empty.textContent = "No se pudo cargar la biblioteca de gráficos."; return; }
  empty.textContent = "No hay datos para esta combinación de filtros.";
  let labels = values.map((value) => labelPeriod(value.period)), datasets, yOptions, bridgeItems = [];
  if (activeChart === "line") {
    const maximum = Math.max(100, Math.ceil(Math.max(...values.flatMap((value) => [value.execution || 0, value.expected])) / 25) * 25);
    datasets = [
      { id: "execution", label: "Ejecución real", data: values.map((value) => value.execution), borderColor: "#7b3fc6", backgroundColor: "#7b3fc6", pointBackgroundColor: "#7b3fc6", pointRadius: 4, pointHoverRadius: 6, borderWidth: 3, tension: .28 },
      { id: "expected", label: "Ritmo esperado", data: values.map((value) => value.expected), borderColor: "#d59a13", backgroundColor: "#d59a13", pointBackgroundColor: "#fff", pointBorderColor: "#d59a13", pointBorderWidth: 2, pointRadius: 4, borderWidth: 2, borderDash: [7, 6], tension: 0 },
    ];
    yOptions = { min: 0, max: maximum, ticks: { stepSize: 25, callback: (value) => `${value}%` } };
    $("#chart-title").textContent = "Ejecución real y ritmo esperado";
    $("#chart-legend").innerHTML = '<span class="legend-execution"></span>% ejecutado <span class="legend-expected"></span>% esperado';
  } else if (activeChart === "current") {
    datasets = [{ id: "current", label: "Crédito vigente", data: values.map((value) => value.current), backgroundColor: "#174f7c", borderRadius: 6, maxBarThickness: 62 }];
    yOptions = { beginAtZero: true, ticks: { callback: formatAxisAmount } };
    $("#chart-title").textContent = "Evolución del crédito vigente";
    $("#chart-legend").innerHTML = '<span class="legend-current"></span>Crédito vigente de cada cierre';
  } else {
    let running = 0;
    const allBridgeItems = comparisonValues.map((value, index) => { const next = value.current - value.approved, change = next - running, previousPeriod = index ? comparisonValues[index - 1].period : null, breakdown = monthlyModificationBreakdown(value.period, previousPeriod, allRows), item = { ...value, start: running, end: next, change, breakdown, leaders: breakdown.items.slice(0, 3), programHighlights: monthlyProgramModificationHighlights(value.period, previousPeriod, allRows) }; running = next; return item; });
    if (!allBridgeItems.some((item) => item.period === bridgeFocusPeriod)) bridgeFocusPeriod = allBridgeItems.some((item) => item.period === latestSelectedPeriod) ? latestSelectedPeriod : allBridgeItems.at(-1)?.period;
    const focusIndex = Math.max(0, allBridgeItems.findIndex((item) => item.period === bridgeFocusPeriod));
    bridgeItems = allBridgeItems.slice(0, focusIndex + 1); running = bridgeItems.at(-1)?.end || 0; renderBridgeExplanation(allBridgeItems, focusIndex);
    const points = bridgeItems.map((value) => [value.start, value.end]), changes = bridgeItems.map((value) => value.change); labels = bridgeItems.map((value) => labelPeriod(value.period)); labels.push("Acumulado"); points.push([0, running]); changes.push(running);
    const largest = Math.max(...points.flat().map(Math.abs), 1), step = niceStep(largest / 3), limit = Math.max(step, Math.ceil(largest / step) * step);
    datasets = [{ id: "waterfall", label: "Modificación", data: points, displayValues: changes, backgroundColor: [...bridgeItems.map((value) => value.change > 0 ? "#26905f" : value.change < 0 ? "#c74c56" : "#8c99a9"), "#1264a3"], borderRadius: 5, maxBarThickness: 56 }];
    yOptions = { min: -limit, max: limit, ticks: { stepSize: step, callback: formatAxisAmount } };
    $("#chart-title").textContent = "Puente presupuestario";
    $("#chart-legend").innerHTML = '<span class="legend-positive"></span>Aumento mensual <span class="legend-negative"></span>Reducción mensual <span class="legend-cumulative"></span>Modificación acumulada';
  }
  budgetChart = new Chart(canvas, {
    type: activeChart === "line" ? "line" : "bar",
    data: { labels, datasets },
    plugins: [barValueLabelsPlugin],
    options: {
      responsive: true, maintainAspectRatio: false, animation: { duration: 350 }, interaction: { mode: "index", intersect: false },
      layout: { padding: { top: showBarValues && ["bar", "current"].includes(activeChart) ? 18 : 4, right: 12, bottom: showBarValues && ["bar", "current"].includes(activeChart) ? 18 : 0, left: 8 } },
      plugins: {
        legend: { display: false },
        tooltip: { backgroundColor: "#fff", titleColor: "#15233b", bodyColor: "#46556d", borderColor: "#c7d5e2", borderWidth: 1, padding: 12, displayColors: true, callbacks: {
          label: (context) => { if (activeChart === "line") return `${context.dataset.label}: ${formatPercent(context.parsed.y)}`; if (activeChart === "current") return `Crédito vigente: ${formatCents(context.parsed.y)}`; const change = context.dataset.displayValues[context.dataIndex]; return context.dataIndex === bridgeItems.length ? `Modificación acumulada: ${change >= 0 ? "+" : ""}${formatCents(change)}` : `Movimiento del mes: ${change >= 0 ? "+" : ""}${formatCents(change)}`; },
          afterBody: (items) => { if (!items.length) return []; const index = items[0].dataIndex; if (activeChart === "line") { const value = values[index], difference = value.execution === null ? null : value.execution - value.expected; return [difference === null ? "Diferencia: —" : `Diferencia: ${difference >= 0 ? "+" : ""}${difference.toLocaleString("es-AR", { maximumFractionDigits: 1 })} p.p.`]; } if (activeChart === "current") { const previous = index ? values[index - 1].current : values[index].approved, change = values[index].current - previous; return [`Variación: ${change >= 0 ? "+" : "−"}${formatCents(Math.abs(change))}`]; } if (index === bridgeItems.length) return []; const leaders = bridgeItems[index].leaders; return leaders.length ? ["", "Mayor participación en el movimiento mensual:", ...leaders.map((item) => `${item.label}: ${item.value >= 0 ? "+" : "−"}${formatCents(Math.abs(item.value))} (${formatPercent(item.share)})`)] : ["Sin modificaciones por secretaría."]; },
        } },
      },
      scales: {
        x: { offset: ["bar", "current"].includes(activeChart), grid: { display: false }, border: { display: false }, ticks: { color: "#60708a", font: { size: 11 }, maxRotation: 0 } },
        y: { ...yOptions, border: { display: false }, grid: { color: (context) => context.tick.value === 0 ? "#526176" : "#dce3eb", lineWidth: (context) => context.tick.value === 0 ? 2 : 1 }, ticks: { ...yOptions.ticks, color: "#60708a", font: { size: 11 }, padding: 10 } },
      },
    },
  });
  $("#chart-note").textContent = values.length < 2 ? "Seleccioná más períodos para comparar la evolución." : activeChart === "line" ? "La línea esperada distribuye el 100% del crédito en doce meses. Posate sobre un punto para comparar." : activeChart === "current" ? "Cada barra muestra el crédito vigente acumulado informado al cierre de ese mes." : "Cada barra enlaza la modificación acumulada de un cierre con el siguiente. Los porcentajes del detalle se calculan sobre la suma de todos los aumentos y reducciones del mes.";
}
function rankingLabel(row, dimension) {
  if (dimension === "program") return `${row.jurisdiccion_nombre} · ${row.programa_nombre}`;
  if (dimension === "source") return row.fuente_financiamiento_nombre;
  if (dimension === "object") return row.objeto_gasto_nombre;
  return row.jurisdiccion_nombre;
}
function rankingGroups(rows, dimension, period) {
  const groups = new Map();
  rows.forEach((row) => { const label = rankingLabel(row, dimension), group = groups.get(label) || []; group.push(row); groups.set(label, group); });
  const expected = period ? Number(period.split("/")[1]) * 100 / 12 : 0;
  return [...groups.entries()].map(([label, group]) => {
    const values = totals(group), execution = executionPercent(values.accrued, values.current), first = group[0];
    const modification = values.current - values.approved;
    return { label, primary: dimension === "program" ? first.jurisdiccion_nombre : label, secondary: dimension === "program" ? first.programa_nombre : ({ jurisdiction: "Secretaría", source: "Fuente de financiamiento", object: "Objeto del gasto" })[dimension], values, execution, expected, modification, financingRate: values.approved ? modification / values.approved * 100 : 0, shortfall: execution === null ? null : expected - execution };
  });
}
function rankingDisplayLabel(item, dimension, rows) {
  if (dimension !== "program") return item.label;
  const jurisdictions = unique(rows.map((row) => row.jurisdiccion_nombre));
  return jurisdictions.length === 1 ? item.secondary : `${item.primary} · ${item.secondary}`;
}
function rankingTickLabel(label, maxLength = 27) {
  if (label.length <= maxLength) return label;
  const words = label.split(/\s+/), lines = [""];
  words.forEach((word) => { const line = lines.at(-1), next = line ? `${line} ${word}` : word; if (next.length > maxLength && lines.length < 2) lines.push(word); else lines[lines.length - 1] = next; });
  if (lines[1]?.length > maxLength) lines[1] = `${lines[1].slice(0, maxLength - 1)}…`;
  return lines;
}
function rankingExtremes(sorted, topCount = 3, bottomCount = 3) {
  const top = sorted.slice(0, topCount), used = new Set(top.map((item) => item.label)), bottom = [...sorted].reverse().filter((item) => !used.has(item.label)).slice(0, bottomCount).reverse();
  return { items: [...top, ...bottom], topLength: top.length, bottomLength: bottom.length };
}
function renderRankings(rows, latestPeriod) {
  const dimension = $("#ranking-dimension").value, groups = rankingGroups(rows, dimension, latestPeriod);
  const execution = rankingExtremes(groups.filter((item) => item.execution !== null).sort((a, b) => b.execution - a.execution));
  const funded = groups.filter((item) => item.financingRate > 0).sort((a, b) => b.financingRate - a.financingRate).slice(0, 3), defunded = groups.filter((item) => item.financingRate < 0).sort((a, b) => a.financingRate - b.financingRate).slice(0, 3).sort((a, b) => b.financingRate - a.financingRate);
  const fundingItems = [...funded, ...defunded], expected = latestPeriod ? Number(latestPeriod.split("/")[1]) * 100 / 12 : 0;
  const executionCanvas = $("#ranking-execution-chart"), executionEmpty = $("#ranking-execution-empty"), fundingCanvas = $("#ranking-funding-chart"), fundingEmpty = $("#ranking-funding-empty");
  if (rankingExecutionChart) rankingExecutionChart.destroy(); if (rankingFundingChart) rankingFundingChart.destroy(); rankingExecutionChart = null; rankingFundingChart = null;
  executionCanvas.hidden = !execution.items.length; executionEmpty.hidden = Boolean(execution.items.length); executionEmpty.textContent = "Sin grupos con crédito vigente para comparar.";
  fundingCanvas.hidden = !fundingItems.length; fundingEmpty.hidden = Boolean(fundingItems.length); fundingEmpty.textContent = "No se registran aumentos ni reducciones para esta selección.";
  if (typeof Chart !== "undefined" && execution.items.length) {
    const actual = execution.items.map((item) => item.execution), executed = actual.map((value) => Math.max(0, Math.min(100, value))), gap = executed.map((value) => Math.max(0, Math.min(100, expected) - value)), rest = executed.map((value, index) => Math.max(0, 100 - value - gap[index]));
    rankingExecutionChart = new Chart(executionCanvas, { type: "bar", plugins: [rankingExpectedLinePlugin, rankingPercentLabelsPlugin, rankingGroupDividerPlugin], data: { labels: execution.items.map((item) => rankingTickLabel(rankingDisplayLabel(item, dimension, rows))), datasets: [{ label: "Ejecutado", data: executed, backgroundColor: "#26905f", borderRadius: 4, stack: "total" }, { label: "Brecha al esperado", data: gap, backgroundColor: "#c74c56", stack: "total" }, { label: "Resto", data: rest, backgroundColor: "#e5eaf0", borderRadius: 4, stack: "total" }] }, options: { indexAxis: "y", responsive: true, maintainAspectRatio: false, animation: { duration: 300 }, layout: { padding: { right: 10 } }, plugins: { legend: { display: false }, rankingExpectedLine: { value: expected }, rankingPercentLabels: { values: actual }, rankingGroupDivider: { split: execution.topLength }, tooltip: { enabled: false } }, scales: { x: { stacked: true, min: 0, max: 100, ticks: { callback: (value) => `${value}%` }, grid: { color: "#e2e7ed" } }, y: { stacked: true, grid: { display: false }, ticks: { color: "#34445c", font: { size: 10, weight: "600" } } } } } });
  }
  if (typeof Chart !== "undefined" && fundingItems.length) {
    const rates = fundingItems.map((item) => item.financingRate), largest = Math.max(...rates.map(Math.abs), 1), step = Math.max(5, niceStep(largest / 3)), limit = Math.ceil(largest / step) * step;
    rankingFundingChart = new Chart(fundingCanvas, { type: "bar", plugins: [rankingFundingLabelsPlugin, rankingGroupDividerPlugin], data: { labels: fundingItems.map((item) => rankingTickLabel(rankingDisplayLabel(item, dimension, rows))), datasets: [{ data: rates, backgroundColor: rates.map((value) => value >= 0 ? "#26905f" : "#c74c56"), borderRadius: 4, maxBarThickness: 28 }] }, options: { indexAxis: "y", responsive: true, maintainAspectRatio: false, animation: { duration: 300 }, layout: { padding: { left: 42, right: 42 } }, plugins: { legend: { display: false }, rankingFundingLabels: { values: rates }, rankingGroupDivider: { split: funded.length }, tooltip: { callbacks: { label: (context) => { const item = fundingItems[context.dataIndex]; return `Variación: ${item.modification >= 0 ? "+" : "−"}${formatCents(Math.abs(item.modification))}`; } } } }, scales: { x: { min: -limit, max: limit, ticks: { stepSize: step, callback: (value) => `${value}%` }, grid: { color: (context) => context.tick.value === 0 ? "#60708a" : "#e2e7ed", lineWidth: (context) => context.tick.value === 0 ? 2 : 1 } }, y: { grid: { display: false }, ticks: { color: "#34445c", font: { size: 10, weight: "600" } } } } } });
  }
  const dimensionName = { jurisdiction: "secretaría", program: "programa", source: "fuente", object: "objeto del gasto" }[dimension];
  $("#ranking-context").textContent = latestPeriod ? `Tres valores superiores e inferiores por ${dimensionName} para ${labelPeriod(latestPeriod)}, dentro de los filtros seleccionados. La línea punteada marca el ritmo de ejecución esperado (${formatPercent(expected)}).` : "Seleccioná al menos un período para calcular las comparaciones.";
}
function groupedRows(rows, labelForRow) {
  const groups = new Map(); rows.forEach((row) => { const label = labelForRow(row), group = groups.get(label) || []; group.push(row); groups.set(label, group); }); return groups;
}
function heatClass(execution, expected) { if (execution === null) return "heat-unknown"; const difference = execution - expected; return difference < -10 ? "heat-red" : difference < -5 ? "heat-yellow" : difference <= 5 ? "heat-green" : difference < 10 ? "heat-yellow" : "heat-blue"; }
function renderHeatmap(rows, latestPeriod) {
  const container = $("#execution-heatmap"), visiblePeriods = aggregatePeriods(rows).map((value) => value.period);
  if (!latestPeriod || !visiblePeriods.length) { container.innerHTML = '<p class="insight-empty">No hay períodos seleccionados.</p>'; return; }
  const groups = groupedRows(rows, (row) => `${row.jurisdiccion_nombre}\u0000${row.programa_nombre}`), allRanked = [...groups.values()].map((group) => ({ secretary: group[0].jurisdiccion_nombre, program: group[0].programa_nombre, group, credit: sum(group.filter((row) => row.fecha_corte === latestPeriod), "credito_vigente_centavos") })).sort((a, b) => b.credit - a.credit), ranked = allRanked.slice(0, heatmapExpanded ? allRanked.length : 5).sort((a, b) => a.secretary.localeCompare(b.secretary, "es") || b.credit - a.credit);
  const header = visiblePeriods.map((period) => `<th>${escapeHtml(labelPeriod(period).split(" ")[0])}</th>`).join("");
  const body = ranked.map(({ secretary, program, group }) => `<tr><th><span class="heatmap-label"><strong>${escapeHtml(secretary)}</strong><span>${escapeHtml(program)}</span></span></th>${visiblePeriods.map((period) => { const periodRows = group.filter((row) => row.fecha_corte === period), values = totals(periodRows), execution = executionPercent(values.accrued, values.current), expected = Number(period.split("/")[1]) * 100 / 12; return `<td class="${heatClass(execution, expected)}" title="${formatPercent(execution)} ejecutado; ${formatPercent(expected)} esperado">${formatPercent(execution)}</td>`; }).join("")}</tr>`).join("");
  container.innerHTML = ranked.length ? `<table class="heatmap-table"><thead><tr><th>Secretaría y programa</th>${header}</tr></thead><tbody>${body}</tbody></table><p class="note">${heatmapExpanded ? `Se muestran los ${allRanked.length} programas disponibles.` : "Se muestran los 5 programas con mayor crédito vigente del último período seleccionado."}</p>` : '<p class="insight-empty">No hay programas para mostrar.</p>';
  $("#toggle-heatmap").hidden = allRanked.length <= 5; $("#toggle-heatmap").textContent = heatmapExpanded ? "Ver solo 5" : "Ver todos"; $("#toggle-heatmap").setAttribute("aria-expanded", String(heatmapExpanded));
}
function insightGrouping(rows) {
  const byProgram = Boolean($("#jurisdiction-filter").value), labelForRow = byProgram ? (row) => row.programa_nombre : (row) => row.jurisdiccion_nombre;
  return { byProgram, groups: groupedRows(rows, labelForRow) };
}
function renderContribution(rows, latestPeriod) {
  if (contributionChart) { contributionChart.destroy(); contributionChart = null; }
  const { byProgram, groups } = insightGrouping(rows), items = [...groups.entries()].map(([label, group]) => { const values = totals(group); return { label, value: values.current - values.approved }; }).filter((item) => item.value !== 0).sort((a, b) => Math.abs(b.value) - Math.abs(a.value)).slice(0, 8);
  $("#contribution-note").textContent = latestPeriod ? `Mayores aportes acumulados por ${byProgram ? "programa" : "secretaría"} a ${labelPeriod(latestPeriod)}.` : "Sin período seleccionado.";
  if (!items.length || typeof Chart === "undefined") return;
  const largest = Math.max(...items.map((item) => Math.abs(item.value)), 1), step = niceStep(largest / 3), limit = Math.ceil(largest / step) * step;
  contributionChart = new Chart($("#contribution-chart"), { type: "bar", data: { labels: items.map((item) => item.label), datasets: [{ data: items.map((item) => item.value), backgroundColor: items.map((item) => item.value >= 0 ? "#26905f" : "#c74c56"), borderRadius: 4 }] }, plugins: [contributionValueLabelsPlugin], options: { indexAxis: "y", responsive: true, maintainAspectRatio: false, layout: { padding: { left: 120, right: 95 } }, plugins: { legend: { display: false }, tooltip: { callbacks: { label: (context) => `${context.parsed.x >= 0 ? "+" : ""}${formatCents(context.parsed.x)}` } } }, scales: { x: { min: -limit, max: limit, grid: { color: (context) => context.tick.value === 0 ? "#526176" : "#e3e8ef" }, ticks: { stepSize: step, callback: formatAxisAmount } }, y: { grid: { display: false }, ticks: { autoSkip: false, padding: 12, font: { size: 10 }, callback(value) { const label = this.getLabelForValue(value); return label.length > 24 ? `${label.slice(0, 23)}…` : label; } } } } } });
}
function renderAlerts(rows, latestPeriod) {
  const container = $("#budget-alerts"); if (!latestPeriod) { container.innerHTML = '<li class="insight-empty">Sin período seleccionado.</li>'; return; }
  const { byProgram, groups } = insightGrouping(rows), expected = Number(latestPeriod.split("/")[1]) * 100 / 12;
  const alerts = [...groups.entries()].map(([label, group]) => { const values = totals(group), execution = executionPercent(values.accrued, values.current), shortfall = execution === null ? 0 : expected - execution; return { label, values, execution, shortfall, score: Math.max(shortfall, 0) * values.current }; }).filter((item) => item.values.current > 0 && item.shortfall > 5).sort((a, b) => b.score - a.score).slice(0, 5);
  container.innerHTML = alerts.length ? alerts.map((item, index) => `<li><span>${index + 1}</span><div><strong>${escapeHtml(item.label)}</strong><small>${formatPercent(item.execution)} ejecutado · ${item.shortfall.toLocaleString("es-AR", { maximumFractionDigits: 1 })} p.p. bajo el ritmo · ${formatCents(item.values.current)} vigentes</small></div></li>`).join("") : `<li class="insight-empty">No hay ${byProgram ? "programas" : "secretarías"} con alertas relevantes.</li>`;
}
function renderInsights(rows, latestRows, latestPeriod) { renderHeatmap(rows, latestPeriod); renderContribution(latestRows, latestPeriod); renderAlerts(latestRows, latestPeriod); }
function totals(rows) { return { approved: sum(rows, "credito_aprobado_centavos"), current: sum(rows, "credito_vigente_centavos"), accrued: sum(rows, "devengado_centavos"), available: sum(rows, "credito_disponible_centavos") }; }
function renderPublicSummary() {
  const expensePeriod = periods().at(-1), expenseRows = data.filter((row) => row.fecha_corte === expensePeriod), budget = totals(expenseRows), budgetChange = budget.current - budget.approved, budgetChangeRate = budget.approved ? budgetChange / budget.approved * 100 : null;
  const resourcePeriod = resourcePeriods().at(-1), latestResourceRows = resourceData.filter((row) => row.fecha_corte === resourcePeriod), resources = resourceTotals(latestResourceRows), collectionRate = collectionPercent(resources.perceived, resources.current), resourceChange = resources.current - resources.estimated;
  const paid = sum(expenseRows, "pagado_centavos"), financialResult = resources.perceived - paid;
  $("#public-summary-period").textContent = expensePeriod ? `Datos al cierre de ${labelPeriod(expensePeriod)}` : "Sin datos disponibles";
  $("#public-total-paid").textContent = formatBillions(paid); $("#public-total-collected").textContent = formatBillions(resources.perceived);
  const resultElement = $("#public-financial-result"); resultElement.textContent = `${financialResult >= 0 ? "+" : "−"}${formatBillions(Math.abs(financialResult))}`; resultElement.classList.toggle("positive", financialResult >= 0); resultElement.classList.toggle("negative", financialResult < 0);
  $("#public-financial-result-note").textContent = financialResult >= 0 ? "Lo percibido supera a los pagos realizados" : "Los pagos realizados superan a lo percibido";
  $("#public-budget-approved").textContent = formatBillions(budget.approved);
  $("#public-budget-current").textContent = formatBillions(budget.current);
  const budgetChangeElement = $("#public-budget-change"); budgetChangeElement.textContent = budgetChangeRate === null ? "—" : `${budgetChangeRate >= 0 ? "+" : "−"}${formatPercent(Math.abs(budgetChangeRate))}`; budgetChangeElement.classList.toggle("positive", budgetChange > 0); budgetChangeElement.classList.toggle("negative", budgetChange < 0);
  $("#public-budget-change-note").textContent = budgetChange === 0 ? "Sin modificaciones sobre el monto aprobado" : `${budgetChange > 0 ? "+" : "−"}${formatBillions(Math.abs(budgetChange))} frente al aprobado`;
  const budgetTone = budgetChange >= 0 ? "positive-text" : "negative-text";
  $("#public-budget-explanation").innerHTML = budgetChange === 0 ? "Hasta el último cierre, el presupuesto no registra cambios respecto del monto inicial." : `Hasta el último cierre, el presupuesto ${budgetChange > 0 ? "aumentó" : "se redujo"} en <strong class="${budgetTone}">${formatBillions(Math.abs(budgetChange))}</strong>, una variación de <strong class="${budgetTone}">${budgetChangeRate >= 0 ? "+" : "−"}${formatPercent(Math.abs(budgetChangeRate))}</strong>.`;

  const secretaryGroups = new Map(); expenseRows.forEach((row) => { const group = secretaryGroups.get(row.jurisdiccion_nombre) || []; group.push(row); secretaryGroups.set(row.jurisdiccion_nombre, group); });
  const secretaries = [...secretaryGroups.entries()].map(([name, rows]) => ({ name, values: totals(rows) })).sort((a, b) => b.values.current - a.values.current);
  $("#public-expense-table").innerHTML = secretaries.map((item) => { const approvedShare = budget.approved ? item.values.approved / budget.approved * 100 : null, currentShare = budget.current ? item.values.current / budget.current * 100 : null, difference = approvedShare === null || currentShare === null ? null : Math.round((currentShare - approvedShare) * 10) / 10, differenceClass = difference > 0 ? "positive" : difference < 0 ? "negative" : ""; return `<tr><td>${escapeHtml(item.name)}</td><td class="number">${formatPercent(approvedShare)}</td><td class="number"><strong>${formatPercent(currentShare)}</strong></td><td class="number ${differenceClass}">${difference === null ? "—" : `${difference > 0 ? "+" : difference < 0 ? "−" : ""}${Math.abs(difference).toLocaleString("es-AR", { maximumFractionDigits: 1 })} p.p.`}</td></tr>`; }).join("");
  const leadingSecretaries = secretaries.slice(0, 3), leadingShare = leadingSecretaries.reduce((total, item) => total + item.values.current, 0);
  $("#public-expense-explanation").innerHTML = leadingSecretaries.length ? `<ol>${leadingSecretaries.map((item, index) => `<li><span>${index + 1}</span><p><strong>${escapeHtml(item.name)}</strong><small>${columnShare(item.values.current, budget.current)} del crédito vigente</small></p></li>`).join("")}</ol><p>En conjunto, estas tres áreas concentran el <strong>${columnShare(leadingShare, budget.current)}</strong> del presupuesto vigente.</p>` : "<p>No hay datos de gastos disponibles.</p>";

  $("#public-resource-approved").textContent = formatBillions(resources.estimated);
  $("#public-resource-current").textContent = formatBillions(resources.current);
  $("#public-resource-rate").textContent = formatPercent(collectionRate); $("#public-resource-rate-note").textContent = `${formatBillions(resources.perceived)} efectivamente percibidos`;
  const resourceTone = resourceChange >= 0 ? "positive-text" : "negative-text";
  $("#public-resource-explanation").innerHTML = `La previsión vigente ${resourceChange >= 0 ? "aumentó" : "se redujo"} <strong class="${resourceTone}">${formatBillions(Math.abs(resourceChange))}</strong> frente a la estimación inicial. A ${resourcePeriod ? labelPeriod(resourcePeriod) : "la fecha"} se percibieron <strong class="positive-text">${formatBillions(resources.perceived)}</strong>.`;
  const featuredResources = new Map([
    ["12.2.01.00", { short: "DReI", name: "Derecho de Registro e Inspección" }],
    ["12.1.01.00", { short: "TGI", name: "Tasa General de Inmuebles" }],
    ["12.6.01.00", { short: "Multas", name: "Multas a las Contravenciones" }],
    ["11.4.04.00", { short: "Coparticipación Federal", name: "Coparticipación Federal" }],
    ["11.4.03.00", { short: "Ingresos Brutos", name: "Coparticipación por Ingresos Brutos" }],
  ]);
  const resourceCards = [...featuredResources.entries()].map(([code, labels]) => ({ ...labels, value: sum(latestResourceRows.filter((row) => row.rubro_codigo === code), "recurso_percibido_centavos") })).sort((a, b) => b.value - a.value);
  $("#public-resource-cards").innerHTML = resourceCards.map((item, index) => `<article><div class="public-income-rank">${index + 1}</div><h4>${escapeHtml(item.name)}</h4><strong>${formatBillions(item.value)}</strong><span>${columnShare(item.value, resources.perceived)} del total recaudado</span></article>`).join("");
  const highlightedTotal = resourceCards.reduce((total, item) => total + item.value, 0), topThreeTotal = resourceCards.slice(0, 3).reduce((total, item) => total + item.value, 0);
  $("#public-resource-highlight-summary").innerHTML = `<p><strong>Lectura conjunta:</strong> estos cinco ingresos explican el <b>${columnShare(highlightedTotal, resources.perceived)}</b> de todo lo recaudado. Los tres primeros —${resourceCards.slice(0, 3).map((item) => escapeHtml(item.short)).join(", ")}— concentran por sí solos el <b>${columnShare(topThreeTotal, resources.perceived)}</b>.</p>`;
}
function executionAssessment(values, period) {
  const actual = executionPercent(values.accrued, values.current);
  if (actual === null || !period) return { actual, expected: null, status: "unknown" };
  const month = Number(period.split("/")[1]), expected = month * 100 / 12, difference = actual - expected;
  const status = difference < -10 ? "red" : difference < -5 ? "yellow" : difference <= 5 ? "green" : difference < 10 ? "yellow" : "blue";
  return { actual, expected, status };
}
function columnShare(value, total) { return total ? `${(value / total * 100).toLocaleString("es-AR", { maximumFractionDigits: 1 })}%` : "—"; }
function amountCell(value, columnTotal) { return `<td class="number"><span>${formatCents(value)}</span><small class="cell-share">(${columnShare(value, columnTotal)} del total)</small></td>`; }
function modificationCell(value) { const sign = value > 0 ? "+" : value < 0 ? "−" : ""; return `<td class="number modification-cell ${value > 0 ? "positive" : value < 0 ? "negative" : ""}"><span>${sign}${formatCents(Math.abs(value))}</span></td>`; }
function totalCells(values, period, columnTotals) {
  const assessment = executionAssessment(values, period);
  const difference = assessment.actual === null ? null : assessment.actual - assessment.expected;
  const title = assessment.expected === null ? "Porcentaje no disponible" : `${formatPercent(assessment.actual)} ejecutado; ritmo lineal esperado a ${period}: ${formatPercent(assessment.expected)}; diferencia ${difference.toLocaleString("es-AR", { maximumFractionDigits: 1 })} puntos porcentuales.`;
  return `${amountCell(values.approved, columnTotals.approved)}${amountCell(values.current, columnTotals.current)}${modificationCell(values.current - values.approved)}${amountCell(values.accrued, columnTotals.accrued)}${amountCell(values.available, columnTotals.available)}<td class="number"><span class="execution-pill execution-${assessment.status}" title="${escapeHtml(title)}">${formatPercent(assessment.actual)}</span></td>`;
}
function sortedGroups(entries) {
  const direction = tableSort.direction === "asc" ? 1 : -1;
  return [...entries].sort(([labelA, rowsA], [labelB, rowsB]) => {
    if (tableSort.key === "name" || tableSort.key === "breakdown") return labelA.localeCompare(labelB, "es") * direction;
    const valuesA = totals(rowsA), valuesB = totals(rowsB);
    const metric = tableSort.key === "execution" ? null : tableSort.key;
    const a = metric === "modification" ? valuesA.current - valuesA.approved : metric ? valuesA[metric] : executionPercent(valuesA.accrued, valuesA.current) ?? -Infinity;
    const b = metric === "modification" ? valuesB.current - valuesB.approved : metric ? valuesB[metric] : executionPercent(valuesB.accrued, valuesB.current) ?? -Infinity;
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
  const pageState = paginate(entries, expenseTablePage); expenseTablePage = pageState.page;
  $("#detail-table").innerHTML = pageState.items.map(([name, secretaryRows]) => {
    const open = expandedSecretaries.has(name), subdivisions = new Map();
    secretaryRows.forEach((row) => { const label = breakdown === "program" ? row.programa_nombre : breakdown === "source" ? row.fuente_financiamiento_nombre : row.objeto_gasto_nombre; const group = subdivisions.get(label) || []; group.push(row); subdivisions.set(label, group); });
    const subdivisionEntries = breakdown === "program" && tableSort.key === "name" ? [...subdivisions.entries()].sort((a, b) => totals(b[1]).accrued - totals(a[1]).accrued) : sortedGroups([...subdivisions.entries()]);
    const children = open ? subdivisionEntries.map(([label, group]) => `<tr class="breakdown-row"><td></td><td>${escapeHtml(label)}</td>${totalCells(totals(group), latestPeriod, columnTotals)}</tr>`).join("") : "";
    return `<tr class="secretary-total"><td><button class="expand-row" type="button" data-secretary="${escapeHtml(name)}" aria-expanded="${open}"><span aria-hidden="true">${open ? "▾" : "▸"}</span>${escapeHtml(name)}</button></td><td>Total de secretaría</td>${totalCells(totals(secretaryRows), latestPeriod, columnTotals)}</tr>${children}`;
  }).join("");
  renderPagination("#expense-pagination", pageState, "expenses", entries.length);
  const breakdownName = { program: "programa", source: "fuente de financiamiento", object: "objeto del gasto" }[breakdown];
  $("#table-note").textContent = latestPeriod ? `Totales de ${labelPeriod(latestPeriod)}. Los porcentajes entre paréntesis muestran la participación sobre el total visible de cada columna. Usá la flecha para ver el detalle por ${breakdownName}.` : "No hay partidas para mostrar.";
  updateSortHeaders();
}
function render() {
  const rows = filteredRows(), periodsSelected = selectedPeriodSequence(), latestPeriod = periodsSelected.at(-1), previousPeriod = periodsSelected.at(-2);
  const latestRows = rows.filter((row) => row.fecha_corte === latestPeriod);
  renderMetrics(latestRows, latestPeriod, previousPeriod); renderBudgetSize(latestRows, latestPeriod); renderRankings(latestRows, latestPeriod); renderChart(rows); renderTable(rows); renderInsights(rows, latestRows, latestPeriod); renderFinancingAnalysis();
}
function guideDirectoryEntries() {
  const latestPeriod = periods().at(-1), rows = data.filter((row) => row.fecha_corte === latestPeriod), groups = new Map();
  rows.forEach((row) => { const item = groups.get(row.jurisdiccion_codigo) || { code: row.jurisdiccion_codigo, name: row.jurisdiccion_nombre, programs: new Map() }; item.programs.set(row.programa_codigo, row.programa_nombre); groups.set(row.jurisdiccion_codigo, item); });
  return [...groups.values()].map((item) => ({ ...item, programs: [...item.programs.entries()].map(([code, name]) => ({ code, name })).sort((a, b) => a.code.localeCompare(b.code, "es", { numeric: true })) })).sort((a, b) => a.name.localeCompare(b.name, "es"));
}
function renderGuideDirectory() {
  const entries = guideDirectoryEntries(), pageState = paginate(entries, guideTablePage, 10); guideTablePage = pageState.page;
  $("#guide-directory-table").innerHTML = pageState.items.map((item) => { const open = guideExpandedSecretaries.has(item.code), programs = open ? `<tr class="guide-program-row"><td colspan="3"><ul class="guide-programs">${item.programs.map((program) => `<li><span class="guide-code">${escapeHtml(program.code)}</span>${escapeHtml(program.name)}</li>`).join("")}</ul></td></tr>` : ""; return `<tr class="guide-directory-row"><td><button class="expand-row" type="button" data-guide-secretary="${escapeHtml(item.code)}" aria-expanded="${open}"><span aria-hidden="true">${open ? "▾" : "▸"}</span>${escapeHtml(item.name)}</button></td><td><span class="guide-code">${escapeHtml(item.code)}</span></td><td>${item.programs.length.toLocaleString("es-AR")} programas</td></tr>${programs}`; }).join("");
  renderPagination("#guide-pagination", pageState, "guide", entries.length);
}
function financingLabel(code) { return ({ "110": "Tesoro Municipal", "131": "Origen municipal", "132": "Origen provincial", "133": "Origen nacional", "150": "Crédito interno" })[code] || code; }
function renderFinancingAnalysis() {
  if (financingCompositionChart) { financingCompositionChart.destroy(); financingCompositionChart = null; }
  if (financingExecutionChart) { financingExecutionChart.destroy(); financingExecutionChart = null; }
  const availablePeriods = unique(financingData.map((row) => row.fecha_corte)).filter((period) => selectedPeriods.has(period)).sort((a, b) => date({ fecha_corte: a }) - date({ fecha_corte: b })), latestPeriod = availablePeriods.at(-1);
  const rows = latestPeriod ? financingData.filter((row) => row.fecha_corte === latestPeriod) : [], compositionCanvas = $("#financing-composition-chart"), executionCanvas = $("#financing-execution-chart");
  if (!rows.length) { compositionCanvas.hidden = true; executionCanvas.hidden = true; $("#financing-composition-legend").innerHTML = '<li class="ranking-empty">No hay datos para los períodos seleccionados.</li>'; $("#financing-execution-note").textContent = "Seleccioná al menos un período disponible."; $("#financing-quality-note").textContent = ""; return; }
  const colors = { "110": "#1264a3", "131": "#008a81", "132": "#438dcc", "133": "#7b3fc6", "150": "#d59a13" }, totalCurrent = sum(rows, "credito_vigente_centavos");
  const items = rows.map((row) => ({ code: row.fuente_codigo, label: financingLabel(row.fuente_codigo), current: cents(row, "credito_vigente_centavos"), accrued: cents(row, "devengado_centavos"), color: colors[row.fuente_codigo] || "#8c99a9" })).sort((a, b) => b.current - a.current);
  $("#financing-context").textContent = `Composición y ejecución acumulada a ${labelPeriod(latestPeriod)} para el total de la Municipalidad.`;
  $("#financing-composition-legend").innerHTML = items.map((item) => `<li><i style="background:${item.color}"></i><span>${escapeHtml(item.label)}</span><span class="financing-amount">${formatCents(item.current)}</span><strong>${columnShare(item.current, totalCurrent)}</strong></li>`).join("");
  const expected = Number(latestPeriod.split("/")[1]) * 100 / 12, rates = items.map((item) => executionPercent(item.accrued, item.current) || 0);
  $("#financing-execution-note").textContent = `Referencia lineal a ${labelPeriod(latestPeriod)}: ${formatPercent(expected)}.`;
  $("#financing-quality-note").textContent = "Este panel responde al período seleccionado y muestra el total municipal. Los totales de crédito aprobado, vigente y devengado coinciden exactamente con los informes por objeto en los nueve meses cargados.";
  compositionCanvas.hidden = false; executionCanvas.hidden = false;
  if (typeof Chart === "undefined") return;
  financingCompositionChart = new Chart(compositionCanvas, { type: "doughnut", data: { labels: items.map((item) => item.label), datasets: [{ data: items.map((item) => item.current), backgroundColor: items.map((item) => item.color), borderColor: "#fff", borderWidth: 3, hoverOffset: 5 }] }, options: { responsive: true, maintainAspectRatio: false, cutout: "62%", plugins: { legend: { display: false }, tooltip: { callbacks: { label: (context) => `${context.label}: ${formatCents(context.parsed)} (${columnShare(context.parsed, totalCurrent)})` } } } } });
  const expectedLine = { id: "financingExpectedLine", afterDraw(chart, _args, options) { const scale = chart.scales.x, area = chart.chartArea, x = scale.getPixelForValue(options.value), drawing = chart.ctx; drawing.save(); drawing.strokeStyle = "#d59a13"; drawing.lineWidth = 2; drawing.setLineDash([6, 5]); drawing.beginPath(); drawing.moveTo(x, area.top); drawing.lineTo(x, area.bottom); drawing.stroke(); drawing.restore(); } };
  financingExecutionChart = new Chart(executionCanvas, { type: "bar", plugins: [expectedLine, financingBarLabelsPlugin], data: { labels: items.map((item) => item.label), datasets: [{ data: rates, backgroundColor: "#174f7c", borderColor: "#123e63", borderWidth: 1, borderRadius: 5, maxBarThickness: 36 }] }, options: { indexAxis: "y", responsive: true, maintainAspectRatio: false, layout: { padding: { right: 58 } }, plugins: { legend: { display: false }, financingExpectedLine: { value: expected }, tooltip: { callbacks: { label: (context) => `Ejecutado: ${formatPercent(context.parsed.x)}` } } }, scales: { x: { beginAtZero: true, max: Math.max(100, Math.ceil(Math.max(...rates) / 10) * 10), grid: { color: "#e2e7ed" }, ticks: { callback: (value) => `${value}%` } }, y: { grid: { display: false }, ticks: { color: "#46556d", font: { size: 11, weight: "600" } } } } } });
}
function resetFilters() {
  selectedPeriods = new Set(periods()); selectedPrograms.clear(); expandedSecretaries.clear(); expenseTablePage = 1; bridgeFocusPeriod = null; tableSort = { key: "name", direction: "asc" }; $("#jurisdiction-filter").value = ""; $("#source-filter").value = ""; $("#object-filter").value = "";
  document.querySelectorAll(".month-option[data-period]").forEach((chip) => { chip.classList.add("active"); chip.setAttribute("aria-pressed", "true"); });
  $("#toggle-periods").textContent = "Quitar todos"; renderProgramChips(); fillExpenseDependentFilters(); render();
}
function downloadConfig(view) {
  const configs = {
    expenses: { title: "Ejecución de gastos", context: "#summary-context", period: selectedPeriodSequence().at(-1), metrics: [["Crédito vigente", "#metric-current", "#metric-current-change"], ["Disponible", "#metric-available", "#metric-available-change"], ["% ejecutado", "#metric-execution", "#metric-execution-benchmark"]], charts: [{ id: "budget-size", label: "Composición del crédito vigente", description: "Magnitud del crédito por secretaría o programa.", canvas: "#budget-size-chart", title: () => "Composición del crédito vigente", compact: true }, { id: "ranking-execution", label: "Comparador de ejecución", description: "Tres mayores y tres menores porcentajes de ejecución.", canvas: "#ranking-execution-chart", title: () => "Ejecución. Top 3 más altos y más bajos." }, { id: "ranking-funding", label: "Comparador de financiamiento", description: "Tres mayores aumentos y tres mayores reducciones de crédito.", canvas: "#ranking-funding-chart", title: () => "Financiamiento. Top 3 financiados y desfinanciados" }, { id: "main", label: "Gráfico principal", description: "Puente presupuestario, crédito vigente o porcentaje ejecutado.", canvas: "#budget-chart", title: () => $("#chart-title").textContent }, { id: "financing-composition", label: "Composición por fuente", description: "Participación de cada fuente en el crédito vigente.", canvas: "#financing-composition-chart", title: () => "Participación en el crédito vigente", compact: true }, { id: "financing-execution", label: "Ejecución por fuente", description: "Porcentaje ejecutado de cada origen de fondos.", canvas: "#financing-execution-chart", title: () => "Porcentaje ejecutado por fuente" }, { id: "contribution", label: "Contribución a las modificaciones", description: "Rubros que explican los cambios del crédito.", canvas: "#contribution-chart", title: () => "Contribución a las modificaciones" }] },
    resources: { title: "Ejecución de recursos", context: "#resource-summary-context", period: [...resourceSelectedPeriods].sort((a, b) => date({ fecha_corte: a }) - date({ fecha_corte: b })).at(-1), metrics: [["Recurso vigente", "#resource-metric-current", "#resource-current-note"], ["Recurso percibido", "#resource-metric-perceived", "#resource-perceived-note"], ["% recaudado", "#resource-metric-rate", "#resource-rate-note"]], charts: [{ id: "main", label: "Gráfico principal", description: "Visualización activa de recaudación, ingresos, modificaciones o recurso vigente.", canvas: "#resource-chart", title: () => $("#resource-chart-title").textContent }, { id: "growth", label: "Ingresos del mes", description: "Rubros que explican la variación mensual.", canvas: "#resource-growth-chart", title: () => "Rubros que explican los ingresos del mes" }, { id: "origin", label: "Procedencia de los recursos", description: "Composición del recurso percibido.", canvas: "#resource-origin-chart", title: () => "Procedencia del recurso percibido", compact: true }, { id: "concentration", label: "Concentración de la recaudación", description: "Participación de las cinco categorías principales y otros conceptos.", canvas: "#resource-concentration-chart", title: () => "Principales conceptos recaudadores", compact: true }] },
    funds: { title: "Fondos Especiales", context: "#fund-summary-context", period: [...fundSelectedPeriods].sort((a, b) => date({ fecha_corte: a }) - date({ fecha_corte: b })).at(-1), metrics: [["Recurso vigente", "#fund-metric-current", "#fund-current-note"], ["Recurso percibido", "#fund-metric-perceived", "#fund-perceived-note"], ["Gasto comprometido", "#fund-metric-committed", "#fund-committed-note"], ["Gasto pagado", "#fund-metric-paid", "#fund-paid-note"], ["Percibido menos pagado", "#fund-metric-balance", "#fund-balance-note"]], charts: [{ id: "main", label: "Gráfico principal", description: "Visualización activa de flujo, acumulado u origen.", canvas: "#fund-chart", title: () => $("#fund-chart-title").textContent }, { id: "origin", label: "Participación por origen", description: "Composición de los recursos percibidos.", canvas: "#fund-origin-chart", title: () => "Participación por origen", compact: true }] },
  };
  return configs[view];
}
function canvasAvailable(selector) { const canvas = $(selector); return Boolean(canvas && !canvas.hidden && canvas.width && canvas.height); }
function openDownloadDialog(view) {
  activeDownloadView = view; const config = downloadConfig(view), dialog = $("#download-dialog");
  $("#download-dialog-title").textContent = `Crear resumen · ${config.title}`; $("#download-error").hidden = true;
  const chartOptions = config.charts.map((chart) => { const available = canvasAvailable(chart.canvas); return `<label><input type="checkbox" value="${chart.id}" ${available ? "" : "disabled"}><span>${escapeHtml(chart.label)}</span><small>${escapeHtml(available ? chart.description : "No disponible para la selección actual.")}</small></label>`; }).join("");
  $("#download-options").innerHTML = `<label><input type="checkbox" value="summary" checked><span>Tarjetas del resumen</span><small>Indicadores, período y filtros aplicados.</small></label>${chartOptions}`;
  dialog.showModal();
}
function wrapCanvasText(context, text, x, y, maxWidth, lineHeight, maxLines = 2) {
  const words = String(text || "").split(/\s+/); let line = "", lines = 0;
  for (const word of words) { const next = line ? `${line} ${word}` : word; if (context.measureText(next).width > maxWidth && line) { context.fillText(line, x, y + lines * lineHeight); lines += 1; line = word; if (lines === maxLines - 1) break; } else line = next; }
  if (line && lines < maxLines) context.fillText(line, x, y + lines * lineHeight, maxWidth);
}
function exportDashboardImage(view, selectedItems) {
  const config = downloadConfig(view), includeSummary = selectedItems.includes("summary"), charts = config.charts.filter((chart) => selectedItems.includes(chart.id) && canvasAvailable(chart.canvas)).map((chart) => ({ ...chart, exportHeight: chart.compact ? 330 : 455 }));
  const margin = 64, gap = 18, cardHeight = 150, summaryHeight = includeSummary ? 52 + Math.ceil(config.metrics.length / 3) * (cardHeight + gap) : 0, chartsHeight = charts.reduce((total, chart) => total + chart.exportHeight, 0);
  const exportWidth = 1200, exportHeight = 230 + summaryHeight + chartsHeight + 76, exportScale = 2, canvas = document.createElement("canvas"), context = canvas.getContext("2d"); canvas.width = exportWidth * exportScale; canvas.height = exportHeight * exportScale; context.scale(exportScale, exportScale); context.imageSmoothingEnabled = true; context.imageSmoothingQuality = "high";
  context.fillStyle = "#f3f6fa"; context.fillRect(0, 0, exportWidth, exportHeight); const gradient = context.createLinearGradient(0, 0, exportWidth, 0); gradient.addColorStop(0, "#0b365b"); gradient.addColorStop(1, "#1264a3"); context.fillStyle = gradient; context.fillRect(0, 0, exportWidth, 210);
  context.fillStyle = "#bfdef5"; context.font = "700 18px system-ui, sans-serif"; context.fillText("MUNICIPALIDAD DE SANTA FE", margin, 42); context.fillStyle = "#fff"; context.font = "700 40px system-ui, sans-serif"; context.fillText(config.title, margin, 92);
  context.fillStyle = "#d8e9f7"; context.font = "400 16px system-ui, sans-serif"; wrapCanvasText(context, $(config.context).textContent, margin, 128, exportWidth - margin * 2, 24, 3); context.font = "600 15px system-ui, sans-serif"; context.fillText(updatedLabel(config.period), margin, 188);
  let y = 238;
  if (includeSummary) { context.textAlign = "left"; context.fillStyle = "#15233b"; context.font = "700 24px system-ui, sans-serif"; context.fillText("Indicadores principales", margin, y + 24); y += 52; const cardWidth = (exportWidth - margin * 2 - gap * 2) / 3; config.metrics.forEach(([label, valueSelector, noteSelector], index) => { const col = index % 3, row = Math.floor(index / 3), x = margin + col * (cardWidth + gap), cardY = y + row * (cardHeight + gap), centerX = x + cardWidth / 2; context.fillStyle = "#fff"; context.beginPath(); context.roundRect(x, cardY, cardWidth, cardHeight, 14); context.fill(); context.textAlign = "center"; context.fillStyle = "#60708a"; context.font = "600 17px system-ui, sans-serif"; context.fillText(label, centerX, cardY + 36); context.fillStyle = "#15233b"; context.font = "700 27px system-ui, sans-serif"; context.fillText($(valueSelector).textContent, centerX, cardY + 82, cardWidth - 40); context.fillStyle = "#60708a"; context.font = "400 13px system-ui, sans-serif"; wrapCanvasText(context, $(noteSelector).textContent, centerX, cardY + 114, cardWidth - 40, 17, 2); }); y += Math.ceil(config.metrics.length / 3) * (cardHeight + gap); }
  charts.forEach((chart) => { const source = $(chart.canvas), chartHeight = chart.exportHeight, panelWidth = exportWidth - margin * 2; context.fillStyle = "#fff"; context.beginPath(); context.roundRect(margin, y, panelWidth, chartHeight - gap, 14); context.fill(); context.fillStyle = "#15233b"; context.font = "700 22px system-ui, sans-serif"; context.textAlign = "center"; context.fillText(chart.title(), exportWidth / 2, y + 38); const maxWidth = panelWidth - 48, maxHeight = chartHeight - 88, naturalWidth = source.clientWidth || source.width / 2, naturalHeight = source.clientHeight || source.height / 2, fit = Math.min(1, maxWidth / naturalWidth, maxHeight / naturalHeight), targetWidth = naturalWidth * fit, targetHeight = naturalHeight * fit, targetX = (exportWidth - targetWidth) / 2, targetY = y + 58 + (maxHeight - targetHeight) / 2; context.drawImage(source, targetX, targetY, targetWidth, targetHeight); y += chartHeight; });
  context.textAlign = "left"; context.fillStyle = "#60708a"; context.font = "400 14px system-ui, sans-serif"; context.fillText("Fuente: Portal de Transparencia de la Municipalidad de Santa Fe", margin, exportHeight - 32);
  canvas.toBlob((blob) => { if (!blob) return; const url = URL.createObjectURL(blob), anchor = document.createElement("a"), filePeriod = (config.period || "santa-fe").replaceAll("/", "-"); anchor.href = url; anchor.download = `presupuesto-${view}-${filePeriod}.png`; anchor.click(); URL.revokeObjectURL(url); }, "image/png");
}

function resourcePeriods() { return unique(resourceData.map((row) => row.fecha_corte)).sort((a, b) => date({ fecha_corte: a }) - date({ fecha_corte: b })); }
function resourceTotals(rows) {
  return {
    estimated: sum(rows, "recurso_estimado_centavos"), current: sum(rows, "recurso_vigente_centavos"), accrued: sum(rows, "recurso_devengado_centavos"),
    perceived: sum(rows, "recurso_percibido_centavos"), gap: sum(rows, "devengado_menos_percibido_centavos"),
  };
}
function collectionPercent(perceived, current) { return current > 0 ? perceived / current * 100 : null; }
function renderResourceOptionButtons() {
  const majorNames = unique(resourceData.map((row) => row.rubro_mayor_nombre));
  const detailRows = resourceSelectedMajors.size ? resourceData.filter((row) => resourceSelectedMajors.has(row.rubro_mayor_nombre)) : [];
  const detailNames = unique(detailRows.map((row) => row.rubro_nombre));
  resourceSelectedDetails = new Set([...resourceSelectedDetails].filter((name) => detailNames.includes(name)));
  const buttons = (names, selected, type) => names.length ? names.map((name) => `<button type="button" class="${selected.has(name) ? "active" : ""}" data-resource-filter="${type}" data-value="${escapeHtml(name)}" aria-pressed="${selected.has(name)}">${escapeHtml(name)}</button>`).join("") : '<span class="multi-chip-empty">No hay opciones para esta combinación.</span>';
  $("#resource-major-options").innerHTML = buttons(majorNames, resourceSelectedMajors, "major");
  const groupedDetails = new Map(); detailRows.forEach((row) => { const group = groupedDetails.get(row.rubro_mayor_nombre) || new Set(); group.add(row.rubro_nombre); groupedDetails.set(row.rubro_mayor_nombre, group); });
  $("#resource-detail-options").innerHTML = [...groupedDetails.entries()].sort(([a], [b]) => a.localeCompare(b, "es")).map(([major, details]) => { const names = [...details].sort((a, b) => a.localeCompare(b, "es")); return `<section class="resource-detail-group"><div class="resource-detail-group-heading"><h3>${escapeHtml(major)}</h3><span class="resource-detail-count">${names.length} ${names.length === 1 ? "detalle" : "detalles"}</span></div><div class="resource-detail-tags">${buttons(names, resourceSelectedDetails, "detail")}</div></section>`; }).join("") || '<span class="multi-chip-empty">Seleccioná un rubro para conocer sus detalles.</span>';
}
function fillResourceFilters() {
  resourceSelectedPeriods = new Set(resourcePeriods());
  const byYear = new Map();
  resourcePeriods().forEach((period) => { const year = period.split("/")[2]; byYear.set(year, [...(byYear.get(year) || []), period]); });
  $("#resource-period-filter").innerHTML = [...byYear.entries()].map(([year, yearPeriods]) => `<section class="period-year"><div class="period-year-heading"><strong>${year}</strong><button class="small-action" type="button" data-resource-year="${year}">Todo el año</button></div><div class="month-list">${yearPeriods.map((period) => `<button type="button" class="month-option active" data-resource-period="${period}" aria-pressed="true">${escapeHtml(labelPeriod(period).split(" ")[0])}</button>`).join("")}</div></section>`).join("");
  renderResourceOptionButtons();
}
function resourceFilteredRows(includeAllPeriods = false) {
  return resourceData.filter((row) => (includeAllPeriods || resourceSelectedPeriods.has(row.fecha_corte)) && (!resourceSelectedMajors.size || resourceSelectedMajors.has(row.rubro_mayor_nombre)) && (!resourceSelectedDetails.size || resourceSelectedDetails.has(row.rubro_nombre)));
}
function aggregateResourcePeriods(rows) {
  const grouped = new Map();
  rows.forEach((row) => { const values = grouped.get(row.fecha_corte) || { period: row.fecha_corte, estimated: 0, current: 0, accrued: 0, perceived: 0 }; values.estimated += cents(row, "recurso_estimado_centavos"); values.current += cents(row, "recurso_vigente_centavos"); values.accrued += cents(row, "recurso_devengado_centavos"); values.perceived += cents(row, "recurso_percibido_centavos"); grouped.set(row.fecha_corte, values); });
  return [...grouped.values()].sort((a, b) => date({ fecha_corte: a.period }) - date({ fecha_corte: b.period }));
}
function resourceContext(period) {
  const selection = (items, allLabel) => !items.size ? allLabel : items.size <= 2 ? [...items].join(" + ") : `${items.size} seleccionados`;
  return `Período: ${period ? labelPeriod(period) : "sin selección"} · Rubros: ${selection(resourceSelectedMajors, "Todos")} · Detalles: ${selection(resourceSelectedDetails, "Todos")}`;
}
function renderResourceMetrics(latestRows, previousRows, latestPeriod, previousPeriod) {
  const values = resourceTotals(latestRows), previous = previousRows ? resourceTotals(previousRows) : null, rate = collectionPercent(values.perceived, values.current), expected = latestPeriod ? Number(latestPeriod.split("/")[1]) * 100 / 12 : null;
  $("#resource-metric-current").textContent = formatCents(values.current); $("#resource-metric-perceived").textContent = formatCents(values.perceived); $("#resource-metric-rate").textContent = formatPercent(rate);
  const setNote = (selector, text, value) => { const element = $(selector); element.classList.remove("positive", "negative"); element.textContent = text; if (value !== null && value !== 0) element.classList.add(value > 0 ? "positive" : "negative"); };
  const modification = values.current - values.estimated;
  setNote("#resource-current-note", `Vs. recurso estimado: ${signedVariation(modification, values.estimated)}`, modification);
  const perceivedChange = previous ? values.perceived - previous.perceived : null;
  setNote("#resource-perceived-note", previousPeriod && perceivedChange !== null ? `Ingresado desde ${labelPeriod(previousPeriod)}: ${signedVariation(perceivedChange, previous.perceived)}` : "Sin período previo seleccionado", perceivedChange);
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
function renderResourceChartReading(values) {
  const latest = values.at(-1), previous = values.at(-2), title = $("#resource-reading-title"), value = $("#resource-reading-value"), text = $("#resource-reading-text"), context = $("#resource-reading-context");
  if (!latest) { title.textContent = "Sin información disponible"; value.textContent = "—"; text.textContent = "Modificá los filtros o seleccioná al menos un período."; context.textContent = ""; return; }
  if (resourceActiveChart === "collection") {
    const difference = latest.rate === null ? null : latest.rate - latest.expected;
    title.textContent = "Nivel de recaudación"; value.textContent = formatPercent(latest.rate); text.textContent = difference === null ? "No hay recurso vigente para calcular el porcentaje." : `El ritmo lineal esperado a esta altura del año es ${formatPercent(latest.expected)}. La selección está ${Math.abs(difference).toLocaleString("es-AR", { maximumFractionDigits: 1 })} puntos ${difference >= 0 ? "por encima" : "por debajo"} de esa referencia.`;
  } else if (resourceActiveChart === "income") {
    const change = previous ? latest.monthlyPerceived - previous.monthlyPerceived : null;
    title.textContent = "Ingresos del último mes"; value.textContent = formatCents(latest.monthlyPerceived); text.textContent = change === null ? "Es el ingreso registrado desde el cierre anterior." : `Frente al movimiento del mes anterior, representa ${signedVariation(change, previous.monthlyPerceived)}.`;
  } else if (resourceActiveChart === "modification") {
    title.textContent = "Última modificación"; value.textContent = `${latest.monthlyModification >= 0 ? "+" : "−"}${formatCents(Math.abs(latest.monthlyModification))}`; text.textContent = `El cambio acumulado entre el recurso vigente y el estimado es ${latest.modification >= 0 ? "+" : "−"}${formatCents(Math.abs(latest.modification))}.`;
  } else {
    const change = previous ? latest.current - previous.current : latest.current - latest.estimated;
    title.textContent = "Recurso vigente actual"; value.textContent = formatCents(latest.current); text.textContent = `${previous ? `Frente a ${labelPeriod(previous.period)}` : "Frente al recurso estimado"}, la variación es ${signedVariation(change, previous?.current || latest.estimated)}.`;
  }
  value.classList.toggle("negative", resourceActiveChart === "income" ? latest.monthlyPerceived < 0 : resourceActiveChart === "modification" ? latest.monthlyModification < 0 : false);
  context.textContent = resourceContext(latest.period);
}
function renderResourceChart(rows) {
  const selected = aggregateResourcePeriods(rows), all = aggregateResourcePeriods(resourceFilteredRows(true)), allIndex = new Map(all.map((value, index) => [value.period, index])), canvas = $("#resource-chart"), empty = $("#resource-chart-empty");
  if (resourceChart) { resourceChart.destroy(); resourceChart = null; }
  empty.hidden = Boolean(selected.length); canvas.hidden = !selected.length;
  if (!selected.length) { empty.textContent = "No hay datos para esta selección."; renderResourceChartReading([]); return; }
  const values = selected.map((value) => { const index = allIndex.get(value.period), previous = index > 0 ? all[index - 1] : null; return { ...value, rate: collectionPercent(value.perceived, value.current), accruedRate: collectionPercent(value.accrued, value.current), expected: Number(value.period.split("/")[1]) * 100 / 12, monthlyPerceived: value.perceived - (previous?.perceived || 0), modification: value.current - value.estimated, monthlyModification: (value.current - value.estimated) - (previous ? previous.current - previous.estimated : 0) }; });
  renderResourceChartReading(values);
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
      { label: "Percibido del mes", data: values.map((value) => value.monthlyPerceived), backgroundColor: "rgba(0, 138, 129, .82)", borderRadius: 5, maxBarThickness: 64 },
    ]; y = { beginAtZero: true, ticks: { callback: formatAxisAmount } }; tooltipFormatter = (context) => `${context.dataset.label}: ${context.parsed.y >= 0 ? "+" : ""}${formatCents(context.parsed.y)}`;
    $("#resource-chart-title").textContent = "Ingresos percibidos en cada mes"; $("#resource-chart-legend").innerHTML = '<span class="legend-resource-perceived"></span>Percibido mensual'; $("#resource-chart-note").textContent = "Cada barra muestra el dinero ingresado desde el cierre anterior, no el importe acumulado del informe.";
  } else if (resourceActiveChart === "modification") {
    type = "bar"; const largest = Math.max(...values.flatMap((value) => [Math.abs(value.monthlyModification), Math.abs(value.modification)]), 1), step = niceStep(largest / 3), limit = Math.ceil(largest / step) * step;
    datasets = [
      { type: "bar", label: "Cambio mensual", data: values.map((value) => value.monthlyModification), backgroundColor: values.map((value) => value.monthlyModification >= 0 ? "#26905f" : "#c74c56"), borderRadius: 5, order: 1 },
      { type: "line", label: "Modificación acumulada", data: values.map((value) => value.modification), borderColor: "rgba(18, 100, 163, .55)", backgroundColor: "rgba(18, 100, 163, .55)", borderWidth: 2, pointRadius: 3, tension: .25, order: 2 },
    ]; y = { min: -limit, max: limit, ticks: { stepSize: step, callback: formatAxisAmount } }; tooltipFormatter = (context) => `${context.dataset.label}: ${context.parsed.y >= 0 ? "+" : ""}${formatCents(context.parsed.y)}`;
    $("#resource-chart-title").textContent = "Cambios en la estimación de recursos"; $("#resource-chart-legend").innerHTML = '<span class="legend-positive"></span>Aumento mensual <span class="legend-negative"></span>Reducción mensual <span class="legend-cumulative"></span>Acumulado'; $("#resource-chart-note").textContent = "Cada barra compara la modificación acumulada con el mes anterior; la línea muestra la diferencia total entre vigente y estimado.";
  } else {
    type = "bar"; datasets = [{ label: "Recurso vigente", data: values.map((value) => value.current), backgroundColor: "#174f7c", borderRadius: 6, maxBarThickness: 64 }]; y = { beginAtZero: true, ticks: { callback: formatAxisAmount } }; tooltipFormatter = (context) => `Recurso vigente: ${formatCents(context.parsed.y)}`;
    $("#resource-chart-title").textContent = "Evolución del recurso vigente"; $("#resource-chart-legend").innerHTML = '<span class="legend-current"></span>Recurso vigente de cada cierre'; $("#resource-chart-note").textContent = "Cada barra muestra la estimación vigente acumulada informada al cierre de ese mes.";
  }
  if (typeof Chart === "undefined") { canvas.hidden = true; empty.hidden = false; empty.textContent = "No se pudo cargar la biblioteca de gráficos."; return; }
  resourceChart = new Chart(canvas, { type, data: { labels: values.map((value) => labelPeriod(value.period)), datasets }, plugins: [mainBarValueLabelsPlugin], options: { responsive: true, maintainAspectRatio: false, interaction: { mode: "index", intersect: false }, layout: { padding: { top: resourceShowValues && type === "bar" ? 20 : 4, bottom: resourceShowValues && type === "bar" ? 16 : 0 } }, plugins: { legend: { display: false }, mainBarValueLabels: { display: resourceShowValues && type === "bar" }, tooltip: { backgroundColor: "#fff", titleColor: "#15233b", bodyColor: "#46556d", borderColor: "#c7d5e2", borderWidth: 1, padding: 12, callbacks: { label: tooltipFormatter } } }, scales: { x: { grid: { display: false }, border: { display: false } }, y: { ...y, border: { display: false }, grid: { color: (context) => context.tick.value === 0 ? "#526176" : "#dce3eb", lineWidth: (context) => context.tick.value === 0 ? 2 : 1 }, ticks: { ...y.ticks, color: "#60708a", padding: 10 } } } } });
}
function resourceAmountCell(value, total) { return `<td class="number">${formatCents(value)}<small class="cell-share">(${columnShare(value, total)} del total)</small></td>`; }
function renderResourceTable(rows, latestPeriod) {
  const latestRows = rows.filter((row) => row.fecha_corte === latestPeriod), overall = resourceTotals(latestRows), groups = new Map();
  latestRows.forEach((row) => { const key = row.rubro_mayor_nombre, group = groups.get(key) || []; group.push(row); groups.set(key, group); });
  const ordered = [...groups.entries()].sort((a, b) => resourceTotals(b[1]).perceived - resourceTotals(a[1]).perceived);
  const pageState = paginate(ordered, resourceTablePage); resourceTablePage = pageState.page;
  $("#resource-detail-table").innerHTML = pageState.items.map(([label, group]) => {
    const open = resourceExpandedMajors.has(label), values = resourceTotals(group), rate = collectionPercent(values.perceived, values.current);
    const children = open ? [...group].sort((a, b) => cents(b, "recurso_percibido_centavos") - cents(a, "recurso_percibido_centavos")).map((row) => { const child = resourceTotals([row]), childRate = collectionPercent(child.perceived, child.current), origin = row.procedencia_nombre || "Sin procedencia informada"; return `<tr class="breakdown-row"><td></td><td><strong>${escapeHtml(row.rubro_nombre)}</strong><small>${escapeHtml(origin)}</small></td>${resourceAmountCell(child.estimated, overall.estimated)}${resourceAmountCell(child.current, overall.current)}${resourceAmountCell(child.accrued, overall.accrued)}${resourceAmountCell(child.perceived, overall.perceived)}<td class="number"><span class="execution-pill execution-${executionAssessment({ accrued: child.perceived, current: child.current }, latestPeriod).status}">${formatPercent(childRate)}</span></td></tr>`; }).join("") : "";
    return `<tr class="secretary-total"><td><button class="expand-row resource-expand-row" type="button" data-resource-major="${escapeHtml(label)}" aria-expanded="${open}"><span>${open ? "▾" : "▸"}</span>${escapeHtml(label)}</button></td><td>Total del rubro</td>${resourceAmountCell(values.estimated, overall.estimated)}${resourceAmountCell(values.current, overall.current)}${resourceAmountCell(values.accrued, overall.accrued)}${resourceAmountCell(values.perceived, overall.perceived)}<td class="number"><span class="execution-pill execution-${executionAssessment({ accrued: values.perceived, current: values.current }, latestPeriod).status}">${formatPercent(rate)}</span></td></tr>${children}`;
  }).join("");
  renderPagination("#resource-pagination", pageState, "resources", ordered.length);
  $("#resource-table-note").textContent = latestPeriod ? `Valores acumulados a ${labelPeriod(latestPeriod)}. Los porcentajes entre paréntesis muestran la participación de cada rubro o concepto sobre el total visible de la columna.` : "No hay datos para mostrar.";
}
function resourceMajorLabel(row) { return row.rubro_mayor_nombre; }
function resourceOriginCategory(row) {
  const value = row.procedencia_nombre.toLocaleLowerCase("es");
  if (value.includes("municipal")) return "Origen municipal";
  if (value.includes("provincial")) return "Origen provincial";
  if (value.includes("nacional")) return "Origen nacional";
  if (value.includes("otros")) return "Otros orígenes";
  return "Sin procedencia consignada";
}
function resourceRankingHtml(items, valueRenderer, emptyMessage) {
  if (!items.length) return `<li class="ranking-empty">${escapeHtml(emptyMessage)}</li>`;
  return items.map((item, index) => `<li><span class="ranking-position">${index + 1}</span><div><strong title="${escapeHtml(item.label)}">${escapeHtml(item.label)}</strong><small>${valueRenderer(item)}</small></div></li>`).join("");
}
function renderResourceGrowth(latestRows, previousRows, latestPeriod, previousPeriod, renderGraph) {
  if (resourceGrowthChart) { resourceGrowthChart.destroy(); resourceGrowthChart = null; }
  const note = $("#resource-growth-note"), canvas = $("#resource-growth-chart");
  if (!latestPeriod || !previousPeriod || !previousRows) { note.textContent = "Seleccioná al menos dos períodos para calcular el ingreso del mes."; canvas.hidden = true; return; }
  const labelForRow = resourceGrowthDimension === "detail" ? (row) => row.rubro_nombre : resourceMajorLabel;
  const aggregate = (rows) => { const groups = new Map(); rows.forEach((row) => groups.set(labelForRow(row), (groups.get(labelForRow(row)) || 0) + cents(row, "recurso_percibido_centavos"))); return groups; };
  const current = aggregate(latestRows), previous = aggregate(previousRows), labels = new Set([...current.keys(), ...previous.keys()]);
  const allItems = [...labels].map((label) => ({ label, value: (current.get(label) || 0) - (previous.get(label) || 0) })).filter((item) => item.value !== 0).sort((a, b) => b.value - a.value), monthlyTotal = allItems.reduce((total, item) => total + item.value, 0);
  const items = allItems.slice(0, 8).map((item) => ({ ...item, share: monthlyTotal ? item.value / monthlyTotal * 100 : null }));
  note.textContent = `Variación del recurso percibido por ${resourceGrowthDimension === "detail" ? "detalle" : "rubro"} entre ${labelPeriod(previousPeriod)} y ${labelPeriod(latestPeriod)}. Los montos se expresan en miles de millones de pesos.`;
  canvas.hidden = !items.length;
  if (!renderGraph || !items.length || typeof Chart === "undefined") return;
  resourceGrowthChart = new Chart(canvas, { type: "bar", data: { labels: items.map((item) => item.label), datasets: [{ data: items.map((item) => item.value), shares: items.map((item) => item.share), backgroundColor: items.map((item) => item.value >= 0 ? "#26905f" : "#c74c56"), borderRadius: 4 }] }, plugins: [resourceGrowthLabelsPlugin], options: { indexAxis: "y", responsive: true, maintainAspectRatio: false, layout: { padding: { right: 125, left: 10 } }, plugins: { legend: { display: false }, tooltip: { callbacks: { label: (context) => `${context.parsed.x >= 0 ? "+" : ""}${formatCents(context.parsed.x)} (${formatPercent(items[context.dataIndex].share)})` } } }, scales: { x: { grid: { color: (context) => context.tick.value === 0 ? "#526176" : "#e3e8ef" }, ticks: { display: false }, border: { display: false } }, y: { grid: { display: false }, ticks: { font: { size: 10 }, callback(value) { const label = this.getLabelForValue(value); return label.length > 30 ? `${label.slice(0, 29)}…` : label; } } } } } });
}
function renderResourceOrigins(latestRows, renderGraph) {
  if (resourceOriginChart) { resourceOriginChart.destroy(); resourceOriginChart = null; }
  const groups = new Map(); latestRows.forEach((row) => groups.set(resourceOriginCategory(row), (groups.get(resourceOriginCategory(row)) || 0) + cents(row, "recurso_percibido_centavos")));
  const colors = { "Origen municipal": "#008a81", "Origen provincial": "#438dcc", "Origen nacional": "#7b3fc6", "Otros orígenes": "#e0a71b", "Sin procedencia consignada": "#9aa7b7" };
  const items = [...groups.entries()].map(([label, value]) => ({ label, value, color: colors[label] })).filter((item) => item.value !== 0).sort((a, b) => b.value - a.value), total = items.reduce((sumValue, item) => sumValue + item.value, 0);
  $("#resource-origin-legend").innerHTML = items.length ? items.map((item) => `<li><i style="background:${item.color}"></i><span>${escapeHtml(item.label)}</span><strong>${columnShare(item.value, total)}</strong><small>${formatCents(item.value)}</small></li>`).join("") : '<li class="ranking-empty">Sin recursos percibidos para esta selección.</li>';
  const canvas = $("#resource-origin-chart"); canvas.hidden = !items.length;
  if (!renderGraph || !items.length || typeof Chart === "undefined") return;
  resourceOriginChart = new Chart(canvas, { type: "doughnut", data: { labels: items.map((item) => item.label), datasets: [{ data: items.map((item) => item.value), backgroundColor: items.map((item) => item.color), borderColor: "#fff", borderWidth: 3, hoverOffset: 5 }] }, options: { responsive: true, maintainAspectRatio: false, cutout: "66%", plugins: { legend: { display: false }, tooltip: { callbacks: { label: (context) => `${context.label}: ${formatCents(context.parsed)} (${columnShare(context.parsed, total)})` } } } } });
}
function renderResourcePace(latestRows, latestPeriod) {
  const expected = latestPeriod ? Number(latestPeriod.split("/")[1]) * 100 / 12 : null, groups = new Map();
  latestRows.forEach((row) => { const label = resourceMajorLabel(row), group = groups.get(label) || []; group.push(row); groups.set(label, group); });
  const items = [...groups.entries()].map(([label, rows]) => { const values = resourceTotals(rows), rate = collectionPercent(values.perceived, values.current); return { label, rate, difference: rate === null || expected === null ? null : rate - expected }; }).filter((item) => item.difference !== null);
  const behind = items.filter((item) => item.difference < 0).sort((a, b) => a.difference - b.difference).slice(0, 5), ahead = items.filter((item) => item.difference >= 0).sort((a, b) => b.difference - a.difference).slice(0, 5);
  $("#resource-pace-note").textContent = expected === null ? "Sin período seleccionado." : `Ritmo lineal de referencia a ${labelPeriod(latestPeriod)}: ${formatPercent(expected)} del recurso vigente.`;
  const renderer = (item) => `${formatPercent(item.rate)} · ${item.difference >= 0 ? "+" : "−"}${Math.abs(item.difference).toLocaleString("es-AR", { maximumFractionDigits: 1 })} p.p.`;
  $("#resource-pace-behind").innerHTML = resourceRankingHtml(behind, renderer, "No hay rubros por debajo del ritmo."); $("#resource-pace-ahead").innerHTML = resourceRankingHtml(ahead, renderer, "No hay rubros por encima del ritmo.");
}
function renderResourceConcentration(latestRows, renderGraph) {
  if (resourceConcentrationChart) { resourceConcentrationChart.destroy(); resourceConcentrationChart = null; }
  const groups = new Map(); latestRows.forEach((row) => groups.set(row.rubro_nombre, (groups.get(row.rubro_nombre) || 0) + cents(row, "recurso_percibido_centavos")));
  const ranked = [...groups.entries()].map(([label, value]) => ({ label, value })).filter((item) => item.value > 0).sort((a, b) => b.value - a.value), total = ranked.reduce((sumValue, item) => sumValue + item.value, 0), top = ranked.slice(0, 5), otherValue = ranked.slice(5).reduce((sumValue, item) => sumValue + item.value, 0);
  const colors = ["#1264a3", "#008a81", "#7b3fc6", "#e0a71b", "#c45059", "#9aa7b7"], items = [...top, ...(otherValue > 0 ? [{ label: "Otros", value: otherValue }] : [])].map((item, index) => ({ ...item, share: total ? item.value / total * 100 : 0, color: colors[index] })), topShare = total ? top.reduce((sumValue, item) => sumValue + item.value, 0) / total * 100 : null;
  $("#resource-concentration-note").textContent = topShare === null ? "No hay recursos percibidos para esta selección." : `Las 5 categorías principales explican el ${formatPercent(topShare)} de lo recaudado.`;
  const canvas = $("#resource-concentration-chart"); canvas.hidden = !items.length;
  if (!renderGraph || !items.length || typeof Chart === "undefined") return;
  resourceConcentrationChart = new Chart(canvas, { type: "bar", data: { labels: ["Composición"], datasets: items.map((item) => ({ label: item.label, data: [item.share], rawValue: item.value, backgroundColor: item.color, borderColor: "#fff", borderWidth: 1, borderRadius: 3, barThickness: 40 })) }, options: { indexAxis: "y", responsive: true, maintainAspectRatio: false, interaction: { mode: "nearest", intersect: true }, plugins: { legend: { position: "bottom", labels: { boxWidth: 10, boxHeight: 10, padding: 12, color: "#46556d", font: { size: 10 } } }, tooltip: { backgroundColor: "#fff", titleColor: "#15233b", bodyColor: "#46556d", borderColor: "#c7d5e2", borderWidth: 1, padding: 11, callbacks: { label: (context) => `${context.dataset.label}: ${formatCents(context.dataset.rawValue)} (${formatPercent(context.parsed.x)})` } } }, scales: { x: { stacked: true, min: 0, max: 100, grid: { color: "#e4e9ef" }, ticks: { callback: (value) => `${value}%` } }, y: { stacked: true, display: false } } } });
}
function renderResourceInsights(latestRows, previousRows, latestPeriod, previousPeriod, renderGraph) { renderResourceGrowth(latestRows, previousRows, latestPeriod, previousPeriod, renderGraph); renderResourceOrigins(latestRows, renderGraph); renderResourcePace(latestRows, latestPeriod); renderResourceConcentration(latestRows, renderGraph); }
function renderResources(renderGraph = true) {
  const rows = resourceFilteredRows(), selected = [...resourceSelectedPeriods].sort((a, b) => date({ fecha_corte: a }) - date({ fecha_corte: b })), latestPeriod = selected.at(-1), previousPeriod = selected.at(-2), latestRows = rows.filter((row) => row.fecha_corte === latestPeriod), previousRows = previousPeriod ? rows.filter((row) => row.fecha_corte === previousPeriod) : null;
  renderResourceMetrics(latestRows, previousRows, latestPeriod, previousPeriod); renderResourceQuality(); renderResourceTable(rows, latestPeriod); renderResourceInsights(latestRows, previousRows, latestPeriod, previousPeriod, renderGraph); if (renderGraph) renderResourceChart(rows);
}
function resetResourceFilters() {
  resourceSelectedPeriods = new Set(resourcePeriods()); resourceSelectedMajors.clear(); resourceSelectedDetails.clear(); resourceExpandedMajors.clear(); resourceTablePage = 1; renderResourceOptionButtons();
  document.querySelectorAll("[data-resource-period]").forEach((button) => { button.classList.add("active"); button.setAttribute("aria-pressed", "true"); }); $("#resource-toggle-periods").textContent = "Quitar todos"; renderResources();
}
function fundPeriods() { return unique(fundData.map((row) => row.fecha_corte)).sort((a, b) => date({ fecha_corte: a }) - date({ fecha_corte: b })); }
function canonicalFundName(code) { return fundData.filter((row) => row.fondo_codigo === code).map((row) => row.fondo_nombre).sort((a, b) => b.length - a.length)[0] || code; }
function fundTotals(rows) {
  return {
    current: sum(rows, "recurso_vigente_centavos"), resourceAccrued: sum(rows, "recurso_devengado_centavos"), perceived: sum(rows, "recurso_percibido_centavos"),
    committed: sum(rows, "gasto_compromiso_centavos"), expenseAccrued: sum(rows, "gasto_devengado_centavos"), paid: sum(rows, "gasto_pagado_centavos"), unpaid: sum(rows, "gasto_devengado_no_pagado_centavos"),
  };
}
function fillFundNameFilter() {
  const originCode = $("#fund-origin-filter").value, previous = $("#fund-name-filter").value;
  const codes = originCode ? unique(fundData.filter((row) => row.origen_codigo === originCode).map((row) => row.fondo_codigo)) : [];
  const options = codes.map((code) => ({ value: code, label: canonicalFundName(code) })); populateSelectOptions("#fund-name-filter", options, originCode ? "Todos los fondos" : "Seleccioná un nivel primero"); if (options.some((option) => option.value === previous)) $("#fund-name-filter").value = previous; setFilterEnabled("#fund-name-filter", Boolean(originCode));
}
function fillFundFilters() {
  fundSelectedPeriods = new Set(fundPeriods()); const byYear = new Map();
  fundPeriods().forEach((period) => { const year = period.split("/")[2]; byYear.set(year, [...(byYear.get(year) || []), period]); });
  $("#fund-period-filter").innerHTML = [...byYear.entries()].map(([year, yearPeriods]) => `<section class="period-year"><div class="period-year-heading"><strong>${year}</strong><button class="small-action" type="button" data-fund-year="${year}">Todo el año</button></div><div class="month-list">${yearPeriods.map((period) => `<button type="button" class="month-option active" data-fund-period="${period}" aria-pressed="true">${escapeHtml(labelPeriod(period).split(" ")[0])}</button>`).join("")}</div></section>`).join("");
  const origins = unique(fundData.map((row) => row.origen_codigo)).map((code) => { const row = fundData.find((item) => item.origen_codigo === code); return { value: code, label: row.origen_nombre }; }); populateSelectOptions("#fund-origin-filter", origins, "Todos los niveles"); fillFundNameFilter();
}
function fundFilteredRows(includeAllPeriods = false) {
  const originCode = $("#fund-origin-filter").value, fundCode = $("#fund-name-filter").value;
  return fundData.filter((row) => (includeAllPeriods || fundSelectedPeriods.has(row.fecha_corte)) && (!originCode || row.origen_codigo === originCode) && (!fundCode || row.fondo_codigo === fundCode));
}
function aggregateFundPeriods(rows) {
  const grouped = new Map(); rows.forEach((row) => { const values = grouped.get(row.fecha_corte) || { period: row.fecha_corte, current: 0, perceived: 0, committed: 0, expenseAccrued: 0, paid: 0 }; values.current += cents(row, "recurso_vigente_centavos"); values.perceived += cents(row, "recurso_percibido_centavos"); values.committed += cents(row, "gasto_compromiso_centavos"); values.expenseAccrued += cents(row, "gasto_devengado_centavos"); values.paid += cents(row, "gasto_pagado_centavos"); grouped.set(row.fecha_corte, values); });
  return [...grouped.values()].sort((a, b) => date({ fecha_corte: a.period }) - date({ fecha_corte: b.period }));
}
function fundContext(period) { return `Período: ${period ? labelPeriod(period) : "sin selección"} · Nivel: ${selectedOptionText("#fund-origin-filter", "Todos")} · Fondo: ${selectedOptionText("#fund-name-filter", "Todos")}`; }
function renderFundMetrics(latestRows, previousRows, latestPeriod, previousPeriod) {
  const values = fundTotals(latestRows), previous = previousRows ? fundTotals(previousRows) : null, balance = values.perceived - values.paid;
  $("#fund-metric-current").textContent = formatCents(values.current); $("#fund-metric-perceived").textContent = formatCents(values.perceived); $("#fund-metric-committed").textContent = formatCents(values.committed); $("#fund-metric-paid").textContent = formatCents(values.paid); $("#fund-metric-balance").textContent = formatCents(balance);
  const setNote = (selector, text, value) => { const element = $(selector); element.classList.remove("positive", "negative"); element.textContent = text; if (value !== null && value !== 0) element.classList.add(value > 0 ? "positive" : "negative"); };
  setNote("#fund-current-note", `${latestRows.length.toLocaleString("es-AR")} fondos en la selección`, null);
  const perceivedChange = previous ? values.perceived - previous.perceived : null, committedChange = previous ? values.committed - previous.committed : null, paidChange = previous ? values.paid - previous.paid : null;
  setNote("#fund-perceived-note", previousPeriod ? `Ingresado desde ${labelPeriod(previousPeriod)}: ${perceivedChange >= 0 ? "+" : "−"}${formatCents(Math.abs(perceivedChange))}` : "Sin período previo seleccionado", perceivedChange);
  setNote("#fund-committed-note", previousPeriod ? `Variación vs. ${labelPeriod(previousPeriod)}: ${committedChange >= 0 ? "+" : "−"}${formatCents(Math.abs(committedChange))}` : "Sin período previo seleccionado", committedChange);
  setNote("#fund-paid-note", previousPeriod ? `Pagado desde ${labelPeriod(previousPeriod)}: ${paidChange >= 0 ? "+" : "−"}${formatCents(Math.abs(paidChange))}` : "Sin período previo seleccionado", paidChange);
  setNote("#fund-balance-note", balance >= 0 ? "Ingresos percibidos por encima de los pagos" : "Los pagos utilizaron ingresos o saldos previos", balance);
  $("#fund-summary-context").textContent = fundContext(latestPeriod);
}
function renderFundChart(rows) {
  const selected = aggregateFundPeriods(rows), all = aggregateFundPeriods(fundFilteredRows(true)), allIndex = new Map(all.map((value, index) => [value.period, index])), canvas = $("#fund-chart"), empty = $("#fund-chart-empty");
  if (fundChart) { fundChart.destroy(); fundChart = null; } empty.hidden = Boolean(selected.length); canvas.hidden = !selected.length;
  if (!selected.length) { empty.textContent = "No hay datos para esta selección."; return; } if (typeof Chart === "undefined") { canvas.hidden = true; empty.hidden = false; empty.textContent = "No se pudo cargar la biblioteca de gráficos."; return; }
  const values = selected.map((value) => { const index = allIndex.get(value.period), previous = index > 0 ? all[index - 1] : null; return { ...value, monthlyPerceived: value.perceived - (previous?.perceived || 0), monthlyPaid: value.paid - (previous?.paid || 0) }; });
  let type = "bar", labels = values.map((value) => labelPeriod(value.period)), datasets, y = { beginAtZero: true, ticks: { callback: formatAxisAmount } }, tooltipIndex = "y";
  if (fundActiveChart === "flow") {
    datasets = [{ label: "Ingresos percibidos del mes", data: values.map((value) => value.monthlyPerceived), backgroundColor: "rgba(0, 138, 129, .82)", borderRadius: 5 }, { label: "Pagos del mes", data: values.map((value) => value.monthlyPaid), backgroundColor: "rgba(196, 80, 89, .75)", borderRadius: 5 }];
    $("#fund-chart-title").textContent = "Ingresos y pagos de cada mes"; $("#fund-chart-legend").innerHTML = '<span class="legend-fund-income"></span>Ingresos <span class="legend-fund-paid"></span>Pagos'; $("#fund-chart-note").textContent = "Las barras muestran movimientos frente al cierre anterior, no saldos acumulados.";
  } else if (fundActiveChart === "cumulative") {
    type = "line"; datasets = [{ label: "Recurso percibido", data: values.map((value) => value.perceived), borderColor: "#008a81", backgroundColor: "#008a81", borderWidth: 3, pointRadius: 4, tension: .25 }, { label: "Gasto pagado", data: values.map((value) => value.paid), borderColor: "#c45059", backgroundColor: "#c45059", borderWidth: 3, pointRadius: 4, tension: .25 }, { label: "Gasto comprometido", data: values.map((value) => value.committed), borderColor: "#d59a13", backgroundColor: "#d59a13", borderWidth: 2, borderDash: [7, 6], pointRadius: 3, tension: .2 }];
    $("#fund-chart-title").textContent = "Recursos y gastos acumulados"; $("#fund-chart-legend").innerHTML = '<span class="legend-fund-income"></span>Percibido <span class="legend-fund-paid"></span>Pagado <span class="legend-fund-committed"></span>Comprometido'; $("#fund-chart-note").textContent = "Permite comparar el ingreso acumulado con las obligaciones asumidas y los pagos realizados.";
  } else {
    const latestPeriod = values.at(-1).period, latestRows = rows.filter((row) => row.fecha_corte === latestPeriod), groups = new Map(); latestRows.forEach((row) => { const group = groups.get(row.origen_nombre) || []; group.push(row); groups.set(row.origen_nombre, group); }); const items = [...groups.entries()].map(([label, group]) => ({ label, values: fundTotals(group) }));
    labels = items.map((item) => item.label); datasets = [{ label: "Recurso percibido", data: items.map((item) => item.values.perceived), backgroundColor: "rgba(0, 138, 129, .82)", borderRadius: 5 }, { label: "Gasto pagado", data: items.map((item) => item.values.paid), backgroundColor: "rgba(196, 80, 89, .75)", borderRadius: 5 }];
    $("#fund-chart-title").textContent = "Recursos y pagos por origen"; $("#fund-chart-legend").innerHTML = '<span class="legend-fund-income"></span>Percibido <span class="legend-fund-paid"></span>Pagado'; $("#fund-chart-note").textContent = `Comparación acumulada a ${labelPeriod(latestPeriod)} entre los niveles visibles.`;
  }
  fundChart = new Chart(canvas, { type, data: { labels, datasets }, plugins: [mainBarValueLabelsPlugin], options: { responsive: true, maintainAspectRatio: false, interaction: { mode: "index", intersect: false }, layout: { padding: { top: fundShowValues && type === "bar" ? 20 : 4, bottom: fundShowValues && type === "bar" ? 16 : 0 } }, plugins: { legend: { display: false }, mainBarValueLabels: { display: fundShowValues && type === "bar" }, tooltip: { backgroundColor: "#fff", titleColor: "#15233b", bodyColor: "#46556d", borderColor: "#c7d5e2", borderWidth: 1, padding: 12, callbacks: { label: (context) => `${context.dataset.label}: ${formatCents(tooltipIndex === "y" ? context.parsed.y : context.parsed.x)}` } } }, scales: { x: { grid: { display: false }, border: { display: false } }, y: { ...y, border: { display: false }, grid: { color: (context) => context.tick.value === 0 ? "#526176" : "#dce3eb" }, ticks: { ...y.ticks, color: "#60708a", padding: 10 } } } } });
}
function fundAmountCell(value, total) { return `<td class="number">${formatCents(value)}<small class="cell-share">(${columnShare(value, total)} del total)</small></td>`; }
function renderFundTable(rows, latestPeriod) {
  const latestRows = rows.filter((row) => row.fecha_corte === latestPeriod), overall = fundTotals(latestRows), groups = new Map(); latestRows.forEach((row) => { const label = row.origen_nombre, group = groups.get(label) || []; group.push(row); groups.set(label, group); });
  const ordered = [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0], "es")), pageState = paginate(ordered, fundTablePage); fundTablePage = pageState.page;
  $("#fund-detail-table").innerHTML = pageState.items.map(([label, group]) => { const open = fundExpandedOrigins.has(label), values = fundTotals(group), balance = values.perceived - values.paid; const children = open ? [...group].sort((a, b) => cents(b, "recurso_percibido_centavos") - cents(a, "recurso_percibido_centavos")).map((row) => { const child = fundTotals([row]), childBalance = child.perceived - child.paid; return `<tr class="breakdown-row"><td></td><td><strong>${escapeHtml(canonicalFundName(row.fondo_codigo))}</strong></td>${fundAmountCell(child.current, overall.current)}${fundAmountCell(child.perceived, overall.perceived)}${fundAmountCell(child.committed, overall.committed)}${fundAmountCell(child.expenseAccrued, overall.expenseAccrued)}${fundAmountCell(child.paid, overall.paid)}<td class="number ${childBalance < 0 ? "negative" : "positive"}">${formatCents(childBalance)}</td></tr>`; }).join("") : ""; return `<tr class="secretary-total"><td><button class="expand-row fund-expand-row" type="button" data-fund-origin="${escapeHtml(label)}" aria-expanded="${open}"><span>${open ? "▾" : "▸"}</span>${escapeHtml(label)}</button></td><td>Total del nivel</td>${fundAmountCell(values.current, overall.current)}${fundAmountCell(values.perceived, overall.perceived)}${fundAmountCell(values.committed, overall.committed)}${fundAmountCell(values.expenseAccrued, overall.expenseAccrued)}${fundAmountCell(values.paid, overall.paid)}<td class="number ${balance < 0 ? "negative" : "positive"}">${formatCents(balance)}</td></tr>${children}`; }).join("");
  renderPagination("#fund-pagination", pageState, "funds", ordered.length);
  $("#fund-table-note").textContent = latestPeriod ? `Valores acumulados a ${labelPeriod(latestPeriod)}. El balance mostrado es recurso percibido menos gasto pagado y puede ser negativo si se utilizaron saldos de ejercicios anteriores.` : "No hay datos para mostrar.";
}
function renderFundInsights(latestRows, renderGraph) {
  if (fundOriginChart) { fundOriginChart.destroy(); fundOriginChart = null; } const groups = new Map(); latestRows.forEach((row) => { const item = groups.get(row.origen_nombre) || { code: row.origen_codigo, value: 0 }; item.value += cents(row, "recurso_percibido_centavos"); groups.set(row.origen_nombre, item); });
  const palette = { "12": "#008a81", "22": "#438dcc", "32": "#7b3fc6", "42": "#e0a71b" }, items = [...groups.entries()].map(([label, item]) => ({ label, value: item.value, color: palette[item.code] || "#9aa7b7" })).filter((item) => item.value !== 0).sort((a, b) => b.value - a.value), total = items.reduce((value, item) => value + item.value, 0);
  $("#fund-origin-legend").innerHTML = items.length ? items.map((item) => `<li><i style="background:${item.color}"></i><span>${escapeHtml(item.label)}</span><strong>${columnShare(item.value, total)}</strong><small>${formatCents(item.value)}</small></li>`).join("") : '<li class="ranking-empty">Sin recursos percibidos.</li>'; const canvas = $("#fund-origin-chart"); canvas.hidden = !items.length;
  if (renderGraph && items.length && typeof Chart !== "undefined") fundOriginChart = new Chart(canvas, { type: "doughnut", data: { labels: items.map((item) => item.label), datasets: [{ data: items.map((item) => item.value), backgroundColor: items.map((item) => item.color), borderColor: "#fff", borderWidth: 3 }] }, options: { responsive: true, maintainAspectRatio: false, cutout: "66%", plugins: { legend: { display: false }, tooltip: { callbacks: { label: (context) => `${context.label}: ${formatCents(context.parsed)} (${columnShare(context.parsed, total)})` } } } } });
  const metricField = fundRankingMetric === "accrued" ? "recurso_devengado_centavos" : "recurso_percibido_centavos", rankingGroups = new Map(); latestRows.forEach((row) => rankingGroups.set(row.fondo_codigo, (rankingGroups.get(row.fondo_codigo) || 0) + cents(row, metricField)));
  const rankingTotal = [...rankingGroups.values()].reduce((sumValue, value) => sumValue + value, 0), top = [...rankingGroups.entries()].map(([code, value]) => ({ label: canonicalFundName(code), value })).filter((item) => item.value > 0).sort((a, b) => b.value - a.value).slice(0, 7), metricLabel = fundRankingMetric === "accrued" ? "recurso devengado" : "recurso percibido";
  $("#fund-ranking-title").textContent = fundRankingMetric === "accrued" ? "Mayor recurso devengado" : "Mayor recurso percibido"; $("#fund-ranking-note").textContent = `Fondos con mayor ${metricLabel} acumulado en el último cierre.`;
  document.querySelectorAll("[data-fund-ranking]").forEach((button) => { const active = button.dataset.fundRanking === fundRankingMetric; button.classList.toggle("active", active); button.setAttribute("aria-selected", String(active)); });
  $("#fund-top-list").innerHTML = top.length ? top.map((item) => `<li><strong>${escapeHtml(item.label)}</strong><span class="fund-ranking-amount">${formatCents(item.value)}</span><span class="fund-ranking-share">${columnShare(item.value, rankingTotal)}</span></li>`).join("") : `<li class="ranking-empty">Sin ${escapeHtml(metricLabel)} para esta selección.</li>`;
}
function renderFunds(renderGraph = true) {
  const rows = fundFilteredRows(), selected = [...fundSelectedPeriods].sort((a, b) => date({ fecha_corte: a }) - date({ fecha_corte: b })), latestPeriod = selected.at(-1), previousPeriod = selected.at(-2), latestRows = rows.filter((row) => row.fecha_corte === latestPeriod), previousRows = previousPeriod ? rows.filter((row) => row.fecha_corte === previousPeriod) : null;
  renderFundMetrics(latestRows, previousRows, latestPeriod, previousPeriod); renderFundTable(rows, latestPeriod); renderFundInsights(latestRows, renderGraph); if (renderGraph) renderFundChart(rows);
}
function resetFundFilters() { fundSelectedPeriods = new Set(fundPeriods()); fundExpandedOrigins.clear(); fundTablePage = 1; $("#fund-origin-filter").value = ""; $("#fund-name-filter").value = ""; fillFundNameFilter(); document.querySelectorAll("[data-fund-period]").forEach((button) => { button.classList.add("active"); button.setAttribute("aria-pressed", "true"); }); $("#fund-toggle-periods").textContent = "Quitar todos"; renderFunds(); }
function setupFilterPanelToggle(buttonSelector, bodySelector, layoutSelector, name) {
  $(buttonSelector).addEventListener("click", () => { const body = $(bodySelector), button = $(buttonSelector), collapsed = !body.hidden; body.hidden = collapsed; $(layoutSelector).classList.toggle("filters-collapsed", collapsed); button.textContent = collapsed ? "›" : "‹"; button.setAttribute("aria-expanded", String(!collapsed)); button.setAttribute("aria-label", collapsed ? `Desplegar ${name}` : `Plegar ${name}`); });
}
async function init() {
  try {
    if (typeof Chart !== "undefined") Chart.defaults.devicePixelRatio = 2;
    data = (await Promise.all(DATA_FILES.map((file) => fetch(file).then((response) => { if (!response.ok) throw new Error(file); return response.text(); })))).flatMap(parseCSV);
    resourceData = (await Promise.all(RESOURCE_DATA_FILES.map((file) => fetch(file).then((response) => { if (!response.ok) throw new Error(file); return response.text(); })))).flatMap(parseCSV);
    fundData = (await Promise.all(FUND_DATA_FILES.map((file) => fetch(file).then((response) => { if (!response.ok) throw new Error(file); return response.text(); })))).flatMap(parseCSV);
    financingData = (await Promise.all(FINANCING_DATA_FILES.map((file) => fetch(file).then((response) => { if (!response.ok) throw new Error(file); return response.text(); })))).flatMap(parseCSV);
    fillFilters(); fillResourceFilters(); fillFundFilters(); render(); renderResources(false); renderFunds(false); renderPublicSummary(); renderGuideDirectory();
    const latestLoadedPeriod = [...periods(), ...resourcePeriods(), ...fundPeriods()].sort((a, b) => date({ fecha_corte: a }) - date({ fecha_corte: b })).at(-1);
    $("#updated-period").textContent = latestLoadedPeriod ? updateDateFormat.format(date({ fecha_corte: latestLoadedPeriod })) : "Sin datos";
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
      bridgeFocusPeriod = null; render();
    });
    $("#jurisdiction-filter").addEventListener("change", () => { selectedPrograms = new Set(programsForSelectedJurisdiction()); expandedSecretaries.clear(); renderProgramChips(); fillExpenseDependentFilters(); render(); });
    $("#program-filter").addEventListener("change", (event) => { const checkbox = event.target.closest("[data-program]"); if (!checkbox) return; checkbox.checked ? selectedPrograms.add(checkbox.dataset.program) : selectedPrograms.delete(checkbox.dataset.program); renderProgramChips(); fillExpenseDependentFilters(); render(); });
    $("#program-filter").addEventListener("click", (event) => { const onlyButton = event.target.closest("[data-only-program]"); if (!onlyButton) return; selectedPrograms = new Set([onlyButton.dataset.onlyProgram]); renderProgramChips(); fillExpenseDependentFilters(); render(); });
    $("#select-all-programs").addEventListener("click", () => { selectedPrograms = new Set(programsForSelectedJurisdiction()); renderProgramChips(); fillExpenseDependentFilters(); render(); });
    $("#clear-programs").addEventListener("click", () => { selectedPrograms.clear(); renderProgramChips(); fillExpenseDependentFilters(); render(); });
    $("#toggle-program-panel").addEventListener("click", () => { const body = $("#program-panel-body"), collapsed = !body.hidden; body.hidden = collapsed; $("#toggle-program-panel").textContent = collapsed ? "Mostrar" : "Reducir"; $("#toggle-program-panel").setAttribute("aria-expanded", String(!collapsed)); });
    setupFilterPanelToggle("#toggle-filter-sidebar", "#filter-sidebar-body", "#dashboard-layout", "filtros de gastos");
    $("#toggle-resource-filters").addEventListener("click", () => { const body = $("#resource-filter-body"), collapsed = !body.hidden; body.hidden = collapsed; $("#resource-filters-title").closest(".resource-filters").classList.toggle("filters-compact", collapsed); $("#toggle-resource-filters").textContent = collapsed ? "Mostrar" : "Reducir"; $("#toggle-resource-filters").setAttribute("aria-expanded", String(!collapsed)); });
    setupFilterPanelToggle("#toggle-fund-filters", "#fund-filter-body", "#fund-layout", "filtros de fondos");
    $("#toggle-periods").addEventListener("click", () => { selectedPeriods = selectedPeriods.size === periods().length ? new Set() : new Set(periods()); bridgeFocusPeriod = null; $("#toggle-periods").textContent = selectedPeriods.size ? "Quitar todos" : "Seleccionar todos"; document.querySelectorAll(".month-option[data-period]").forEach((chip) => { chip.classList.toggle("active", selectedPeriods.has(chip.dataset.period)); chip.setAttribute("aria-pressed", selectedPeriods.has(chip.dataset.period)); }); render(); });
    $("#source-filter").addEventListener("change", () => { fillExpenseObjectFilter(); render(); });
    ["#object-filter", "#detail-breakdown-filter", "#ranking-dimension"].forEach((id) => $(id).addEventListener("change", render));
    document.querySelectorAll("[data-chart]").forEach((tab) => tab.addEventListener("click", () => { activeChart = tab.dataset.chart; document.querySelectorAll("[data-chart]").forEach((item) => { item.classList.toggle("active", item === tab); item.setAttribute("aria-selected", String(item === tab)); }); renderChart(filteredRows()); }));
    $("#show-bar-values").addEventListener("change", (event) => { showBarValues = event.target.checked; renderChart(filteredRows()); });
    const moveBridgeFocus = (direction) => { const available = aggregatePeriods(filteredRows(true)).map((value) => value.period), index = available.indexOf(bridgeFocusPeriod), nextIndex = Math.min(Math.max(index + direction, 0), available.length - 1); if (available[nextIndex]) { bridgeFocusPeriod = available[nextIndex]; renderChart(filteredRows()); } };
    $("#bridge-previous").addEventListener("click", () => moveBridgeFocus(-1)); $("#bridge-next").addEventListener("click", () => moveBridgeFocus(1));
    document.querySelectorAll(".header-tabs [data-page]").forEach((button) => button.addEventListener("click", () => { const page = button.dataset.page; document.querySelectorAll(".page-view").forEach((view) => { view.hidden = view.id !== `page-${page}`; }); $("#header-tracking-tabs").hidden = page !== "tracking"; document.querySelectorAll(".header-tabs [data-page]").forEach((item) => { item.classList.toggle("active", item === button); item.setAttribute("aria-selected", String(item === button)); }); }));
    document.querySelectorAll(".tracking-tabs [data-tracking]").forEach((button) => button.addEventListener("click", () => { const tracking = button.dataset.tracking; document.querySelectorAll(".tracking-view").forEach((view) => { view.hidden = view.id !== `tracking-${tracking}`; }); document.querySelectorAll(".tracking-tabs [data-tracking]").forEach((item) => { item.classList.toggle("active", item === button); item.setAttribute("aria-selected", String(item === button)); }); if (tracking === "resources") requestAnimationFrame(() => renderResources()); if (tracking === "funds") requestAnimationFrame(() => renderFunds()); }));
    $("#detail-table").addEventListener("click", (event) => { const button = event.target.closest(".expand-row"); if (!button) return; const name = button.dataset.secretary; expandedSecretaries.has(name) ? expandedSecretaries.delete(name) : expandedSecretaries.add(name); renderTable(filteredRows()); });
    document.querySelectorAll(".sort-header").forEach((button) => button.addEventListener("click", () => { const key = button.dataset.sort; expenseTablePage = 1; if (tableSort.key === key) tableSort.direction = tableSort.direction === "asc" ? "desc" : "asc"; else { tableSort.key = key; tableSort.direction = key === "name" || key === "breakdown" ? "asc" : "desc"; } renderTable(filteredRows()); }));
    $("#clear-filters").addEventListener("click", resetFilters);
    document.querySelectorAll("[data-download-view]").forEach((button) => button.addEventListener("click", () => openDownloadDialog(button.dataset.downloadView)));
    $("#generate-download").addEventListener("click", () => { const selected = [...$("#download-options").querySelectorAll("input:checked:not(:disabled)")].map((input) => input.value); if (!selected.length) { $("#download-error").hidden = false; return; } $("#download-error").hidden = true; exportDashboardImage(activeDownloadView, selected); $("#download-dialog").close(); });
    $("#guide-directory-table").addEventListener("click", (event) => { const button = event.target.closest("[data-guide-secretary]"); if (!button) return; const code = button.dataset.guideSecretary; guideExpandedSecretaries.has(code) ? guideExpandedSecretaries.delete(code) : guideExpandedSecretaries.add(code); renderGuideDirectory(); });
    document.querySelectorAll(".table-pagination").forEach((pagination) => pagination.addEventListener("click", (event) => { const button = event.target.closest("[data-pagination]"); if (!button || button.disabled) return; const page = Number(button.dataset.page); if (button.dataset.pagination === "expenses") { expenseTablePage = page; renderTable(filteredRows()); } else if (button.dataset.pagination === "resources") { resourceTablePage = page; renderResourceTable(resourceFilteredRows(), [...resourceSelectedPeriods].sort((a, b) => date({ fecha_corte: a }) - date({ fecha_corte: b })).at(-1)); } else if (button.dataset.pagination === "guide") { guideTablePage = page; renderGuideDirectory(); } else { fundTablePage = page; renderFundTable(fundFilteredRows(), [...fundSelectedPeriods].sort((a, b) => date({ fecha_corte: a }) - date({ fecha_corte: b })).at(-1)); } }));
    $("#resource-period-filter").addEventListener("click", (event) => {
      const yearButton = event.target.closest("[data-resource-year]");
      if (yearButton) { const year = yearButton.dataset.resourceYear, yearPeriods = resourcePeriods().filter((period) => period.endsWith(`/${year}`)), allSelected = yearPeriods.every((period) => resourceSelectedPeriods.has(period)); yearPeriods.forEach((period) => allSelected ? resourceSelectedPeriods.delete(period) : resourceSelectedPeriods.add(period)); }
      else { const button = event.target.closest("[data-resource-period]"); if (!button) return; resourceSelectedPeriods.has(button.dataset.resourcePeriod) ? resourceSelectedPeriods.delete(button.dataset.resourcePeriod) : resourceSelectedPeriods.add(button.dataset.resourcePeriod); }
      document.querySelectorAll("[data-resource-period]").forEach((button) => { const active = resourceSelectedPeriods.has(button.dataset.resourcePeriod); button.classList.toggle("active", active); button.setAttribute("aria-pressed", String(active)); }); $("#resource-toggle-periods").textContent = resourceSelectedPeriods.size === resourcePeriods().length ? "Quitar todos" : "Seleccionar todos"; renderResources();
    });
    $("#resource-toggle-periods").addEventListener("click", () => { resourceSelectedPeriods = resourceSelectedPeriods.size === resourcePeriods().length ? new Set() : new Set(resourcePeriods()); document.querySelectorAll("[data-resource-period]").forEach((button) => { const active = resourceSelectedPeriods.has(button.dataset.resourcePeriod); button.classList.toggle("active", active); button.setAttribute("aria-pressed", String(active)); }); $("#resource-toggle-periods").textContent = resourceSelectedPeriods.size ? "Quitar todos" : "Seleccionar todos"; renderResources(); });
    $("#resource-filter-body").addEventListener("click", (event) => { const clear = event.target.closest("[data-clear-resource]"); if (clear) { ({ major: resourceSelectedMajors, detail: resourceSelectedDetails })[clear.dataset.clearResource].clear(); renderResourceOptionButtons(); renderResources(); return; } const button = event.target.closest("[data-resource-filter]"); if (!button) return; const sets = { major: resourceSelectedMajors, detail: resourceSelectedDetails }, selected = sets[button.dataset.resourceFilter], value = button.dataset.value; selected.has(value) ? selected.delete(value) : selected.add(value); resourceExpandedMajors.clear(); resourceTablePage = 1; renderResourceOptionButtons(); renderResources(); });
    $("#resource-clear-filters").addEventListener("click", resetResourceFilters);
    $("#resource-detail-table").addEventListener("click", (event) => { const button = event.target.closest("[data-resource-major]"); if (!button) return; const key = button.dataset.resourceMajor; resourceExpandedMajors.has(key) ? resourceExpandedMajors.delete(key) : resourceExpandedMajors.add(key); renderResourceTable(resourceFilteredRows(), [...resourceSelectedPeriods].sort((a, b) => date({ fecha_corte: a }) - date({ fecha_corte: b })).at(-1)); });
    document.querySelectorAll("[data-resource-chart]").forEach((button) => button.addEventListener("click", () => { resourceActiveChart = button.dataset.resourceChart; document.querySelectorAll("[data-resource-chart]").forEach((item) => { item.classList.toggle("active", item === button); item.setAttribute("aria-selected", String(item === button)); }); renderResourceChart(resourceFilteredRows()); }));
    $("#resource-show-values").addEventListener("change", (event) => { resourceShowValues = event.target.checked; renderResourceChart(resourceFilteredRows()); });
    document.querySelectorAll("[data-resource-growth]").forEach((button) => button.addEventListener("click", () => { resourceGrowthDimension = button.dataset.resourceGrowth; document.querySelectorAll("[data-resource-growth]").forEach((item) => { item.classList.toggle("active", item === button); item.setAttribute("aria-selected", String(item === button)); }); renderResources(); }));
    $("#toggle-heatmap").addEventListener("click", () => { heatmapExpanded = !heatmapExpanded; renderHeatmap(filteredRows(), selectedPeriodSequence().at(-1)); });
    $("#fund-period-filter").addEventListener("click", (event) => { const yearButton = event.target.closest("[data-fund-year]"); if (yearButton) { const year = yearButton.dataset.fundYear, yearPeriods = fundPeriods().filter((period) => period.endsWith(`/${year}`)), allSelected = yearPeriods.every((period) => fundSelectedPeriods.has(period)); yearPeriods.forEach((period) => allSelected ? fundSelectedPeriods.delete(period) : fundSelectedPeriods.add(period)); } else { const button = event.target.closest("[data-fund-period]"); if (!button) return; fundSelectedPeriods.has(button.dataset.fundPeriod) ? fundSelectedPeriods.delete(button.dataset.fundPeriod) : fundSelectedPeriods.add(button.dataset.fundPeriod); } document.querySelectorAll("[data-fund-period]").forEach((button) => { const active = fundSelectedPeriods.has(button.dataset.fundPeriod); button.classList.toggle("active", active); button.setAttribute("aria-pressed", String(active)); }); $("#fund-toggle-periods").textContent = fundSelectedPeriods.size === fundPeriods().length ? "Quitar todos" : "Seleccionar todos"; renderFunds(); });
    $("#fund-toggle-periods").addEventListener("click", () => { fundSelectedPeriods = fundSelectedPeriods.size === fundPeriods().length ? new Set() : new Set(fundPeriods()); document.querySelectorAll("[data-fund-period]").forEach((button) => { const active = fundSelectedPeriods.has(button.dataset.fundPeriod); button.classList.toggle("active", active); button.setAttribute("aria-pressed", String(active)); }); $("#fund-toggle-periods").textContent = fundSelectedPeriods.size ? "Quitar todos" : "Seleccionar todos"; renderFunds(); });
    $("#fund-origin-filter").addEventListener("change", () => { fundExpandedOrigins.clear(); fillFundNameFilter(); renderFunds(); }); $("#fund-name-filter").addEventListener("change", () => { fundExpandedOrigins.clear(); renderFunds(); }); $("#fund-clear-filters").addEventListener("click", resetFundFilters);
    $("#fund-detail-table").addEventListener("click", (event) => { const button = event.target.closest("[data-fund-origin]"); if (!button) return; const key = button.dataset.fundOrigin; fundExpandedOrigins.has(key) ? fundExpandedOrigins.delete(key) : fundExpandedOrigins.add(key); renderFundTable(fundFilteredRows(), [...fundSelectedPeriods].sort((a, b) => date({ fecha_corte: a }) - date({ fecha_corte: b })).at(-1)); });
    document.querySelectorAll("[data-fund-ranking]").forEach((button) => button.addEventListener("click", () => { fundRankingMetric = button.dataset.fundRanking; renderFunds(); }));
    document.querySelectorAll("[data-fund-chart]").forEach((button) => button.addEventListener("click", () => { fundActiveChart = button.dataset.fundChart; document.querySelectorAll("[data-fund-chart]").forEach((item) => { item.classList.toggle("active", item === button); item.setAttribute("aria-selected", String(item === button)); }); renderFundChart(fundFilteredRows()); }));
    $("#fund-show-values").addEventListener("change", (event) => { fundShowValues = event.target.checked; renderFundChart(fundFilteredRows()); });
  } catch (error) { $("#updated-period").textContent = "Error al cargar"; console.error(error); }
}
init();
