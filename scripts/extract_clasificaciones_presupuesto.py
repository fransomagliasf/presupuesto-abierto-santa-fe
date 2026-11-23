#!/usr/bin/env python3
"""Extrae objeto del gasto y carácter económico para 2020–2027.

Para 2020–2025 toma la columna Crédito Aprobado de la primera tabla
consolidada de cada Cuenta de Inversión. Para 2026 y 2027 toma el monto
presupuestado de los documentos de presupuesto. Cada clasificación se
valida contra el total impreso en su propia fuente.
"""

import argparse
import json
import re
import subprocess
import tempfile
import unicodedata
from pathlib import Path


AMOUNT = re.compile(r"-?[\d.]+,\d{2}")

OBJECTS = [
    ("1.0.0.0", "Gastos en personal", "gastos en personal"),
    ("2.0.0.0", "Bienes de consumo", "bienes de consumo"),
    ("3.0.0.0", "Servicios no personales", "servicios no personales"),
    ("4.0.0.0", "Bienes de uso", "bienes de uso"),
    ("5.0.0.0", "Transferencias", "transferencias"),
    ("6.0.0.0", "Activos financieros", "activos financieros"),
    ("7.0.0.0", "Servicio de la deuda y disminución de otros pasivos", "servicio de la deuda y disminucion"),
    ("9.0.0.0", "Gastos figurativos", "gastos figurativos"),
]

ECONOMIC = [
    ("2121000", "Remuneraciones", "Gastos corrientes", "total remuneraciones"),
    ("2122000", "Bienes y servicios", "Gastos corrientes", "total bienes y servicios"),
    ("2131000", "Intereses", "Gastos corrientes", "total intereses"),
    ("2132000", "Otras rentas de la propiedad", "Gastos corrientes", "derechos sobre bienes intangibles"),
    ("2140000", "Prestaciones de la seguridad social", "Gastos corrientes", "prestaciones de la seguridad social"),
    ("2150000", "Impuestos directos", "Gastos corrientes", "impuestos directos"),
    ("2170000", "Transferencias corrientes", "Gastos corrientes", "total transferencias corrientes"),
    ("2180000", "Gastos figurativos corrientes", "Gastos corrientes", "total gastos figurativos"),
    ("2210000", "Inversión real directa", "Gastos de capital", "total inversion real directa"),
    ("2220000", "Transferencias de capital", "Gastos de capital", "total transferencias de capital"),
    ("2230000", "Inversión financiera", "Gastos de capital", "total inversion financiera"),
    ("2240000", "Gastos figurativos de capital", "Gastos de capital", "total gastos figurativos"),
    ("2300000", "Aplicaciones financieras", "Aplicaciones financieras", "total aplicaciones financieras"),
]


def cents(value: str) -> int:
    return int(value.replace(".", "").replace(",", ""))


def normalize(value: str) -> str:
    value = "".join(character for character in unicodedata.normalize("NFD", value) if unicodedata.category(character) != "Mn")
    return " ".join(value.lower().split())


def pdf_pages(path: Path) -> list[str]:
    with tempfile.TemporaryDirectory() as directory:
        output = Path(directory) / "source.txt"
        subprocess.run(["pdftotext", "-layout", str(path), str(output)], check=True)
        return output.read_text(encoding="utf-8", errors="replace").split("\f")


def report_pages(pages: list[str], title: str, budget: bool) -> list[str]:
    start = next(
        index
        for index, page in enumerate(pages)
        if title in normalize(page)
        and "municipalidad de" in normalize(page)
        and (
            "presupuesto de gastos" in normalize(page)
            if budget
            else "estado de ejecucion" in normalize(page) and "de gastos" in normalize(page)
        )
        and ("hoja: 1 de" in normalize(page) or title == "por objeto")
    )
    selected = []
    for page in pages[start : start + 20]:
        page_normalized = normalize(page)
        if selected and title not in page_normalized:
            break
        selected.append(page)
        if (budget and ("total presupuesto" in page_normalized or "total general" in page_normalized)) or (not budget and "totales generales" in page_normalized):
            break
    return selected


def amount_for(lines: list[str], pattern: str, occurrence: int = 0, require_total: bool = True) -> tuple[str, int]:
    candidates = []
    for line in lines:
        normalized = normalize(line)
        if pattern not in normalized and pattern.replace(" ", "") not in normalized.replace(" ", ""):
            continue
        if not AMOUNT.search(line):
            continue
        if require_total and "total" not in normalized:
            continue
        candidates.append(line)
    if len(candidates) <= occurrence:
        raise ValueError(f"No se encontró '{pattern}' (ocurrencia {occurrence + 1})")
    text = AMOUNT.search(candidates[occurrence]).group()
    return text, cents(text)


