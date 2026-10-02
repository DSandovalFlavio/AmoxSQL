# -*- coding: utf-8 -*-
"""
Genera los Excel de muestra de la prueba de concepto 0.2 de la 5.10
(docs/dev/plan_5_10_datos_donde_estan.md). Los archivos generados se versionan:
este script solo hace falta para rehacerlos.

    python scripts/fixtures/excel/generar.py

Necesita openpyxl. Los dos archivos que no son un ZIP (un .xls antiguo y un
.xlsx cifrado) son SINTETICOS: empiezan con la firma de un archivo compuesto
de Office, que es lo que tienen ambos, y basta para probar que se rechazan
con un error claro.
"""
import datetime
import os

from openpyxl import Workbook
from openpyxl.styles import Font

AQUI = os.path.dirname(os.path.abspath(__file__))


def cliente():
    """Como llega de un cliente: titulo arriba, encabezados en la fila 4, notas al pie."""
    wb = Workbook()
    ws = wb.active
    ws.title = 'Ventas'
    ws['A1'] = 'Reporte semanal de ventas'
    ws['A1'].font = Font(bold=True, size=14)
    ws.merge_cells('A1:E1')
    ws['A2'] = 'Generado el 29/09/2026 por el área comercial'
    ws.merge_cells('A2:E2')
    ws.append([])  # fila 3 en blanco
    ws.append(['Tienda', 'Fecha', 'Importe', 'Unidades', 'Notas'])  # fila 4
    filas = [
        ('Norte', datetime.date(2026, 9, 21), 1520.5, 12, None),
        ('Sur', datetime.date(2026, 9, 21), 980.0, 8, 'Cierre anticipado'),
        ('Centro', datetime.date(2026, 9, 22), 2310.25, 19, None),
        ('Norte', datetime.date(2026, 9, 22), 1105.0, 9, None),
        ('Sur', datetime.date(2026, 9, 23), 760.75, 6, None),
        ('Centro', datetime.date(2026, 9, 23), 1890.0, 15, None),
    ]
    for f in filas:
        ws.append(list(f))
    for r in range(5, 5 + len(filas)):
        ws.cell(row=r, column=2).number_format = 'DD/MM/YYYY'
    # Una celda combinada dentro de los datos (dos filas de la misma tienda)
    ws.merge_cells('A5:A6')
    ws.append([])
    ws.append(['Total', None, '=SUM(C5:C10)', '=SUM(D5:D10)', None])
    ws.append(['* Cifras preliminares, sujetas a revisión'])
    wb.save(os.path.join(AQUI, 'cliente.xlsx'))


def varias_hojas():
    """Una hoja por mes, con nombres que exigen cuidado al listarlas."""
    wb = Workbook()
    wb.remove(wb.active)
    for nombre, base in (('Enero', 100), ('Febrero', 200), ('Marzo & Año', 300)):
        ws = wb.create_sheet(nombre)
        ws.append(['tienda', 'importe'])
        ws.append(['Norte', base + 1])
        ws.append(['Sur', base + 2])
    wb.create_sheet('Notas "internas"').append(['No es una hoja de datos'])
    wb.save(os.path.join(AQUI, 'varias_hojas.xlsx'))


def no_zip(nombre):
    """Firma de un archivo compuesto de Office (lo que es un .xls y un .xlsx cifrado)."""
    firma = bytes([0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1])
    with open(os.path.join(AQUI, nombre), 'wb') as f:
        f.write(firma + bytes(512 - len(firma)))


if __name__ == '__main__':
    cliente()
    varias_hojas()
    no_zip('antiguo.xls')
    no_zip('cifrado.xlsx')
    with open(os.path.join(AQUI, 'danado.xlsx'), 'wb') as f:
        f.write(b'PK\x03\x04 esto no es un libro de Excel completo')
    print('listo')
