"""Regenerate the Material Icons subset (public/fonts/material-icons-subset.woff2).

Usage:  python scripts/icon-subset.py <names-file>
Called by scripts/build-icon-subset.ts (`bun run icons:subset`) — see that file
for the why. Requires fonttools + brotli.

The subset keeps: a-z 0-9 _ (so a missing ligature renders blank, never tofu)
plus the ligature glyphs for every name in the input file. Names that the full
font does not contain are reported and skipped.
"""

import os
import sys

from fontTools import subset
from fontTools.ttLib import TTFont

FULL = os.path.join('public', 'fonts', 'material-icons.woff2')
OUT = os.path.join('public', 'fonts', 'material-icons-subset.woff2')


def main() -> int:
    if len(sys.argv) < 2:
        print('usage: python scripts/icon-subset.py <names-file>')
        return 2
    names_file = sys.argv[1]

    font = TTFont(FULL)
    cmap = font.getBestCmap()
    rev = {g: chr(cp) for cp, g in cmap.items() if 32 <= cp < 127}

    # Reconstruct every ligature name from GSUB (components are glyph names).
    glyphs: dict[str, str] = {}
    for lookup in font['GSUB'].table.LookupList.Lookup:
        for st in lookup.SubTable:
            inner = getattr(st, 'ExtSubTable', st)
            ligs = getattr(inner, 'ligatures', None)
            if not ligs:
                continue
            for first, items in ligs.items():
                for lig in items:
                    name = rev.get(first, first) + ''.join(rev.get(c, c) for c in lig.Component)
                    glyphs[name] = lig.LigGlyph

    used = [l.strip() for l in open(names_file, encoding='utf8') if l.strip()]
    found = [n for n in used if n in glyphs]
    missing = [n for n in used if n not in glyphs]

    glyphs_tmp = names_file + '.glyphs'
    text_tmp = names_file + '.text'
    with open(glyphs_tmp, 'w', encoding='utf8') as fh:
        fh.write('\n'.join(glyphs[n] for n in found) + '\n')
    with open(text_tmp, 'w', encoding='utf8') as fh:
        fh.write('abcdefghijklmnopqrstuvwxyz0123456789_\n' + '\n'.join(used) + '\n')

    subset.main([
        FULL,
        f'--text-file={text_tmp}',
        f'--glyphs-file={glyphs_tmp}',
        '--layout-features=*',
        '--no-layout-closure',
        '--flavor=woff2',
        f'--output-file={OUT}',
    ])

    for tmp in (glyphs_tmp, text_tmp):
        os.remove(tmp)

    size_kb = round(os.path.getsize(OUT) / 1024, 1)
    print(f'[icons] subset written: {OUT} ({size_kb} KB) — {len(found)}/{len(used)} names covered')
    if missing:
        print(f'[icons] NOT in the source font ({len(missing)}) — swap these in code:')
        for n in missing:
            print(f'  - {n}')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