def extract_objects(year: int, path: Path, pages: list[str], budget: bool) -> tuple[list[dict], int]:
    selected = report_pages(pages, "por objeto", budget)
    lines = [line for page in selected for line in page.splitlines()]
    rows = []
    for code, name, pattern in OBJECTS:
        if budget:
            line = next(line for line in lines if normalize(line).startswith(f"{code} -") and AMOUNT.search(line))
            text = AMOUNT.search(line).group()
            value = cents(text)
        else:
            if code in {"5.0.0.0", "9.0.0.0"}:
                exact_label = "Transferencias" if code == "5.0.0.0" else "Gastos figurativos"
                line = next(line for line in lines if re.match(rf"^\s*Total\s+{exact_label}\s+-?[\d.]", line, re.IGNORECASE))
                text = AMOUNT.search(line).group()
                value = cents(text)
            else:
                text, value = amount_for(lines, f"total {pattern}")
        rows.append({"anio": year, "codigo": code, "nombre": name, "monto_texto": text, "monto_centavos": value})
    total = sum(row["monto_centavos"] for row in rows)
    total_pattern = "total general" if budget else "totales generales"
    total_text, printed_total = amount_for(lines, total_pattern, require_total=False)
    if total != printed_total:
        raise ValueError(f"{year}: objeto suma {total}, total impreso {printed_total} ({total_text})")
    return rows, total


def extract_economic(year: int, path: Path, pages: list[str], budget: bool) -> tuple[list[dict], int]:
    selected = report_pages(pages, "por caracter economico", budget)
    lines = [line for page in selected for line in page.splitlines()]
    rows = []
    figurative_occurrence = 0
    for code, name, group, pattern in ECONOMIC:
        occurrence = figurative_occurrence if pattern == "total gastos figurativos" else 0
        if pattern == "total gastos figurativos":
            figurative_occurrence += 1
        try:
            text, value = amount_for(lines, pattern, occurrence=occurrence)
        except ValueError:
            if pattern == "prestaciones de la seguridad social":
                text, value = amount_for(lines, pattern, require_total=False)
            elif pattern in {"impuestos directos", "derechos sobre bienes intangibles", "total transferencias de capital"}:
                try:
                    text, value = amount_for(lines, pattern, require_total=False)
                except ValueError:
                    text, value = "0,00", 0
            else:
                raise
        rows.append({"anio": year, "codigo": code, "nombre": name, "grupo": group, "monto_texto": text, "monto_centavos": value})
    total = sum(row["monto_centavos"] for row in rows)
    total_line = next(
        line
        for line in lines
        if re.match(r"^\s*Total\s+GASTOS\s+-?[\d.]", line, re.IGNORECASE)
    )
    total_text = AMOUNT.search(total_line).group()
    printed_total = cents(total_text)
    if total != printed_total:
        raise ValueError(f"{year}: carácter económico suma {total}, total impreso {printed_total} ({total_text})")
    return rows, total


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("output", type=Path)
    parser.add_argument("sources", nargs="+", help="YEAR=TYPE=PATH; TYPE es cuenta, presupuesto o proyecto")
    args = parser.parse_args()
    sources = []
    for entry in args.sources:
        year_text, source_type, path_text = entry.split("=", 2)
        sources.append((int(year_text), source_type, Path(path_text)))
    if {year for year, _, _ in sources} != set(range(2020, 2028)):
        raise ValueError("Se requieren las fuentes 2020–2027")

    object_rows, economic_rows, totals = [], [], []
    for year, source_type, path in sorted(sources):
        budget = source_type in {"presupuesto", "proyecto"}
        pages = pdf_pages(path)
        objects, object_total = extract_objects(year, path, pages, budget)
        economic, economic_total = extract_economic(year, path, pages, budget)
        if object_total != economic_total:
            raise ValueError(f"{year}: objeto {object_total} no coincide con carácter económico {economic_total}")
        row_source = {
            "fuente": path.name,
            "tipo_fuente": source_type,
            "criterio": "Crédito aprobado informado en la Cuenta de Inversión" if source_type == "cuenta" else "Presupuesto aprobado" if source_type == "presupuesto" else "Proyecto de Presupuesto",
        }
        object_rows.extend([{**row, **row_source} for row in objects])
        economic_rows.extend([{**row, **row_source} for row in economic])
        totals.append({"anio": year, "monto_centavos": object_total, **row_source})
        print(f"{year}: {object_total} centavos")

    output = {
        "meta": {
            "descripcion": "Composición del presupuesto de gastos por objeto y por carácter económico, 2020–2027",
            "advertencia": "Para 2020–2025 se conserva el Crédito Aprobado publicado en cada Cuenta de Inversión. En 2020, 2023 y 2025 ese total difiere del cuadro histórico por finalidad y función; para no mezclar bases, cada clasificación se valida contra el total de la misma Cuenta. En 2020 la diferencia principal responde a la reconducción registrada. 2027 corresponde al proyecto.",
        },
        "totales": totals,
        "objeto_gasto": object_rows,
        "caracter_economico": economic_rows,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(output, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
