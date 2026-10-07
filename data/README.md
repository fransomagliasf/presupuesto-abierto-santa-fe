# Datos presupuestarios

Los CSV de `gastos_por_objeto` contienen las filas detalladas del informe
municipal **Estado de Ejecución del Presupuesto de Gastos**, desagregado hasta
programa, fuente de financiamiento e inciso (objeto del gasto).

Cada importe se guarda dos veces:

- `*_texto`: transcripción literal con el formato del PDF.
- `*_centavos`: entero exacto en centavos, apto para cálculos y gráficos.

No se incluyen las filas `Total`: son agregaciones que repetirían los mismos
importes. La columna `linea_texto_extraido` permite ubicar la fila en el texto
generado desde el PDF; la fecha y los demás campos identifican la fila del
informe.

`revision_requerida=si` señala una inconsistencia aritmética entre columnas.
Una fila sin señal pasó estos cuatro controles exactos:

1. Crédito vigente = crédito aprobado + modificaciones.
2. Crédito disponible = crédito vigente − preventivo − compromiso.
3. Crédito vigente − devengado = crédito vigente − devengado calculado.
4. Devengado no pagado = devengado − pagado.

La fuente original debe conservarse junto a cada publicación futura. Para
regenerar un CSV se necesita `pdftotext` y se ejecuta:

```sh
python3 scripts/extract_gastos_por_objeto.py INFORME.pdf data/processed/gastos_por_objeto_YYYY-MM-DD.csv
```
