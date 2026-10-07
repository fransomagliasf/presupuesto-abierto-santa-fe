const DATA_FILES = [
  "data/processed/gastos_por_objeto_2026-01-31.csv",
  "data/processed/gastos_por_objeto_2026-02-28.csv",
];
const fields = ["credito_vigente_centavos", "devengado_centavos", "pagado_centavos", "credito_disponible_centavos"];
const $ = (selector) => document.querySelector(selector);
const currency = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });
const dateFormat = new Intl.DateTimeFormat("es-AR", { month: "short", year: "numeric", timeZone: "UTC" });
let data = [];

function parseCSV(text) {
  const [header, ...lines] = text.trim().split(/\r?\n/);
  const columns = header.split(",");
  return lines.map((line) => Object.fromEntries(line.split(",").map((value, index) => [columns[index], value])));
}
function cents(row, field) { return Number(row[field] || 0); }
function date(row) { const [day, month, year] = row.fecha_corte.split("/"); return new Date(Date.UTC(year, month - 1, day)); }
function labelPeriod(row) { return dateFormat.format(date(row)); }
function sortUnique(values) { return [...new Set(values)].sort((a, b) => a.localeCompare(b, "es")); }
function populateSelect(id, values, label) {
  const select = $(id);
  select.innerHTML = `<option value="">${label}</option>` + values.map((value) => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join("");
}
function escapeHtml(value) { return String(value).replace(/[&<>"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[char]); }
function selectedPeriods() { return [...$("#period-filter").selectedOptions].map((option) => option.value); }
function selectedValue(id) { return $(id).value; }
function fillFilters() {
  const periods = sortUnique(data.map((row) => row.fecha_corte)).sort((a, b) => date({ fecha_corte: a }) - date({ fecha_corte: b }));
  const periodSelect = $("#period-filter");
  periodSelect.innerHTML = periods.map((value) => `<option value="${value}" selected>${escapeHtml(labelPeriod({ fecha_corte: value }))}</option>`).join("");
  populateSelect("#jurisdiction-filter", sortUnique(data.map((r) => r.jurisdiccion_nombre)), "Todas las secretarías");
  populateSelect("#program-filter", sortUnique(data.map((r) => r.programa_nombre)), "Todos los programas");
  populateSelect("#source-filter", sortUnique(data.map((r) => r.fuente_financiamiento_nombre)), "Todas las fuentes");
  populateSelect("#object-filter", sortUnique(data.map((r) => `${r.objeto_gasto_codigo} · ${r.objeto_gasto_nombre}`)), "Todos los objetos");
}
function filteredRows() {
  const periods = selectedPeriods();
  const filters = {
    jurisdiction: selectedValue("#jurisdiction-filter"), program: selectedValue("#program-filter"),
    source: selectedValue("#source-filter"), object: selectedValue("#object-filter"),
  };
  return data.filter((row) => (!periods.length || periods.includes(row.fecha_corte)) &&
    (!filters.jurisdiction || row.jurisdiccion_nombre === filters.jurisdiction) &&
    (!filters.program || row.programa_nombre === filters.program) &&
    (!filters.source || row.fuente_financiamiento_nombre === filters.source) &&
    (!filters.object || `${row.objeto_gasto_codigo} · ${row.objeto_gasto_nombre}` === filters.object));
}
function sum(rows, field) { return rows.reduce((total, row) => total + cents(row, field), 0); }
function formatCents(value) { return currency.format(value / 100); }
function percent(part, whole) { return whole ? `${(part / whole * 100).toLocaleString("es-AR", { maximumFractionDigits: 1 })}% del crédito vigente` : "Sin crédito vigente"; }
function renderMetrics(rows) {
  const current = sum(rows, "credito_vigente_centavos"), accrued = sum(rows, "devengado_centavos"), paid = sum(rows, "pagado_centavos"), available = sum(rows, "credito_disponible_centavos");
  $("#metric-current").textContent = formatCents(current); $("#metric-accrued").textContent = formatCents(accrued); $("#metric-paid").textContent = formatCents(paid); $("#metric-available").textContent = formatCents(available);
  $("#metric-accrued-share").textContent = percent(accrued, current); $("#metric-paid-share").textContent = percent(paid, current); $("#metric-row-count").textContent = `${rows.length.toLocaleString("es-AR")} partidas`;
}
function aggregatePeriods(rows) {
  const byPeriod = new Map();
  rows.forEach((row) => { const current = byPeriod.get(row.fecha_corte) || { period: row.fecha_corte, current: 0, accrued: 0, paid: 0 }; current.current += cents(row, "credito_vigente_centavos"); current.accrued += cents(row, "devengado_centavos"); current.paid += cents(row, "pagado_centavos"); byPeriod.set(row.fecha_corte, current); });
  return [...byPeriod.values()].sort((a, b) => date({ fecha_corte: a.period }) - date({ fecha_corte: b.period }));
}
function renderChart(rows) {
  const values = aggregatePeriods(rows), chart = $("#chart");
  if (!values.length) { chart.innerHTML = "<p class='note'>No hay datos para esta combinación de filtros.</p>"; return; }
  const width = 700, height = 265, pad = { top: 18, right: 18, bottom: 38, left: 70 }, max = Math.max(...values.flatMap((v) => [v.accrued, v.paid]), 1);
  const x = (i) => values.length === 1 ? width / 2 : pad.left + i * (width - pad.left - pad.right) / (values.length - 1);
  const y = (value) => height - pad.bottom - value / max * (height - pad.top - pad.bottom);
  const line = (field) => values.map((value, index) => `${index ? "L" : "M"}${x(index).toFixed(1)},${y(value[field]).toFixed(1)}`).join(" ");
  let svg = `<svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none">`;
  [0, .5, 1].forEach((share) => { const yy = y(max * share); svg += `<line class="grid-line" x1="${pad.left}" x2="${width - pad.right}" y1="${yy}" y2="${yy}"/><text class="axis-label" x="${pad.left - 7}" y="${yy + 4}" text-anchor="end">${formatCents(max * share)}</text>`; });
  svg += `<path class="line-accrued" d="${line("accrued")}"/><path class="line-paid" d="${line("paid")}"/>`;
  values.forEach((value, index) => { svg += `<circle class="point-accrued" cx="${x(index)}" cy="${y(value.accrued)}" r="4"><title>${labelPeriod({ fecha_corte: value.period })}: devengado ${formatCents(value.accrued)}</title></circle><circle class="point-paid" cx="${x(index)}" cy="${y(value.paid)}" r="4"><title>${labelPeriod({ fecha_corte: value.period })}: pagado ${formatCents(value.paid)}</title></circle><text class="axis-label" x="${x(index)}" y="${height - 12}" text-anchor="middle">${labelPeriod({ fecha_corte: value.period })}</text>`; });
  chart.innerHTML = svg + "</svg>";
  $("#chart-note").textContent = values.length < 2 ? "Seleccioná al menos dos períodos para ver una evolución." : "Los valores son acumulados al cierre de cada mes.";
}
function renderChanges(rows) {
  const periods = aggregatePeriods(rows), container = $("#change-summary");
  if (periods.length < 2) { container.innerHTML = "<dt>Comparación</dt><dd>Seleccioná dos períodos</dd>"; return; }
  const previous = periods.at(-2), latest = periods.at(-1);
  container.innerHTML = [["Crédito vigente", latest.current - previous.current], ["Devengado", latest.accrued - previous.accrued], ["Pagado", latest.paid - previous.paid]].map(([name, change]) => `<dt>${name}</dt><dd class="${change >= 0 ? "positive" : "negative"}">${change >= 0 ? "+" : ""}${formatCents(change)}</dd>`).join("");
}
function renderTable(rows) {
  const field = $("#sort-filter").value, latestPeriod = aggregatePeriods(rows).at(-1)?.period;
  const latestRows = rows.filter((row) => row.fecha_corte === latestPeriod).sort((a, b) => cents(b, field) - cents(a, field)).slice(0, 50);
  $("#detail-table").innerHTML = latestRows.map((row) => `<tr><td>${escapeHtml(labelPeriod(row))}</td><td>${escapeHtml(row.jurisdiccion_nombre)}</td><td>${escapeHtml(row.programa_nombre)}</td><td>${escapeHtml(row.fuente_financiamiento_nombre)}</td><td>${escapeHtml(row.objeto_gasto_codigo)} · ${escapeHtml(row.objeto_gasto_nombre)}</td>${fields.map((field) => `<td class="number">${formatCents(cents(row, field))}</td>`).join("")}</tr>`).join("");
  $("#table-note").textContent = latestPeriod ? `Se muestran las primeras ${latestRows.length} partidas del último período seleccionado (${labelPeriod({ fecha_corte: latestPeriod })}).` : "No hay partidas para mostrar.";
}
function render() { const rows = filteredRows(); renderMetrics(rows); renderChart(rows); renderChanges(rows); renderTable(rows); }
async function init() {
  try {
    data = (await Promise.all(DATA_FILES.map((file) => fetch(file).then((response) => { if (!response.ok) throw new Error(file); return response.text(); })))).flatMap(parseCSV);
    fillFilters(); render();
    $("#updated-at").textContent = `${data.length.toLocaleString("es-AR")} partidas cargadas · último cierre: ${labelPeriod(data.reduce((latest, row) => date(row) > date(latest) ? row : latest))}`;
    document.querySelectorAll("select").forEach((select) => select.addEventListener("change", render));
    $("#clear-filters").addEventListener("click", () => {
      ["#jurisdiction-filter", "#program-filter", "#source-filter", "#object-filter", "#sort-filter"].forEach((id) => { $(id).selectedIndex = 0; });
      [...$("#period-filter").options].forEach((option) => option.selected = true);
      render();
    });
  } catch (error) { $("#updated-at").textContent = "No se pudieron cargar los datos."; console.error(error); }
}
init();
