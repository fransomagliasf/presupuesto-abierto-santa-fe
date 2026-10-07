# Presupuesto Abierto Santa Fe

Sitio estático para explorar la ejecución presupuestaria municipal. Actualmente
incluye el informe mensual **Estado de Ejecución del Presupuesto de Gastos por
Objeto** de enero y febrero de 2026.

## Ejecutarlo en una computadora

Desde la raíz del proyecto:

```sh
python3 -m http.server 8000
```

Luego abrir `http://localhost:8000`. El servidor local es necesario porque el
sitio carga los CSV con `fetch`.

## Incorporar un nuevo mes

1. Conservar el PDF original recibido.
2. Generar el CSV con `scripts/extract_gastos_por_objeto.py`.
3. Agregar el nuevo nombre de archivo a `DATA_FILES` en `app.js`.
4. Verificar que las filas no tengan `revision_requerida=si`.
5. Publicar los cambios en la rama principal. GitHub Pages se actualiza solo.

El formato y las reglas de validación están explicados en
[`data/README.md`](data/README.md).
