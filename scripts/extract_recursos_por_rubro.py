#!/usr/bin/env python3
"""Extract RAFAM resource execution reports into auditable CSV files.

Only concept-level rows are exported. Printed subtotal rows are excluded to
avoid double counting. Every amount is preserved both as displayed text and
as exact integer cents.

Usage:
    python3 scripts/extract_recursos_por_rubro.py INPUT.pdf OUTPUT.csv
"""

import csv
import re
import subprocess
import sys
import tempfile
from decimal import Decimal, InvalidOperation
from pathlib import Path


COLUMNS = [
    "recurso_estimado",
    "modificaciones",
    "recurso_vigente",
    "recurso_devengado",
    "vigente_menos_devengado",
    "recurso_percibido",
    "devengado_menos_percibido",
]
AMOUNT = re.compile(r"-?[\d.]+,\d{2}")
PERIOD = re.compile(r"Del\s+\d{2}/\d{2}/\d{4}\s+al\s+(\d{2}/\d{2}/\d{4})")
HEADING = re.compile(r"^\s*(\d{2})\.(\d)\.00\.00\s+-\s+(.+?)\s*$")
MAJOR_HEADING = re.compile(r"^\s*(\d{2})\.0\.00\.00\s+-\s+(.+?)\s*$")
CONCEPT = re.compile(r"^\s*(\d{2}\.\d\.\d{2}\.\d{2})\s+-\s+")
PROCEDENCE = re.compile(r"(\d{2}\.00)\s*-\s*(.+)")


def cents(value: str) -> int:
    try:
        return int(Decimal(value.replace(".", "").replace(",", ".")) * 100)
    except InvalidOperation as error:
        raise ValueError(f"Invalid amount: {value!r}") from error


def normalize(value: str) -> str:
    return " ".join(value.split()).strip()


def validation_issues(values: list[int]) -> list[str]:
    estimated, modifications, current, accrued, current_less_accrued, perceived, accrued_less_perceived = values
    issues = []
    if current != estimated + modifications:
        issues.append("recurso_vigente_no_reconcilia")
    if current_less_accrued != current - accrued:
        issues.append("vigente_menos_devengado_no_reconcilia")
    if accrued_less_perceived != accrued - perceived:
        issues.append("devengado_menos_percibido_no_reconcilia")
    return issues


def append_continuation(row: dict, line: str, procedure_column: int | None) -> None:
    if procedure_column is None:
        return
    description = normalize(line[:procedure_column])
    procedure = normalize(line[procedure_column:])
    if description:
        row["rubro_nombre"] = normalize(f"{row['rubro_nombre']} {description}")
    if procedure:
        row["procedencia_nombre"] = normalize(f"{row['procedencia_nombre']} {procedure}")


