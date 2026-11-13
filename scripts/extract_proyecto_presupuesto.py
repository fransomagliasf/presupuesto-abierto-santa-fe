#!/usr/bin/env python3
"""Extract comparable annual-budget aggregates from the municipal RAFAM PDF.

The output keeps annual project data separate from monthly execution data. It
extracts resources by concept, expenses by program and object, and financing
sources. Every classification must reconcile exactly with the printed total.

Usage:
    python3 scripts/extract_proyecto_presupuesto.py INPUT.pdf OUTPUT.json
"""

import json
import re
import subprocess
import sys
import tempfile
from decimal import Decimal
from pathlib import Path


AMOUNT = re.compile(r"-?[\d.]+,\d{2}")
EXPECTED_TOTAL_CENTS = 41_183_139_377_700
SOURCE_NAME = "Mensaje 22 Presupuesto 2027.pdf"


def cents(value: str) -> int:
    return int(Decimal(value.replace(".", "").replace(",", ".")) * 100)


def normalize(value: str) -> str:
    return " ".join(value.split()).strip()


def dotted_resource_code(code: str) -> str:
    return f"{code[:2]}.{code[2]}.{code[3:5]}.{code[5:]}"


def extract_pages(input_pdf: Path) -> list[str]:
    with tempfile.TemporaryDirectory() as directory:
        text_path = Path(directory) / "project.txt"
        subprocess.run(["pdftotext", "-layout", str(input_pdf), str(text_path)], check=True)
        return text_path.read_text(encoding="utf-8").split("\f")


def extract_resources(pages: list[str]) -> list[dict]:
    rows = []
    major = group = pending = None

    def finish_pending() -> None:
        nonlocal pending
        if pending:
            pending["rubro_nombre"] = normalize(pending["rubro_nombre"])
            rows.append(pending)
            pending = None

    ignored = re.compile(r"^(Total |Filtro aplicado:|R\.A\.F\.A\.M\.|Municipalidad de|Santa Fe|Presupuesto:|Recurso\s+Recurso|Inicial:|Modificaciones|Vigente|Total General)")
    for page_number in range(6, 9):
        for line_number, line in enumerate(pages[page_number - 1].splitlines(), 1):
            match = re.match(r"^\s*(\d{7})\s*-\s*(.*)$", line)
            if match:
                finish_pending()
                code, remainder = match.groups()
                amount_matches = list(AMOUNT.finditer(remainder))
                name = normalize(remainder[: amount_matches[0].start()] if amount_matches else remainder)
                if code.endswith("00000"):
                    major = {"code": dotted_resource_code(code), "name": name}
                    group = None
                elif code.endswith("0000"):
                    group = {"code": dotted_resource_code(code), "name": name}
                else:
                    if not (major and group and amount_matches):
                        raise ValueError(f"Incomplete resource hierarchy on PDF page {page_number}, line {line_number}")
                    amount_text = amount_matches[0].group(0)
                    pending = {
                        "rubro_mayor_codigo": major["code"],
                        "rubro_mayor_nombre": major["name"],
                        "rubro_grupo_codigo": group["code"],
                        "rubro_grupo_nombre": group["name"],
                        "rubro_codigo": dotted_resource_code(code),
                        "rubro_nombre": name,
                        "monto_texto": amount_text,
                        "monto_centavos": cents(amount_text),
                        "pagina_fuente": page_number,
                    }
                continue

            if pending:
                stripped = line.strip()
                if stripped and not ignored.match(stripped) and not AMOUNT.search(stripped):
                    pending["rubro_nombre"] = f"{pending['rubro_nombre']} {stripped}"
                elif stripped:
                    finish_pending()
        finish_pending()
    return rows


