#!/usr/bin/env python3
"""Extract RAFAM affected-resources versus expenses reports to CSV.

The report calls these affected resources "Fondos Especiales". Detail rows
are assigned to the origin total that closes each section: municipal,
provincial, national or other. Amounts are stored as displayed text and exact
integer cents.

Usage:
    python3 scripts/extract_fondos_especiales.py INPUT.pdf OUTPUT.csv
"""

import csv
import re
import subprocess
import sys
import tempfile
from decimal import Decimal, InvalidOperation
from pathlib import Path


COLUMNS = [
    "recurso_vigente",
    "recurso_devengado",
    "recurso_percibido",
    "gasto_compromiso",
    "gasto_devengado",
    "gasto_pagado",
    "gasto_devengado_no_pagado",
    "saldo_informado",
]
AMOUNT = re.compile(r"-?[\d.]+,\d{2}")
PERIOD = re.compile(r"Del\s+\d{2}/\d{2}/\d{4}\s+al\s+(\d{2}/\d{2}/\d{4})")
DETAIL = re.compile(r"^\s*(\d{2}\.\d\.\d{2}\.\d{2})\s+-\s+")
ORIGIN_TOTAL = re.compile(r"^\s*Total:\s*(\d{2})\s*-\s*(.+?)\s{2,}")


def cents(value: str) -> int:
    try:
        return int(Decimal(value.replace(".", "").replace(",", ".")) * 100)
    except InvalidOperation as error:
        raise ValueError(f"Invalid amount: {value!r}") from error


def normalize(value: str) -> str:
    return " ".join(value.split()).strip()


def validate_row(code: str, values: list[int]) -> list[str]:
    current, _resource_accrued, perceived, _committed, expense_accrued, paid, unpaid, reported_balance = values
    issues = []
    if unpaid != expense_accrued - paid:
        issues.append("gasto_devengado_no_pagado_no_reconcilia")
    expected_balance = current - paid if code.startswith("35.") else perceived - paid
    if reported_balance != expected_balance:
        issues.append("saldo_informado_no_reconcilia")
    return issues


def main(input_pdf: Path, output_csv: Path) -> None:
    with tempfile.TemporaryDirectory() as directory:
        text_path = Path(directory) / "report.txt"
        subprocess.run(["pdftotext", "-layout", str(input_pdf), str(text_path)], check=True)
        lines = text_path.read_text(encoding="utf-8").splitlines()

    report_period = None
    rows = []
    pending = None
    unassigned = []
    grand_total = None
    origin_controls = []
    ignored_prefixes = ("Filtro aplicado:", "( * )", "R.A.F.A.M.", "ESTADO DE", "Municipalidad de", "Santa Fe", "Ejercicio:", "Recursos", "Rubro - Descripción", "Vigente", "Devengado", "no Pagado")

    for text_line, line in enumerate(lines, 1):
        if report_period is None:
            match = PERIOD.search(line)
            if match:
                report_period = match.group(1)

        amounts = AMOUNT.findall(line)
        if "Total General:" in line and len(amounts) == len(COLUMNS):
            grand_total = [cents(value) for value in amounts]
            pending = None
            continue

        origin_match = ORIGIN_TOTAL.match(line)
        if origin_match and len(amounts) == len(COLUMNS):
            origin_code, origin_name = origin_match.groups()
            origin_name = normalize(origin_name)
            printed = [cents(value) for value in amounts]
            for row in unassigned:
                row["origen_codigo"] = origin_code
                row["origen_nombre"] = origin_name
            calculated = [sum(row[f"{field}_centavos"] for row in unassigned) for field in COLUMNS]
            differences = [actual - expected for actual, expected in zip(calculated, printed)]
            note = ";".join(f"{field}={difference}" for field, difference in zip(COLUMNS, differences) if difference)
            for row in unassigned:
                row["total_origen_reconcilia"] = "no" if note else "si"
                row["diferencias_total_origen_centavos"] = note
            origin_controls.append((origin_code, origin_name, note))
            unassigned = []
            pending = None
            continue

        detail_match = DETAIL.match(line)
        if detail_match and len(amounts) == len(COLUMNS):
            if not report_period:
                raise ValueError(f"Missing report period near extracted line {text_line}")
            first_amount = AMOUNT.search(line)
            description = normalize(line[detail_match.end():first_amount.start()])
            exact_values = [cents(value) for value in amounts]
            issues = validate_row(detail_match.group(1), exact_values)
            pending = {
                "fecha_corte": report_period,
                "origen_codigo": "",
                "origen_nombre": "",
                "fondo_codigo": detail_match.group(1),
                "fondo_nombre": description,
                "linea_texto_extraido": text_line,
                "revision_requerida": "si" if issues else "no",
                "motivos_revision": ";".join(issues),
            }
            for field, original, exact in zip(COLUMNS, amounts, exact_values):
                pending[f"{field}_texto"] = original
                pending[f"{field}_centavos"] = exact
            rows.append(pending)
            unassigned.append(pending)
            continue

        if not line.strip():
            pending = None
            continue
        if pending and not amounts and not line.lstrip().startswith(ignored_prefixes) and "Hoja:" not in line and "Dif. entre" not in line and "Pagados" not in line:
            pending["fondo_nombre"] = normalize(f"{pending['fondo_nombre']} {line}")
        else:
            pending = None

    if unassigned:
        raise ValueError(f"{len(unassigned)} detail rows were not closed by an origin total")
    if not report_period:
        raise ValueError("Report period not found")
    if not rows:
        raise ValueError("No fund rows found")
    if grand_total is None:
        raise ValueError("Printed grand total not found")

    calculated_total = [sum(row[f"{field}_centavos"] for row in rows) for field in COLUMNS]
    total_differences = [actual - expected for actual, expected in zip(calculated_total, grand_total)]
    total_note = ";".join(f"{field}={difference}" for field, difference in zip(COLUMNS, total_differences) if difference)
    for row in rows:
        row["total_general_reconcilia"] = "no" if total_note else "si"
        row["diferencias_total_general_centavos"] = total_note

    output_csv.parent.mkdir(parents=True, exist_ok=True)
    with output_csv.open("w", newline="", encoding="utf-8") as file:
        writer = csv.DictWriter(file, fieldnames=list(rows[0]), lineterminator="\n")
        writer.writeheader()
        writer.writerows(rows)

    flagged = sum(row["revision_requerida"] == "si" for row in rows)
    origin_warnings = [f"{code}-{name}: {note}" for code, name, note in origin_controls if note]
    control_message = "all printed totals reconcile" if not origin_warnings and not total_note else "; ".join(origin_warnings + ([f"TOTAL GENERAL: {total_note}"] if total_note else []))
    print(f"Extracted {len(rows)} rows for {report_period}; {flagged} require row review; {control_message}.")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        raise SystemExit("Usage: extract_fondos_especiales.py INPUT.pdf OUTPUT.csv")
    main(Path(sys.argv[1]), Path(sys.argv[2]))