def main(input_pdf: Path, output_csv: Path) -> None:
    with tempfile.TemporaryDirectory() as directory:
        text_path = Path(directory) / "report.txt"
        subprocess.run(["pdftotext", "-layout", str(input_pdf), str(text_path)], check=True)
        lines = text_path.read_text(encoding="utf-8").splitlines()

    report_period = None
    major_code = major_name = group_code = group_name = ""
    procedure_column = None
    rows = []
    pending = None
    pending_hierarchy = None
    grand_total = None

    for text_line, line in enumerate(lines, 1):
        if report_period is None:
            match = PERIOD.search(line)
            if match:
                report_period = match.group(1)

        if "Rubro - Descripción" in line and "Procedencia" in line:
            procedure_column = line.index("Procedencia")
            pending = None
            pending_hierarchy = None
            continue

        if not line.strip():
            pending = None
            pending_hierarchy = None
            continue

        major_match = MAJOR_HEADING.match(line)
        if major_match:
            major_code = f"{major_match.group(1)}.0.00.00"
            major_name = normalize(major_match.group(2))
            group_code = group_name = ""
            pending = None
            pending_hierarchy = "major"
            continue

        heading_match = HEADING.match(line)
        if heading_match:
            group_code = f"{heading_match.group(1)}.{heading_match.group(2)}.00.00"
            group_name = normalize(heading_match.group(3))
            pending = None
            pending_hierarchy = "group"
            continue

        amounts = AMOUNT.findall(line)
        if "TOTAL GENERAL" in line and len(amounts) == len(COLUMNS):
            grand_total = [cents(value) for value in amounts]
            pending = None
            pending_hierarchy = None
            continue

        concept_match = CONCEPT.match(line)
        if concept_match and len(amounts) == len(COLUMNS):
            if not all((report_period, major_code, major_name, group_code, group_name)):
                raise ValueError(f"Missing hierarchy near extracted line {text_line}")
            first_amount = AMOUNT.search(line)
            prefix = line[concept_match.end():first_amount.start()].rstrip()
            procedure_match = PROCEDENCE.search(prefix)
            if procedure_match:
                description = normalize(prefix[:procedure_match.start()])
                procedure_code = procedure_match.group(1)
                procedure_name = normalize(procedure_match.group(2))
                procedure_column = line.index(procedure_match.group(0))
            else:
                description = normalize(prefix)
                procedure_code = procedure_name = ""
            exact_values = [cents(value) for value in amounts]
            issues = validation_issues(exact_values)
            pending = {
                "fecha_corte": report_period,
                "rubro_mayor_codigo": major_code,
                "rubro_mayor_nombre": major_name,
                "rubro_grupo_codigo": group_code,
                "rubro_grupo_nombre": group_name,
                "rubro_codigo": concept_match.group(1),
                "rubro_nombre": description,
                "procedencia_codigo": procedure_code,
                "procedencia_nombre": procedure_name,
                "linea_texto_extraido": text_line,
                "revision_requerida": "si" if issues else "no",
                "motivos_revision": ";".join(issues),
            }
            for field, original, exact in zip(COLUMNS, amounts, exact_values):
                pending[f"{field}_texto"] = original
                pending[f"{field}_centavos"] = exact
            rows.append(pending)
            pending_hierarchy = None
            continue

        ignored_prefixes = ("Total ", "Filtro aplicado:", "R.A.F.A.M.", "ESTADO DE", "Municipalidad de", "Santa Fe", "Ejercicio:")
        if pending_hierarchy and not amounts and not line.lstrip().startswith(ignored_prefixes):
            if pending_hierarchy == "major":
                major_name = normalize(f"{major_name} {line}")
            else:
                group_name = normalize(f"{group_name} {line}")
            pending_hierarchy = None
        elif pending and not amounts and not line.lstrip().startswith(ignored_prefixes):
            append_continuation(pending, line, procedure_column)
        else:
            pending = None
            pending_hierarchy = None

    if not report_period:
        raise ValueError("Report period not found")
    if not rows:
        raise ValueError("No concept-level resource rows found")
    if grand_total is None:
        raise ValueError("Printed grand total not found")

    calculated_total = [sum(row[f"{field}_centavos"] for row in rows) for field in COLUMNS]
    differences = [calculated - printed for calculated, printed in zip(calculated_total, grand_total)]
    difference_note = ";".join(f"{field}={difference}" for field, difference in zip(COLUMNS, differences) if difference)
    for row in rows:
        row["total_general_reconcilia"] = "no" if difference_note else "si"
        row["diferencias_total_general_centavos"] = difference_note

    output_csv.parent.mkdir(parents=True, exist_ok=True)
    with output_csv.open("w", newline="", encoding="utf-8") as file:
        writer = csv.DictWriter(file, fieldnames=list(rows[0]))
        writer.writeheader()
        writer.writerows(rows)

    flagged = sum(row["revision_requerida"] == "si" for row in rows)
    total_status = "TOTAL GENERAL reconciles" if not difference_note else f"TOTAL GENERAL differs: {difference_note}"
    print(f"Extracted {len(rows)} rows for {report_period}; {flagged} require row review; {total_status}.")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        raise SystemExit("Usage: extract_recursos_por_rubro.py INPUT.pdf OUTPUT.csv")
    main(Path(sys.argv[1]), Path(sys.argv[2]))
