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

## Recursos por rubro

Los CSV `recursos_por_rubro` contienen las filas de concepto de los informes
**Estado de Ejecución Presupuestaria de Recursos**. Conservan la jerarquía de
rubro principal, grupo, concepto y procedencia, además de los importes como
texto original y centavos enteros.

Cada fila pasa tres controles exactos:

1. Recurso vigente = recurso estimado + modificaciones.
2. Vigente − devengado = diferencia informada.
3. Devengado − percibido = diferencia informada.

El extractor también compara la suma de los conceptos con el `TOTAL GENERAL`
impreso. En los nueve informes de enero a septiembre de 2026 las filas pasan
los controles, pero el total impreso de devengado y percibido supera el detalle
en `$ 200.721,46`. Esa diferencia del documento fuente queda registrada en
`total_general_reconcilia` y `diferencias_total_general_centavos`; no se altera
ningún valor para forzar la conciliación.

```sh
python3 scripts/extract_recursos_por_rubro.py INFORME.pdf data/processed/recursos_por_rubro_YYYY-MM-DD.csv
```

## Fondos Especiales

Los CSV `fondos_especiales` provienen del informe **Estado de Ejecución de
Recursos Afectados vs. Gastos**. Cada fila representa un fondo y queda
clasificada según el total de origen que cierra su sección: municipal (12),
provincial (22), nacional (32) u otros (42).

El extractor controla exactamente que:

1. Gasto devengado no pagado = gasto devengado − gasto pagado.
2. El saldo informado = recurso percibido − gasto pagado.
3. Para los rubros 35, conforme a la nota del informe, el saldo informado =
   recurso vigente − gasto pagado.
4. La suma de los fondos coincide con cada total de origen y con el total
   general impreso.

Los nueve cierres de enero a septiembre de 2026 pasan todos los controles. El
fondo `35.1.01.51` cambia a una denominación abreviada desde junio; se conserva
el texto publicado y la aplicación lo unifica por código.

```sh
python3 scripts/extract_fondos_especiales.py INFORME.pdf data/processed/fondos_especiales_YYYY-MM-DD.csv
```
