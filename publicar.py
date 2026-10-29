#!/usr/bin/env python3
"""Sube el número de versión (?v=) en la app y el demo para que los navegadores carguen los archivos nuevos.
Uso: python3 publicar.py   (antes de cada commit que cambie docs/app o docs/demo)"""
import re, datetime, pathlib
v = datetime.datetime.now().strftime('%Y%m%d-%H%M')
for p in pathlib.Path(__file__).parent.glob('docs/*/index.html'):
    if p.parent.name in ('app', 'demo'):
        p.write_text(re.sub(r'\?v=[0-9-]+', f'?v={v}', p.read_text()))
print('versión', v)
