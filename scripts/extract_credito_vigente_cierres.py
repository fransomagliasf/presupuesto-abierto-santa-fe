#!/usr/bin/env python3
"""Extract annual closing credit totals and functions from Cuenta de Inversión PDFs.

The first consolidated resource-execution table is used because it prints the
three values needed for reconciliation: initial estimate, net modifications
and current estimate. The consolidated finality/function table provides the
same values for each function. The 2026 observation comes from the latest
monthly expense CSV and is deliberately labelled as a monthly cut, not an
annual close; it has no comparable function breakdown.

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
FUNCTION_REPORT_TITLE = "(POR FINALIDAD Y FUNCIÓN)"
JURISDICTION_REPORT_TITLE = "(POR CATEGORIA PROGRAMATICA)"
FINALITY_LINE = re.compile(r"^\s*(\d{3})\s+-\s+([^\d].*?)\s*$")
FUNCTION_LINE = re.compile(
    r"^\s+(\d{3})\s+(.+?)\s+(-?[\d.]+,\d{2})\s+(-?[\d.]+,\d{2})\s+(-?[\d.]+,\d{2})(?:\s|$)"
)
JURISDICTION_LINE = re.compile(r"Jurisdicción:\s*(\d{10})\s*-\s*(.*?)\s*$")
TOTAL_LINE = re.compile(
    r"^\s*Total\s+(.+?)\s+(-?[\d.]+,\d{2})\s+(-?[\d.]+,\d{2})\s+(-?[\d.]+,\d{2})(?:\s|$)"
)


def cents(value: str) -> int:
    return int(Decimal(value.replace(".", "").replace(",", ".")) * 100)


def extract_functions(year: int, path: Path, pages: list[str], expected_total: int) -> list[dict]:
    start = next(
        (
            index
            for index, page in enumerate(pages)
            if FUNCTION_REPORT_TITLE in page
            and "Municipalidad de" in page
            and "Hoja: 1 de" in page
        ),
        None,
    )
    if start is None:
        raise ValueError(f"{year}: consolidated finality/function table not found")

    table_pages = []
    for index in range(start, len(pages)):
        page = pages[index]
        if index > start and FUNCTION_REPORT_TITLE not in page:
            break
        table_pages.append((index + 1, page))
        if "Totales Generales" in page:
            break

    rows = []
    finality_code = None
    finality_name = None
    for page_number, page in table_pages:
        for line in page.splitlines():
            finality_match = FINALITY_LINE.match(line)
            if finality_match and finality_match.group(1).endswith("00"):
                finality_code, finality_name = finality_match.groups()
                continue
            function_match = FUNCTION_LINE.match(line)
            if not function_match:
                continue
            code, name, approved_text, modifications_text, current_text = function_match.groups()
            approved, modifications, current = map(cents, (approved_text, modifications_text, current_text))
            if approved + modifications != current:
                raise ValueError(f"{year}, function {code}: approved plus modifications does not reconcile")
            rows.append(
                {
                    "anio": year,
                    "finalidad_codigo": finality_code,
                    "finalidad_nombre": finality_name,
                    "funcion_codigo": code,
                    "funcion_nombre": name.replace("servivicios", "servicios"),
                    "credito_aprobado_documento_centavos": approved,
                    "modificaciones_netas_centavos": modifications,
                    "credito_vigente_centavos": current,
                    "fuente": path.name,
                    "pagina_pdf": page_number,
                }
            )

    codes = [row["funcion_codigo"] for row in rows]
    if not rows or len(codes) != len(set(codes)):
        raise ValueError(f"{year}: missing or duplicated functions in consolidated table")
    actual_total = sum(row["credito_vigente_centavos"] for row in rows)
    if actual_total != expected_total:
        raise ValueError(f"{year}: function current total {actual_total} does not match closing total {expected_total}")
    return rows


def extract_jurisdictions(year: int, path: Path, pages: list[str], expected_total: int) -> list[dict]:
    start = next(
        (
            index
            for index, page in enumerate(pages)
            if JURISDICTION_REPORT_TITLE in page
            and "Municipalidad de" in page
            and "Hoja: 1 de" in page
        ),
        None,
    )
    if start is None:
        raise ValueError(f"{year}: consolidated programmatic jurisdiction table not found")

    rows = []
    current = None
    candidate = None

    def append_current() -> None:
        nonlocal candidate
        if current is None or candidate is None:
            return
        approved_text, modifications_text, current_text, page_number = candidate
        approved, modifications, current_credit = map(cents, (approved_text, modifications_text, current_text))
        if approved + modifications != current_credit:
            raise ValueError(f"{year}, jurisdiction {current[0]}: approved plus modifications does not reconcile")
        rows.append(
            {
                "anio": year,
                "jurisdiccion_codigo": current[0],
                "jurisdiccion_nombre": current[1],
                "credito_aprobado_documento_centavos": approved,
                "modificaciones_netas_centavos": modifications,
                "credito_vigente_centavos": current_credit,
                "fuente": path.name,
                "pagina_pdf": page_number,
            }
        )
        candidate = None

    for index in range(start, len(pages)):
        page = pages[index]
        if index > start and JURISDICTION_REPORT_TITLE not in page:
            break
        for line in page.splitlines():
            jurisdiction_match = JURISDICTION_LINE.search(line)
            if jurisdiction_match:
                append_current()
                current = jurisdiction_match.groups()
                candidate = None
                continue
            total_match = TOTAL_LINE.match(line)
            if current is not None and total_match:
                candidate = (*total_match.groups()[1:4], index + 1)
        if "TOTALES GENERALES" in page:
            append_current()
            break

    codes = [row["jurisdiccion_codigo"] for row in rows]
    if not rows or len(codes) != len(set(codes)):
        raise ValueError(f"{year}: missing or duplicated jurisdictions in consolidated table")
    actual_total = sum(row["credito_vigente_centavos"] for row in rows)
    if actual_total != expected_total:
        raise ValueError(f"{year}: jurisdiction current total {actual_total} does not match closing total {expected_total}")
    return rows


def extract_pdf(year: int, path: Path) -> tuple[dict, list[dict], list[dict]]:
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
        closing = {
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
        return closing, extract_functions(year, path, pages, current), extract_jurisdictions(year, path, pages, current)
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

    extracted = [extract_pdf(year, pdfs[year]) for year in sorted(pdfs)]
    records = [closing for closing, _, _ in extracted]
    functions = [row for _, rows, _ in extracted for row in rows]
    jurisdictions = [row for _, _, rows in extracted for row in rows]
    records.append(extract_monthly_2026(args.monthly_2026))
    output = {
        "meta": {
            "descripcion": "Crédito vigente total, por finalidad/función y por jurisdicción al cierre anual 2020–2025, más el último corte mensual total de 2026",
            "criterio": "El cierre anual surge del total general de recursos y de los cuadros de gastos por finalidad/función y categoría programática de cada Cuenta de Inversión. El dato 2026 es provisorio y corresponde al último informe mensual disponible.",
        },
        "cierres": records,
        "finalidad_funcion": functions,
        "jurisdicciones": jurisdictions,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(output, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print("\n".join(f"{row['anio']}: {row['credito_vigente_centavos']} cents ({row['periodo_referencia']})" for row in records))


if __name__ == "__main__":
    main()