def extract_programs(pages: list[str]) -> list[dict]:
    rows = []
    jurisdiction = pending = None
    ignored = re.compile(r"^(Total |Filtro aplicado:|R\.A\.F\.A\.M\.|LISTADO|Municipalidad|Santa Fe|POR ESTRUCTURA|Presupuesto:|Jurisdicción)")
    for page_number in range(21, 34):
        for line_number, line in enumerate(pages[page_number - 1].splitlines(), 1):
            jurisdiction_match = re.match(r"^\s*(\d{10})\s+-\s+(.+?)\s*$", line)
            if jurisdiction_match and not AMOUNT.search(jurisdiction_match.group(2)):
                jurisdiction = {"jurisdiccion_codigo": jurisdiction_match.group(1), "jurisdiccion_nombre": normalize(jurisdiction_match.group(2))}
                pending = None
                continue

            program_match = re.match(r"^\s*(\d{2}\.\d{2}\.\d{2})\s+-\s+(.+?)\s*$", line)
            if program_match:
                if not jurisdiction:
                    raise ValueError(f"Program without jurisdiction on PDF page {page_number}, line {line_number}")
                program_code, remainder = program_match.groups()
                amount_match = re.match(r"^(.*?)(-?[\d.]+,\d{2})\s*$", remainder)
                if amount_match:
                    name, amount_text = amount_match.groups()
                    rows.append({**jurisdiction, "programa_codigo": program_code, "programa_nombre": normalize(name), "monto_texto": amount_text, "monto_centavos": cents(amount_text), "pagina_fuente": page_number})
                    pending = None
                else:
                    pending = {**jurisdiction, "programa_codigo": program_code, "programa_nombre": normalize(remainder), "pagina_fuente": page_number}
                continue

            if pending:
                stripped = line.strip()
                amount_only = re.match(r"^(-?[\d.]+,\d{2})$", stripped)
                amount_at_end = re.match(r"^(.*?)(-?[\d.]+,\d{2})\s*$", stripped)
                if amount_only:
                    amount_text = amount_only.group(1)
                    rows.append({**pending, "monto_texto": amount_text, "monto_centavos": cents(amount_text)})
                    pending = None
                elif amount_at_end:
                    continuation, amount_text = amount_at_end.groups()
                    pending["programa_nombre"] = normalize(f"{pending['programa_nombre']} {continuation}")
                    rows.append({**pending, "monto_texto": amount_text, "monto_centavos": cents(amount_text)})
                    pending = None
                elif stripped and not ignored.match(stripped):
                    pending["programa_nombre"] = normalize(f"{pending['programa_nombre']} {stripped}")
    if pending:
        raise ValueError("Unfinished program row at end of program section")
    return rows


def extract_objects(pages: list[str]) -> list[dict]:
    rows = []
    for line_number, line in enumerate(pages[9].splitlines(), 1):
        match = re.match(r"^\s+(\d\.\d\.\d\.\d)\s+-\s+(.*?)\s+(-?[\d.]+,\d{2})\s*$", line)
        if not match:
            continue
        code, name, amount_text = match.groups()
        rows.append({"objeto_codigo": code, "objeto_nombre": normalize(name), "monto_texto": amount_text, "monto_centavos": cents(amount_text), "pagina_fuente": 10})
    return rows


def extract_financing(pages: list[str]) -> list[dict]:
    rows = []
    for line_number, line in enumerate(pages[10].splitlines(), 1):
        match = re.match(r"^\s+(\d{3})\s+-\s+(.*?)\s+(-?[\d.]+,\d{2})\s*$", line)
        if not match:
            continue
        code, name, amount_text = match.groups()
        rows.append({"fuente_codigo": code, "fuente_nombre": normalize(name), "monto_texto": amount_text, "monto_centavos": cents(amount_text), "pagina_fuente": 11})
    return rows


def validate_total(label: str, rows: list[dict]) -> None:
    total = sum(row["monto_centavos"] for row in rows)
    if total != EXPECTED_TOTAL_CENTS:
        raise ValueError(f"{label} does not reconcile: {total} != {EXPECTED_TOTAL_CENTS}")


def main(input_pdf: Path, output_json: Path) -> None:
    pages = extract_pages(input_pdf)
    if len(pages) < 313:
        raise ValueError(f"Expected at least 313 pages, found {len(pages)}")
    resources = extract_resources(pages)
    programs = extract_programs(pages)
    objects = extract_objects(pages)
    financing = extract_financing(pages)
    for label, rows in (("resources", resources), ("programs", programs), ("objects", objects), ("financing", financing)):
        validate_total(label, rows)

    output = {
        "meta": {
            "anio": 2027,
            "tipo": "Proyecto de Presupuesto",
            "fuente": SOURCE_NAME,
            "total_centavos": EXPECTED_TOTAL_CENTS,
            "paginas": {"recursos": "6–8", "objetos": "10", "fuentes": "11", "programas": "21–33"},
            "limitaciones": [
                "El proyecto anual no informa ejecución, devengado, pagado ni percibido para 2027.",
                "No contiene el Estado de Ejecución de Fondos Especiales ni gasto proyectado por fondo.",
                "Las fuentes y los objetos del gasto se publican como totales generales, sin cruce por programa.",
            ],
        },
        "programas": programs,
        "recursos": resources,
        "objetos_gasto": objects,
        "fuentes_financiamiento": financing,
    }
    output_json.parent.mkdir(parents=True, exist_ok=True)
    output_json.write_text(json.dumps(output, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Extracted {len(programs)} programs, {len(resources)} resources, {len(objects)} objects and {len(financing)} financing sources; all reconcile with {EXPECTED_TOTAL_CENTS} cents.")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        raise SystemExit("Usage: extract_proyecto_presupuesto.py INPUT.pdf OUTPUT.json")
    main(Path(sys.argv[1]), Path(sys.argv[2]))
