# -*- coding: utf-8 -*-
"""
Escribe una tabla Iceberg de verdad (con pyiceberg y un catálogo SQLite local)
para la prueba p08 de la 5.10. Uso:

    python scripts/poc510/p08_iceberg_escribir.py <carpeta destino>

Deja en <carpeta>/almacen/tiendas.db/ventas la tabla, con dos instantáneas
(dos «append»), sin version-hint.text: es lo que escriben los catálogos.
"""
import os
import sys

import pyarrow as pa
from pyiceberg.catalog.sql import SqlCatalog

destino = os.path.abspath(sys.argv[1])
almacen = os.path.join(destino, 'almacen')
os.makedirs(almacen, exist_ok=True)
catalogo = SqlCatalog('local', uri=f"sqlite:///{os.path.join(destino, 'catalogo.db')}",
                      warehouse=almacen.replace(os.sep, '/'))   # en Windows, sin file:/// (pyiceberg lo convierte en /C:/…)
catalogo.create_namespace_if_not_exists('tiendas')
datos = pa.table({'tienda': ['norte', 'sur'], 'importe': [10.0, 20.0]})
if catalogo.table_exists('tiendas.ventas'):
    catalogo.drop_table('tiendas.ventas')
tabla = catalogo.create_table('tiendas.ventas', schema=datos.schema)
tabla.append(datos)
tabla.append(pa.table({'tienda': ['centro'], 'importe': [30.0]}))
print(tabla.metadata_location)
