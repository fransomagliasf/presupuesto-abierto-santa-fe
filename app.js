const DATA_FILES = [
  "data/processed/gastos_por_objeto_2026-01-31.csv", "data/processed/gastos_por_objeto_2026-02-28.csv", "data/processed/gastos_por_objeto_2026-03-31.csv",
  "data/processed/gastos_por_objeto_2026-04-30.csv", "data/processed/gastos_por_objeto_2026-05-31.csv", "data/processed/gastos_por_objeto_2026-06-30.csv",
  "data/processed/gastos_por_objeto_2026-07-31.csv", "data/processed/gastos_por_objeto_2026-08-31.csv", "data/processed/gastos_por_objeto_2026-09-30.csv",
];
const $ = (selector) => document.querySelector(selector);
const currency = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });
const dateFormat = new Intl.DateTimeFormat("es-AR", { month: "short", year: "numeric", timeZone: "UTC" });
let data = [], selectedPeriods = new Set(), selectedPrograms = new Set(), expandedSecretaries = new Set(), activeChart = "line";

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
function sum(rows, field) { return rows.reduce((total, row) => total + cents(row, field), 0); }
function executionPercent(accrued, current) { return current > 0 ? accrued / current * 100 : null; }
function formatPercent(value) { return value === null ? "—" : `${value.toLocaleString("es-AR", { maximumFractionDigits: 1 })}%`; }
function populateSelect(id, values, label) { $(id).innerHTML = `<option value="">${label}</option>${values.map((v) => `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`).join("")}`; }
function periods() { return unique(data.map((row) => row.fecha_corte)).sort((a, b) => date({ fecha_corte: a }) - date({ fecha_corte: b })); }

