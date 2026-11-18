#!/usr/bin/env python3
"""Extract annual closing credit totals from Cuenta de Inversión PDFs.

The first consolidated resource-execution table is used because it prints the
three values needed for reconciliation: initial estimate, net modifications
and current estimate. The 2026 observation comes from the latest monthly
expense CSV and is deliberately labelled as a monthly cut, not an annual close.

Usage:
    python3 scripts/extract_credito_vigente_cierres.py OUTPUT.json \
      2020=CUENTA-2020.pdf ... 2025=CUENTA-2025.pdf \
      --monthly-2026 data/processed/gastos_por_objeto_2026-10-31.csv
"""

import argparse
import csv
import json
import re
import subprocess
import tempfile
from decimal import Decimal
from pathlib import Path


AMOUNT = re.compile(r"-?[\d.]+,\d{2}")
REPORT_TITLE = "ESTADO DE EJECUCION PRESUPUESTARIA DE RECURSOS"


def cents(value: str) -> int:
    return int(Decimal(value.replace(".", "").replace(",", ".")) * 100)


def extract_pdf(year: int, path: Path) -> dict:
    with tempfile.TemporaryDirectory() as directory:
        text_path = Path(directory) / "cuenta.txt"
        subprocess.run(["pdftotext", "-layout", str(path), str(text_path)], check=True)
        pages = text_path.read_text(encoding="utf-8").split("\f")

    for page_number, page in enumerate(pages, 1):
        if REPORT_TITLE not in page or "TOTAL GENERAL" not in page:
            continue
        total_line = next(line for line in page.splitlines() if "TOTAL GENERAL" in line)
        values = AMOUNT.findall(total_line)
        if len(values) < 3:
            raise ValueError(f"{year}: expected at least three totals on PDF page {page_number}")
        initial_text, modification_text, current_text = values[:3]
        initial, modification, current = map(cents, (initial_text, modification_text, current_text))
        if initial + modification != current:
            raise ValueError(f"{year}: initial plus modifications does not reconcile on PDF page {page_number}")
        return {
            "anio": year,
            "tipo_corte": "cierre_anual",
            "periodo_referencia": f"Cuenta de Inversión {year}",
            "credito_inicial_documento_texto": initial_text,
            "credito_inicial_documento_centavos": initial,
            "modificaciones_netas_texto": modification_text,
            "modificaciones_netas_centavos": modification,
            "credito_vigente_texto": current_text,
            "credito_vigente_centavos": current,
            "fuente": path.name,
            "pagina_pdf": page_number,
        }
    raise ValueError(f"{year}: consolidated resource-execution total not found")


def extract_monthly_2026(path: Path) -> dict:
    with path.open(encoding="utf-8", newline="") as source:
        rows = list(csv.DictReader(source))
    if not rows:
        raise ValueError("2026 monthly CSV has no rows")
    dates = {row["fecha_corte"] for row in rows}
    if len(dates) != 1:
        raise ValueError(f"2026 monthly CSV contains multiple dates: {sorted(dates)}")
    approved = sum(int(row["credito_aprobado_centavos"]) for row in rows)
    current = sum(int(row["credito_vigente_centavos"]) for row in rows)
    return {
        "anio": 2026,
        "tipo_corte": "corte_mensual",
        "periodo_referencia": f"Ejecución mensual al {next(iter(dates))}",
        "credito_inicial_documento_texto": None,
        "credito_inicial_documento_centavos": approved,
        "modificaciones_netas_texto": None,
        "modificaciones_netas_centavos": current - approved,
        "credito_vigente_texto": None,
        "credito_vigente_centavos": current,
        "fuente": path.name,
        "pagina_pdf": None,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("output", type=Path)
    parser.add_argument("pdfs", nargs="+", help="YEAR=PATH entries for 2020 through 2025")
    parser.add_argument("--monthly-2026", required=True, type=Path)
    args = parser.parse_args()

    pdfs = {}
    for entry in args.pdfs:
        year_text, separator, path_text = entry.partition("=")
        if not separator:
            raise ValueError(f"Invalid PDF argument: {entry}")
        pdfs[int(year_text)] = Path(path_text)
    expected = set(range(2020, 2026))
    if set(pdfs) != expected:
        raise ValueError(f"Expected PDF years {sorted(expected)}, received {sorted(pdfs)}")

    records = [extract_pdf(year, pdfs[year]) for year in sorted(pdfs)]
    records.append(extract_monthly_2026(args.monthly_2026))
    output = {
        "meta": {
            "descripcion": "Crédito vigente al cierre anual 2020–2025 y último corte mensual 2026",
            "criterio": "El cierre anual surge del total general del Estado de Ejecución Presupuestaria de Recursos de cada Cuenta de Inversión. El dato 2026 es provisorio y corresponde al último informe mensual disponible.",
        },
        "cierres": records,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(output, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print("\n".join(f"{row['anio']}: {row['credito_vigente_centavos']} cents ({row['periodo_referencia']})" for row in records))


if __name__ == "__main__":
    main()
