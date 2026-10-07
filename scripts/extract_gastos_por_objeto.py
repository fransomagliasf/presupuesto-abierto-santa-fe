#!/usr/bin/env python3
"""Extract RAFAM "Estado de Ejecución del Presupuesto de Gastos" PDFs to CSV.

The report is exported as positioned text.  This extractor retains every
reported amount both as its original Spanish-formatted text and as integer
cents, avoiding floating-point conversions.  It only exports detailed
"Objeto del Gasto" rows; report totals are deliberately excluded because
they duplicate the same facts at higher aggregation levels.

Usage:
    python3 scripts/extract_gastos_por_objeto.py INPUT.pdf OUTPUT.csv
"""

import csv
import re
import subprocess
import sys
import tempfile
from decimal import Decimal, InvalidOperation
from pathlib import Path


COLUMNS = [
    ("credito_aprobado", "Crédito aprobado"),
    ("modificaciones", "Modificaciones"),
    ("credito_vigente", "Crédito vigente"),
    ("preventivo", "Preventivo"),
    ("compromiso", "Compromiso"),
    ("devengado", "Devengado"),
    ("pagado", "Pagado"),
    ("credito_disponible", "Crédito disponible"),
    ("credito_vigente_menos_devengado", "Crédito vigente - devengado"),
    ("devengado_no_pagado", "Devengado no pagado"),
]
AMOUNT = re.compile(r"-?[\d.]+,\d{2}")
OBJECT = re.compile(r"^\s+(\d\.\d\.\d\.\d)\s+-\s+(.*?)\s+(-?[\d.]+,\d{2}(?:\s+-?[\d.]+,\d{2}){9})\s*$")
JURISDICTION = re.compile(r"^Jurisdicción:\s+(\d+)\s+-\s+(.+?)\s*$")
PROGRAM = re.compile(r"^Apertura Programática:\s+(\S+)\s+-\s+(.+?)\s*$")
SOURCE = re.compile(r"^\s+(\d{3})\s+-\s+(.+?)\s*$")
PERIOD = re.compile(r"Del\s+(\d{2}/\d{2}/\d{4})\s+al\s+(\d{2}/\d{2}/\d{4})")


def cents(value: str) -> int:
    """Turn a Spanish-formatted monetary value into exact integer cents."""
    try:
        return int(Decimal(value.replace(".", "").replace(",", ".")) * 100)
    except InvalidOperation as error:
        raise ValueError(f"Invalid amount: {value!r}") from error


def validate(values: list[int]) -> str:
    """Return semicolon-separated invariants that do not reconcile exactly."""
    approved, modifications, current, preventive, committed, accrued, paid, available, current_minus_accrued, accrued_unpaid = values
    issues = []
    if current != approved + modifications:
        issues.append("credito_vigente_no_reconcilia")
    if available != current - preventive - committed:
        issues.append("credito_disponible_no_reconcilia")
    if current_minus_accrued != current - accrued:
        issues.append("credito_vigente_menos_devengado_no_reconcilia")
    if accrued_unpaid != accrued - paid:
        issues.append("devengado_no_pagado_no_reconcilia")
    return ";".join(issues)


def main(input_pdf: Path, output_csv: Path) -> None:
    with tempfile.TemporaryDirectory() as directory:
        text_path = Path(directory) / "report.txt"
        subprocess.run(["pdftotext", "-layout", str(input_pdf), str(text_path)], check=True)
        lines = text_path.read_text(encoding="utf-8").splitlines()

    report_period = None
    jurisdiction = program = source = None
    rows = []
    for text_line, line in enumerate(lines, 1):
        if report_period is None:
            match = PERIOD.search(line)
            if match:
                report_period = match.group(2)
        match = JURISDICTION.match(line)
        if match:
            jurisdiction = match.groups()
            continue
        match = PROGRAM.match(line)
        if match:
            program = match.groups()
            continue
        match = SOURCE.match(line)
        if match:
            source = match.groups()
            continue
        match = OBJECT.match(line)
        if not match:
            continue
        if not all((report_period, jurisdiction, program, source)):
            raise ValueError(f"Missing report context near extracted line {text_line}")
        object_code, object_name, amounts_text = match.groups()
        amounts = AMOUNT.findall(amounts_text)
        if len(amounts) != len(COLUMNS):
            raise ValueError(f"Expected 10 amounts near extracted line {text_line}")
        amounts_cents = [cents(value) for value in amounts]
        row = {
            "fecha_corte": report_period,
            "jurisdiccion_codigo": jurisdiction[0],
            "jurisdiccion_nombre": jurisdiction[1],
            "programa_codigo": program[0],
            "programa_nombre": program[1],
            "fuente_financiamiento_codigo": source[0],
            "fuente_financiamiento_nombre": source[1],
            "objeto_gasto_codigo": object_code,
            "objeto_gasto_nombre": object_name,
            "linea_texto_extraido": text_line,
            "revision_requerida": "si" if validate(amounts_cents) else "no",
            "motivos_revision": validate(amounts_cents),
        }
        for (field, _label), original, exact_cents in zip(COLUMNS, amounts, amounts_cents):
            row[f"{field}_texto"] = original
            row[f"{field}_centavos"] = exact_cents
        rows.append(row)

    if not rows:
        raise ValueError("No detailed Objeto del Gasto rows found")
    output_csv.parent.mkdir(parents=True, exist_ok=True)
    fields = list(rows[0])
    with output_csv.open("w", newline="", encoding="utf-8") as file:
        writer = csv.DictWriter(file, fieldnames=fields)
        writer.writeheader()
        writer.writerows(rows)
    print(f"Extracted {len(rows)} rows for {report_period}; {sum(row['revision_requerida'] == 'si' for row in rows)} require review.")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        raise SystemExit("Usage: extract_gastos_por_objeto.py INPUT.pdf OUTPUT.csv")
    main(Path(sys.argv[1]), Path(sys.argv[2]))
