#!/usr/bin/env python3
"""Extract RAFAM expense execution by financing source to CSV.

Usage:
    python3 scripts/extract_gastos_por_fuente.py INPUT.pdf OUTPUT.csv
"""

import csv
import re
import subprocess
import sys
import tempfile
from decimal import Decimal, InvalidOperation
from pathlib import Path


COLUMNS = [
    "credito_aprobado",
    "modificaciones",
    "credito_vigente",
    "preventivo",
    "compromiso",
    "devengado",
    "pagado",
    "credito_disponible",
    "credito_vigente_menos_devengado",
    "devengado_no_pagado",
]
AMOUNT = re.compile(r"-?[\d.]+,\d{2}")
PERIOD = re.compile(r"Del\s+\d{2}/\d{2}/\d{4}\s+al\s+(\d{2}/\d{2}/\d{4})")
SOURCE = re.compile(r"^\s*(\d{3})\s+-\s+")


def cents(value: str) -> int:
    try:
        return int(Decimal(value.replace(".", "").replace(",", ".")) * 100)
    except InvalidOperation as error:
        raise ValueError(f"Invalid amount: {value!r}") from error


def normalize(value: str) -> str:
    return " ".join(value.split()).strip()


def validate(values: list[int]) -> list[str]:
    approved, modifications, current, preventive, committed, accrued, paid, available, current_less_accrued, accrued_unpaid = values
    checks = [
        (approved + modifications == current, "credito_vigente_no_reconcilia"),
        (current - preventive - committed == available, "credito_disponible_no_reconcilia"),
        (current - accrued == current_less_accrued, "credito_vigente_menos_devengado_no_reconcilia"),
        (accrued - paid == accrued_unpaid, "devengado_no_pagado_no_reconcilia"),
    ]
    return [message for valid, message in checks if not valid]


def main(input_pdf: Path, output_csv: Path) -> None:
    with tempfile.TemporaryDirectory() as directory:
        text_path = Path(directory) / "report.txt"
        subprocess.run(["pdftotext", "-layout", str(input_pdf), str(text_path)], check=True)
        lines = text_path.read_text(encoding="utf-8").splitlines()

    report_period = None
    rows = []
    printed_total = None

    for text_line, line in enumerate(lines, 1):
        if report_period is None:
            match = PERIOD.search(line)
            if match:
                report_period = match.group(1)

        amounts = AMOUNT.findall(line)
        if "TOTALES GENERALES" in line and len(amounts) == len(COLUMNS):
            printed_total = [cents(value) for value in amounts]
            continue

        source_match = SOURCE.match(line)
        if not source_match or len(amounts) != len(COLUMNS):
            continue
        if not report_period:
            raise ValueError(f"Missing report period near extracted line {text_line}")

        first_amount = AMOUNT.search(line)
        source_name = normalize(line[source_match.end():first_amount.start()])
        exact_values = [cents(value) for value in amounts]
        issues = validate(exact_values)
        row = {
            "fecha_corte": report_period,
            "fuente_codigo": source_match.group(1),
            "fuente_nombre": source_name,
            "linea_texto_extraido": text_line,
            "revision_requerida": "si" if issues else "no",
            "motivos_revision": ";".join(issues),
        }
        for field, original, exact in zip(COLUMNS, amounts, exact_values):
            row[f"{field}_texto"] = original
            row[f"{field}_centavos"] = exact
        rows.append(row)

    if not report_period:
        raise ValueError("Report period not found")
    if not rows:
        raise ValueError("No financing-source rows found")
    if printed_total is None:
        raise ValueError("Printed grand total not found")

    calculated_total = [sum(row[f"{field}_centavos"] for row in rows) for field in COLUMNS]
    differences = [actual - expected for actual, expected in zip(calculated_total, printed_total)]
    total_note = ";".join(f"{field}={difference}" for field, difference in zip(COLUMNS, differences) if difference)
    for row in rows:
        row["total_general_reconcilia"] = "no" if total_note else "si"
        row["diferencias_total_general_centavos"] = total_note

    output_csv.parent.mkdir(parents=True, exist_ok=True)
    with output_csv.open("w", newline="", encoding="utf-8") as file:
        writer = csv.DictWriter(file, fieldnames=list(rows[0]), lineterminator="\n")
        writer.writeheader()
        writer.writerows(rows)

    flagged = sum(row["revision_requerida"] == "si" for row in rows)
    control = "printed total reconciles" if not total_note else f"TOTAL GENERAL: {total_note}"
    print(f"Extracted {len(rows)} rows for {report_period}; {flagged} require row review; {control}.")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        raise SystemExit("Usage: extract_gastos_por_fuente.py INPUT.pdf OUTPUT.csv")
    main(Path(sys.argv[1]), Path(sys.argv[2]))
