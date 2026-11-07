#!/usr/bin/env python3
"""Stamps one version number on every script/style reference, so phones never mix
old cached files with new ones. Run after every change:  python3 bump-version.py"""
import re, glob, time
v = time.strftime('%Y%m%d%H%M')
pat = re.compile(r"""((?:\./|js/)[\w-]+\.(?:js|css))(?:\?v=\w+)?(['"])""")
for f in ['index.html'] + glob.glob('js/*.js'):
    s = open(f).read()
    n = pat.sub(lambda m: f"{m.group(1)}?v={v}{m.group(2)}", s)
    n = re.sub(r'(href="style\.css|href="fonts\.css)(?:\?v=\w+)?"', lambda m: f'{m.group(1)}?v={v}"', n)
    if n != s:
        open(f, 'w').write(n)
print('version', v)