function fillFilters() {
  selectedPeriods = new Set(periods());
  $("#period-filter").innerHTML = periods().map((period) => `<button type="button" class="filter-chip active" data-period="${period}" aria-pressed="true">${escapeHtml(labelPeriod(period))}</button>`).join("");
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
  $("#program-filter").innerHTML = programs.map((program) => `<button type="button" class="filter-chip ${selectedPrograms.has(program) ? "active" : ""}" data-program="${escapeHtml(program)}" aria-pressed="${selectedPrograms.has(program)}">${escapeHtml(program)}</button>`).join("");
}
function filteredRows() {
  const jurisdiction = $("#jurisdiction-filter").value, source = $("#source-filter").value, object = $("#object-filter").value;
  return data.filter((row) => selectedPeriods.has(row.fecha_corte) && (!jurisdiction || row.jurisdiccion_nombre === jurisdiction) && (!jurisdiction || selectedPrograms.has(row.programa_nombre)) && (!source || row.fuente_financiamiento_nombre === source) && (!object || `${row.objeto_gasto_codigo} · ${row.objeto_gasto_nombre}` === object));
}
function aggregatePeriods(rows) {
  const byPeriod = new Map();
  rows.forEach((row) => { const values = byPeriod.get(row.fecha_corte) || { period: row.fecha_corte, current: 0, accrued: 0, paid: 0 }; values.current += cents(row, "credito_vigente_centavos"); values.accrued += cents(row, "devengado_centavos"); values.paid += cents(row, "pagado_centavos"); byPeriod.set(row.fecha_corte, values); });
  return [...byPeriod.values()].sort((a, b) => date({ fecha_corte: a.period }) - date({ fecha_corte: b.period }));
}
function renderMetrics(rows) {
  const current = sum(rows, "credito_vigente_centavos"), accrued = sum(rows, "devengado_centavos"), paid = sum(rows, "pagado_centavos"), available = sum(rows, "credito_disponible_centavos");
  $("#metric-current").textContent = formatCents(current); $("#metric-accrued").textContent = formatCents(accrued); $("#metric-paid").textContent = formatCents(paid); $("#metric-available").textContent = formatCents(available);
  $("#metric-accrued-share").textContent = `${formatPercent(executionPercent(accrued, current))} ejecutado`; $("#metric-paid-share").textContent = current ? `${formatPercent(paid / current * 100)} pagado` : "Sin crédito vigente"; $("#metric-row-count").textContent = `${rows.length.toLocaleString("es-AR")} partidas`;
}
function chartTooltip(value, series) {
  const label = series === "accrued" ? "Devengado" : "Pagado";
  return `<strong>${escapeHtml(labelPeriod(value.period))}</strong><span>${label}: <b>${formatCents(value[series])}</b></span><span>Devengado: <b>${formatCents(value.accrued)}</b></span><span>Ejecutado: <b>${formatPercent(executionPercent(value.accrued, value.current))}</b></span>`;
}
function renderChart(rows) {
  const values = aggregatePeriods(rows), chart = $("#chart");
  if (!values.length) { chart.innerHTML = "<p class='note'>No hay datos para esta combinación de filtros.</p>"; return; }
  const width = 760, height = 290, pad = { top: 22, right: 24, bottom: 42, left: 74 }, max = Math.max(...values.flatMap((v) => [v.accrued, v.paid]), 1);
  const x = (i) => values.length === 1 ? width / 2 : pad.left + i * (width - pad.left - pad.right) / (values.length - 1);
  const y = (value) => height - pad.bottom - value / max * (height - pad.top - pad.bottom);
  const axes = [0, .5, 1].map((share) => { const yy = y(max * share); return `<line class="grid-line" x1="${pad.left}" x2="${width - pad.right}" y1="${yy}" y2="${yy}"/><text class="axis-label" x="${pad.left - 8}" y="${yy + 4}" text-anchor="end">${formatCents(max * share)}</text>`; }).join("");
  const labels = values.map((value, index) => `<text class="axis-label" x="${x(index)}" y="${height - 12}" text-anchor="middle">${escapeHtml(labelPeriod(value.period))}</text>`).join("");
  let marks = "";
  if (activeChart === "line") {
    const path = (field) => values.map((value, index) => `${index ? "L" : "M"}${x(index).toFixed(1)},${y(value[field]).toFixed(1)}`).join(" ");
    marks = `<path class="line-accrued" d="${path("accrued")}"/><path class="line-paid" d="${path("paid")}"/>` + values.map((value, index) => `<circle class="chart-point point-accrued" data-index="${index}" data-series="accrued" cx="${x(index)}" cy="${y(value.accrued)}" r="5"/><circle class="chart-point point-paid" data-index="${index}" data-series="paid" cx="${x(index)}" cy="${y(value.paid)}" r="5"/>`).join("");
  } else {
    const band = Math.min(26, (width - pad.left - pad.right) / Math.max(values.length * 3, 3));
    marks = values.map((value, index) => `<rect class="chart-point bar-accrued" data-index="${index}" data-series="accrued" x="${x(index) - band - 2}" y="${y(value.accrued)}" width="${band}" height="${height - pad.bottom - y(value.accrued)}" rx="3"/><rect class="chart-point bar-paid" data-index="${index}" data-series="paid" x="${x(index) + 2}" y="${y(value.paid)}" width="${band}" height="${height - pad.bottom - y(value.paid)}" rx="3"/>`).join("");
  }
  chart.innerHTML = `<svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none">${axes}${marks}${labels}</svg><div id="chart-tooltip" class="chart-tooltip" role="status"></div>`;
  chart.dataset.values = JSON.stringify(values);
  $("#chart-note").textContent = values.length < 2 ? "Seleccioná más períodos para comparar la evolución." : "Los valores son acumulados al cierre de cada mes. Posate sobre un punto o barra para ver el detalle.";
}
function renderChanges(rows) {
  const values = aggregatePeriods(rows), container = $("#change-summary");
  if (values.length < 2) { container.innerHTML = "<dt>Comparación</dt><dd>Seleccioná dos períodos</dd>"; return; }
  const previous = values.at(-2), latest = values.at(-1);
  container.innerHTML = [["Crédito vigente", latest.current - previous.current], ["Devengado", latest.accrued - previous.accrued], ["Pagado", latest.paid - previous.paid]].map(([name, change]) => `<dt>${name}</dt><dd class="${change >= 0 ? "positive" : "negative"}">${change >= 0 ? "+" : ""}${formatCents(change)}</dd>`).join("");
}
function totals(rows) { return { current: sum(rows, "credito_vigente_centavos"), accrued: sum(rows, "devengado_centavos"), paid: sum(rows, "pagado_centavos"), available: sum(rows, "credito_disponible_centavos") }; }
function totalCells(values) { return `<td class="number">${formatCents(values.current)}</td><td class="number">${formatCents(values.accrued)}</td><td class="number">${formatCents(values.paid)}</td><td class="number">${formatCents(values.available)}</td><td class="number">${formatPercent(executionPercent(values.accrued, values.current))}</td>`; }
function renderTable(rows) {
  const latestPeriod = aggregatePeriods(rows).at(-1)?.period, visibleRows = rows.filter((row) => row.fecha_corte === latestPeriod), breakdown = $("#detail-breakdown-filter").value;
  const bySecretary = new Map(); visibleRows.forEach((row) => { const group = bySecretary.get(row.jurisdiccion_nombre) || []; group.push(row); bySecretary.set(row.jurisdiccion_nombre, group); });
  const entries = [...bySecretary.entries()].sort(([, a], [, b]) => totals(b).accrued - totals(a).accrued);
  $("#detail-table").innerHTML = entries.map(([name, secretaryRows]) => {
    const open = expandedSecretaries.has(name), subdivisions = new Map();
    secretaryRows.forEach((row) => { const label = breakdown === "source" ? row.fuente_financiamiento_nombre : `${row.objeto_gasto_codigo} · ${row.objeto_gasto_nombre}`; const group = subdivisions.get(label) || []; group.push(row); subdivisions.set(label, group); });
    const children = open ? [...subdivisions.entries()].sort(([, a], [, b]) => totals(b).accrued - totals(a).accrued).map(([label, group]) => `<tr class="breakdown-row"><td></td><td>${escapeHtml(label)}</td>${totalCells(totals(group))}</tr>`).join("") : "";
    return `<tr class="secretary-total"><td><button class="expand-row" type="button" data-secretary="${escapeHtml(name)}" aria-expanded="${open}"><span aria-hidden="true">${open ? "▾" : "▸"}</span>${escapeHtml(name)}</button></td><td>Total de secretaría</td>${totalCells(totals(secretaryRows))}</tr>${children}`;
  }).join("");
  $("#table-note").textContent = latestPeriod ? `Totales al ${latestPeriod}. Usá la flecha de cada secretaría para ver el detalle por ${breakdown === "source" ? "fuente de financiamiento" : "objeto del gasto"}.` : "No hay partidas para mostrar.";
}
function render() { const rows = filteredRows(); renderMetrics(rows); renderChart(rows); renderChanges(rows); renderTable(rows); }
function resetFilters() {
  selectedPeriods = new Set(periods()); selectedPrograms.clear(); expandedSecretaries.clear(); $("#jurisdiction-filter").value = ""; $("#source-filter").value = ""; $("#object-filter").value = "";
  document.querySelectorAll(".filter-chip[data-period]").forEach((chip) => { chip.classList.add("active"); chip.setAttribute("aria-pressed", "true"); }); renderProgramChips(); render();
}
async function init() {
  try {
    data = (await Promise.all(DATA_FILES.map((file) => fetch(file).then((response) => { if (!response.ok) throw new Error(file); return response.text(); })))).flatMap(parseCSV);
    fillFilters(); render();
    $("#updated-at").textContent = `${data.length.toLocaleString("es-AR")} partidas cargadas · último cierre: ${labelPeriod(periods().at(-1))}`;
    $("#period-filter").addEventListener("click", (event) => { const chip = event.target.closest("[data-period]"); if (!chip) return; const period = chip.dataset.period; selectedPeriods.has(period) ? selectedPeriods.delete(period) : selectedPeriods.add(period); chip.classList.toggle("active", selectedPeriods.has(period)); chip.setAttribute("aria-pressed", selectedPeriods.has(period)); render(); });
    $("#jurisdiction-filter").addEventListener("change", () => { selectedPrograms = new Set(programsForSelectedJurisdiction()); expandedSecretaries.clear(); renderProgramChips(); render(); });
    $("#program-filter").addEventListener("click", (event) => { const chip = event.target.closest("[data-program]"); if (!chip) return; const program = chip.dataset.program; selectedPrograms.has(program) ? selectedPrograms.delete(program) : selectedPrograms.add(program); renderProgramChips(); render(); });
    $("#select-all-programs").addEventListener("click", () => { selectedPrograms = new Set(programsForSelectedJurisdiction()); renderProgramChips(); render(); });
    ["#source-filter", "#object-filter", "#detail-breakdown-filter"].forEach((id) => $(id).addEventListener("change", render));
    $("#chart").addEventListener("pointermove", (event) => { const mark = event.target.closest(".chart-point"), tooltip = $("#chart-tooltip"); if (!mark || !tooltip) { if (tooltip) tooltip.classList.remove("visible"); return; } const value = JSON.parse($("#chart").dataset.values)[Number(mark.dataset.index)]; tooltip.innerHTML = chartTooltip(value, mark.dataset.series); const rect = $("#chart").getBoundingClientRect(); tooltip.style.left = `${Math.max(4, Math.min(event.clientX - rect.left + 12, rect.width - 210))}px`; tooltip.style.top = `${Math.max(event.clientY - rect.top - 95, 4)}px`; tooltip.classList.add("visible"); });
    $("#chart").addEventListener("pointerleave", () => $("#chart-tooltip")?.classList.remove("visible"));
    document.querySelectorAll(".chart-tab").forEach((tab) => tab.addEventListener("click", () => { activeChart = tab.dataset.chart; document.querySelectorAll(".chart-tab").forEach((item) => item.classList.toggle("active", item === tab)); renderChart(filteredRows()); }));
    $("#detail-table").addEventListener("click", (event) => { const button = event.target.closest(".expand-row"); if (!button) return; const name = button.dataset.secretary; expandedSecretaries.has(name) ? expandedSecretaries.delete(name) : expandedSecretaries.add(name); renderTable(filteredRows()); });
    $("#clear-filters").addEventListener("click", resetFilters);
  } catch (error) { $("#updated-at").textContent = "No se pudieron cargar los datos."; console.error(error); }
}
init();
