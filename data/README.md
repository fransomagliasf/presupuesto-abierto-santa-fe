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

## Gastos por fuente de financiamiento

Los CSV `gastos_por_fuente` contienen los totales municipales publicados en
**Estado de Ejecución de Gastos por Fuente de Financiamiento**: Tesoro
Municipal, recursos afectados de origen municipal, provincial y nacional, y
Crédito interno cuando corresponde.

El extractor aplica los mismos cuatro controles aritméticos por fila que la
base por objeto y compara la suma de las fuentes con el total general impreso.
Los nueve cierres de enero a septiembre de 2026 pasan todos los controles.
Además, los totales de crédito aprobado, crédito vigente y devengado coinciden
exactamente con la base por objeto en cada mes.

```sh
python3 scripts/extract_gastos_por_fuente.py INFORME.pdf data/processed/gastos_por_fuente_YYYY-MM-DD.csv
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
impreso. En los diez informes de enero a octubre de 2026 las filas pasan
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

Los diez cierres de enero a octubre de 2026 pasan todos los controles. El
fondo `35.1.01.51` cambia a una denominación abreviada desde junio; se conserva
el texto publicado y la aplicación lo unifica por código.

```sh
python3 scripts/extract_fondos_especiales.py INFORME.pdf data/processed/fondos_especiales_YYYY-MM-DD.csv
```

## Presupuesto por finalidad y función

El archivo `presupuesto_finalidad_funcion_2019_2027.csv` reúne las funciones
de gasto publicadas en los presupuestos municipales 2019 a 2025 y en los
Proyectos de Presupuesto 2026 y 2027. Los importes se conservan como texto
original y como centavos enteros. No se duplican subtotales de finalidad: la
aplicación los calcula sumando sus funciones.

La suma de las funciones concilia exactamente con el total impreso de cada
documento:

- 2019: `$ 7.397.792.513,00`.
- 2020: `$ 10.586.408.247,00`.
- 2021: `$ 13.486.347.790,00`.
- 2022: `$ 23.009.562.654,00`.
- 2023: `$ 45.336.103.004,00`.
- 2024: `$ 108.064.744.537,00`.
- 2025: `$ 225.046.038.799,00`.
- 2026: `$ 295.881.415.299,00`.
- 2027: `$ 411.831.393.777,00` (Proyecto de Presupuesto).

En el documento 2024 un sello se superpone a las tres funciones de Servicios
económicos. Los importes fueron verificados visualmente y su suma coincide con
el subtotal impreso: `$ 1.891.097.079,00`.

En el Proyecto 2027 la función 399 aparece como “Otros servivicios urbanos”.
La denominación se normalizó a “Otros servicios urbanos” para mantener la
serie histórica identificada por el mismo código.

La interfaz comparativa comienza en 2020. De forma predeterminada muestra
2024–2027 y permite desplegar la gestión Jatón (2020–2023); 2019 se conserva
en el archivo fuente para trazabilidad, pero ya no forma parte de los análisis.

## Crédito vigente al cierre

`credito_vigente_cierres_2020_2026.json` reúne el crédito vigente consolidado
de las Cuentas de Inversión 2020–2025. Cada valor se extrae del “TOTAL GENERAL”
del Estado de Ejecución Presupuestaria de Recursos y se valida comprobando que
el crédito inicial más las modificaciones netas sea igual al crédito vigente.

El mismo archivo incluye `finalidad_funcion`, con el crédito vigente de cada
función tomado del cuadro “Estado de ejecución del presupuesto de gastos (por
finalidad y función)”. La suma de las funciones se valida contra el crédito
vigente total de cada cierre anual. Esta apertura está disponible hasta 2025.

`jurisdicciones` contiene el crédito vigente por secretaría o área
presupuestaria extraído del cuadro por categoría programática. También se
valida que la suma de todas las jurisdicciones coincida con el total anual. La
interfaz completa 2026 con el corte mensual de octubre y 2027 con el proyecto.

Para 2026 no existe todavía una Cuenta de Inversión anual: el registro se toma
del informe mensual de gastos al 31/10/2026 y queda identificado como corte
mensual. El script reproducible es `extract_credito_vigente_cierres.py`.

## Proyecto de Presupuesto 2027

`proyecto_presupuesto_2027.json` conserva por separado los datos anuales del
Mensaje 22: 98 programas, 47 conceptos de recursos, 8 objetos del gasto y 9
fuentes de financiamiento. Cada una de esas cuatro clasificaciones concilia
exactamente con el total impreso de `$ 411.831.393.777,00`.

El proyecto no informa ejecución, devengado, pagado ni percibido para 2027.
Tampoco contiene el Estado de Fondos Especiales ni cruces de fuente u objeto
por programa. La aplicación muestra esas ausencias como “no desagregado” y no
las reemplaza por ceros. Los montos anuales comparables se distinguen mediante
una trama y la leyenda “Proyecto de Presupuesto 2027”.

La extracción reproducible se ejecuta con:

```sh
python3 scripts/extract_proyecto_presupuesto.py 'Mensaje 22 Presupuesto 2027.pdf' data/processed/proyecto_presupuesto_2027.json
```

## Clasificaciones por objeto y carácter económico

`presupuesto_clasificaciones_2020_2027.json` reúne la composición del gasto
por objeto y por carácter económico. Para 2020–2025 se toma el `Crédito
Aprobado` de la primera tabla consolidada de cada Cuenta de Inversión; 2026
proviene del presupuesto aprobado y 2027 del proyecto.

Las ocho categorías por objeto y las trece aperturas económicas se validan por
separado contra el total impreso de cada año. En 2020, 2023 y 2025 el total de
`Crédito Aprobado` de la Cuenta difiere del cuadro histórico por finalidad y
función. Para no mezclar denominadores, las participaciones se calculan siempre
contra el total de la misma Cuenta. En 2020 ese total es el crédito reconducido
de `$ 19.418.795.052,00`, no el presupuesto sancionado originalmente.

La extracción se puede repetir con los PDF conservados en `recursos/fuentes`:

```sh
python3 scripts/extract_clasificaciones_presupuesto.py data/processed/presupuesto_clasificaciones_2020_2027.json \
  2020=cuenta=recursos/fuentes/cuentas-inversion/2020-cuenta-inversion.pdf \
  2021=cuenta=recursos/fuentes/cuentas-inversion/2021-cuenta-inversion.pdf \
  2022=cuenta=recursos/fuentes/cuentas-inversion/2022-cuenta-inversion.pdf \
  2023=cuenta=recursos/fuentes/cuentas-inversion/2023-cuenta-inversion.pdf \
  2024=cuenta=recursos/fuentes/cuentas-inversion/2024-cuenta-inversion.pdf \
  2025=cuenta=recursos/fuentes/cuentas-inversion/2025-cuenta-inversion.pdf \
  2026=presupuesto=recursos/fuentes/presupuestos/2026-presupuesto.pdf \
  2027=proyecto=recursos/fuentes/presupuestos/2027-mensaje-presupuesto.pdf
```
