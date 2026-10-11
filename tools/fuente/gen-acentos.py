"""Redibuja las 32 primeras casillas de la fuente de DbrTexture (ascii.png).

El problema
-----------
El ascii.png de DbrTexture v6 es de 2013 y sigue el orden viejo (CP437): en las casillas
0-31 tiene simbolos (☺ ☻ ♥ ♦ ♣ ♠ • ◘ ○ ◙ ♂ ♀ ♪ ♫ ☼ ►...). Minecraft 1.7.10 busca ahi
otras letras (charset de FontRenderer):

    ÀÁÂÈÊËÍÓÔÕÚßãõğİıŒœŞşŴŵžȇ  + 7 casillas vacias

asi que la "ã" de "não" se dibujaba como "♀". Del resto de la fuente (casilla 32 en
adelante) el orden de CP437 y el de 1.7.10 coinciden y no se toca.

Como se arregla
---------------
Cada letra nueva se arma con piezas que el pack YA tiene, para que salga con su estilo:

  - mayusculas: la letra base comprimida de 14 a 10 px quitando filas repetidas (es
    exactamente como el pack hizo su "É" y su "Ñ") + el acento arriba, filas 0-1;
  - minusculas: la letra base tal cual (empieza en la fila 4) + el acento en las filas 0-3;
  - acentos sacados de las minusculas del pack (á à â ä), la cedilla de "Ç" y una tilde
    dibujada aqui a la medida de la letra.

El script ES el original (como el arte de DbrServerPack/tools). Para retocar una letra
se cambia este archivo y se vuelve a correr; el ascii.png del zip no se edita a mano.
Lee las letras base del zip de origen y solo escribe las casillas 0-31 y el punto medio
(250), que no usa como base, asi que correrlo dos veces da lo mismo.

Uso
---
    python gen-acentos.py                     # hoja de revision en _preview/acentos.png
    python gen-acentos.py --zip "ruta.zip"    # escribe el ascii.png nuevo dentro del zip
    python gen-acentos.py --check "ruta.zip"  # codigo 1 si el zip no tiene lo que da el script
"""
import argparse
import io
import os
import shutil
import sys
import tempfile
import zipfile

from PIL import Image

AQUI = os.path.dirname(os.path.abspath(__file__))
ZIP_DEFECTO = os.path.join(AQUI, '..', '..', 'resourcepacks', 'DbrTexture v6.zip')
ENTRADA = 'assets/minecraft/textures/font/ascii.png'
CELDA = 16     # px por casilla (ascii.png de 256x256, 16x16 casillas)
CHARSET_0_31 = 'ÀÁÂÈÊËÍÓÔÕÚßãõğİıŒœŞşŴŵžȇ'
# Charset completo de FontRenderer en 1.7.10: posicion en ascii.png de cada caracter.
# _NUL = casilla sin caracter. Desde la 32 coincide con CP437, que es el orden del pack.
_NUL = chr(0)
CHARSET = (CHARSET_0_31 + _NUL * 7 + ' !"#$%&' + chr(39) + '()*+,-./0123456789:;<=>?@'
           'ABCDEFGHIJKLMNOPQRSTUVWXYZ[' + chr(92) + ']^_`abcdefghijklmnopqrstuvwxyz{|}~' + _NUL +
           'ÇüéâäàåçêëèïîìÄÅÉæÆôöòûùÿÖÜø£Ø×ƒáíóúñÑªº¿®¬½¼¡«»'
           '░▒▓│┤╡╢╖╕╣║╗╝╜╛┐└┴┬├─┼╞╟╚╔╩╦╠═╬╧╨╤╥╙╘╒╓╫╪┘┌█▄▌▐▀αβΓπΣσμτΦΘΩδ∞∅∈∩≡±≥≤⌠⌡÷≈°∙·√ⁿ²■' + _NUL)
assert len(CHARSET) == 256

# ------------------------------------------------------------------ piezas dibujadas aqui

# Tilde de 10 px de ancho y 4 de alto, la forma de la "~" del pack ajustada al ancho de
# las letras (la "~" mide 12 y se saldria de la "a").
TILDE = [
    '..###...##',
    '.#####.###',
    '###.#####.',
    '##...###..',
]
# Breve (ğ) y breve invertida (ȇ), 4 de alto.
BREVE = [
    '##......##',
    '##......##',
    '.########.',
    '..######..',
]
# Para mayusculas el acento tiene que caber en 2 filas (0-1) y dejar el hueco de las filas
# 2-3, como la "É" del pack: con 4 filas se pega a la letra y "Â" se lee como una mancha.
CIRC_MAY = [
    '...####...',
    '.###..###.',
]
TILDE_MAY = [
    '.####...##',
    '##..#####.',
]
# Punto de la İ: el de la "i" del pack mide 2x2.
PUNTO = ['##', '##']


# ------------------------------------------------------------------ rejilla

class Glifo:
    """Casilla de 16x16 como lista de filas de booleanos."""

    def __init__(self, filas=None):
        self.f = [list(r) for r in filas] if filas else [[False] * CELDA for _ in range(CELDA)]

    @classmethod
    def de_patron(cls, patron):
        g = cls()
        for y, fila in enumerate(patron):
            for x, c in enumerate(fila):
                g.f[y][x] = c == '#'
        return g

    def copia(self):
        return Glifo(self.f)

    def filas(self, y0, y1):
        """Sub-glifo con las filas [y0, y1) arriba del todo."""
        g = Glifo()
        for k, y in enumerate(range(y0, y1)):
            g.f[k] = list(self.f[y])
        return g

    def columnas(self):
        xs = [x for y in range(CELDA) for x in range(CELDA) if self.f[y][x]]
        return (min(xs), max(xs)) if xs else (0, -1)

    def pegar(self, otro, dy=0, dx=0):
        for y in range(CELDA):
            for x in range(CELDA):
                if otro.f[y][x]:
                    yy, xx = y + dy, x + dx
                    if 0 <= yy < CELDA and 0 <= xx < CELDA:
                        self.f[yy][xx] = True
        return self

    def borrar_filas(self, y0, y1):
        for y in range(y0, y1):
            self.f[y] = [False] * CELDA
        return self

    def vacio(self):
        return not any(any(r) for r in self.f)


def leer_fuente(ruta_zip):
    with zipfile.ZipFile(ruta_zip) as z:
        return Image.open(io.BytesIO(z.read(ENTRADA))).convert('RGBA')


def celda(im, i):
    px = im.load()
    cx, cy = (i % 16) * CELDA, (i // 16) * CELDA
    return Glifo([[px[cx + x, cy + y][3] > 0 for x in range(CELDA)] for y in range(CELDA)])


# ------------------------------------------------------------------ armado

def comprimir(g, alto_final=10):
    """Mayuscula de 14 px (filas 0-13) a `alto_final`, quitando filas de los tramos mas
    largos de filas iguales, de a dos para no romper el ritmo de 2 px del pack. Es lo que
    hizo el pack con su "É": la "E" sin 4 filas del palo."""
    filas = [tuple(g.f[y]) for y in range(14)]
    while len(filas) > alto_final:
        # tramos de filas consecutivas iguales: (largo, inicio)
        tramos, y = [], 0
        while y < len(filas):
            z = y
            while z + 1 < len(filas) and filas[z + 1] == filas[y]:
                z += 1
            tramos.append((z - y + 1, y))
            y = z + 1
        largo, inicio = max(tramos, key=lambda t: (t[0], -abs(t[1] + t[0] / 2 - len(filas) / 2)))
        quitar = 2 if largo >= 3 and len(filas) - alto_final >= 2 else 1
        medio = inicio + largo // 2
        del filas[medio - quitar // 2: medio - quitar // 2 + quitar]
    out = Glifo()
    for k, fila in enumerate(filas):
        out.f[4 + k] = list(fila)       # filas 4-13: debajo del acento, como la "É" del pack
    return out


def centrar(acento, letra, sesgo=0.0):
    """Desplazamiento horizontal del acento sobre la letra.

    sesgo: fraccion del ancho de la letra hacia la derecha (+) o la izquierda (-). El pack
    dibuja el agudo y el grave como el mismo bloque sin inclinar; lo que los distingue es
    la posicion (en su "á" el bloque cae a la derecha, en su "à" a la izquierda)."""
    a0, a1 = acento.columnas()
    l0, l1 = letra.columnas()
    destino = (l0 + l1) / 2 + sesgo * (l1 - l0 + 1)
    return int(round(destino - (a0 + a1) / 2))


def construir(im):
    """{indice: Glifo} para las casillas 0-31."""
    def L(c):
        return celda(im, ord(c))

    cp = {c: celda(im, i) for c, i in (('á', 160), ('à', 133), ('â', 131), ('ä', 132),
                                        ('Ç', 128), ('ß', 225), ('i', 105))}
    agudo = cp['á'].filas(0, 2)
    grave = cp['à'].filas(0, 2)
    SESGO = {id(agudo): 0.3, id(grave): -0.3}
    circ = cp['â'].filas(0, 4)
    dieresis = cp['ä'].filas(0, 2)
    cedilla = cp['Ç'].filas(14, 16)
    tilde = Glifo.de_patron(TILDE)
    breve = Glifo.de_patron(BREVE)
    breve_inv = Glifo.de_patron(list(reversed(BREVE)))
    caron = Glifo(list(reversed(circ.f[:4])) + [[False] * CELDA] * 12)
    punto = Glifo.de_patron(PUNTO)

    circ_may = Glifo.de_patron(CIRC_MAY)
    tilde_may = Glifo.de_patron(TILDE_MAY)

    def may(letra, acento):          # mayuscula: letra comprimida (filas 4-13) + acento 0-1
        base = comprimir(L(letra))
        return base.copia().pegar(acento, dx=centrar(acento, base, SESGO.get(id(acento), 0)))

    def minu(letra, acento):         # minuscula: la letra empieza en la fila 4
        base = L(letra)
        return base.copia().pegar(acento, dx=centrar(acento, base, SESGO.get(id(acento), 0)))

    def con_cedilla(letra):
        base = L(letra)
        return base.copia().pegar(cedilla.copia(), dy=14, dx=centrar(cedilla, base))

    sin_punto = cp['i'].copia().borrar_filas(0, 4)
    return {
        0: may('A', grave), 1: may('A', agudo), 2: may('A', circ_may),
        3: may('E', grave), 4: may('E', circ_may), 5: may('E', dieresis),
        6: may('I', agudo), 7: may('O', agudo), 8: may('O', circ_may),
        9: may('O', tilde_may), 10: may('U', agudo),
        11: cp['ß'].copia(),
        12: minu('a', tilde), 13: minu('o', tilde),
        14: minu('g', breve),
        15: may('I', punto), 16: sin_punto,
        # 17 Œ y 18 œ quedan vacias: ninguno de los tres idiomas del servidor las usa.
        19: con_cedilla('S'), 20: con_cedilla('s'),
        21: may('W', circ_may), 22: minu('w', circ),
        23: minu('z', caron), 24: minu('e', breve_inv),
        # Fuera de 0-31: el punto medio "·" (250) del pack es un bloque de 4x2 con 6 columnas
        # vacias delante; FontRenderer mide hasta la ultima columna con tinta y se ve como un
        # guion bajo. Punto de 2x2 a media altura de la minuscula, como el "." (46).
        250: Glifo.de_patron([''] * 8 + ['##', '##']),
    }


# Casillas que escribe el generador: las 32 primeras enteras (las que no arma quedan vacias)
# y las de fuera de ese rango que corrige.
CASILLAS = list(range(32)) + [250]


def aplicar(im, glifos):
    out = im.copy()
    px = out.load()
    for i in CASILLAS:
        cx, cy = (i % 16) * CELDA, (i // 16) * CELDA
        gl = glifos.get(i, Glifo())
        for y in range(CELDA):
            for x in range(CELDA):
                px[cx + x, cy + y] = (255, 255, 255, 255) if gl.f[y][x] else (0, 0, 0, 0)
    return out


# ------------------------------------------------------------------ revision, zip y gate

def hoja(im, glifos, ruta):
    """Hoja numerada: cada letra nueva al lado de su base, aumentada x4, y una linea de
    palabras de prueba armada con los glifos."""
    esc, sep = 5, 6
    cols = 8
    filas = (25 + cols - 1) // cols
    W = cols * (2 * CELDA * esc + 3 * sep) + sep
    H = filas * (CELDA * esc + 2 * sep) + sep
    fondo = Image.new('RGB', (W, H), (34, 36, 52))
    pxo = fondo.load()

    def dibujar(gl, ox, oy, color):
        for y in range(CELDA):
            for x in range(CELDA):
                if gl.f[y][x]:
                    for a in range(esc):
                        for b in range(esc):
                            pxo[ox + x * esc + a, oy + y * esc + b] = color
        for k in range(CELDA * esc):        # marco de la casilla
            for (xx, yy) in ((ox + k, oy), (ox + k, oy + CELDA * esc - 1), (ox, oy + k), (ox + CELDA * esc - 1, oy + k)):
                if pxo[xx, yy] == (34, 36, 52):
                    pxo[xx, yy] = (60, 62, 84)

    base_idx = {0: 65, 1: 65, 2: 65, 3: 69, 4: 69, 5: 69, 6: 73, 7: 79, 8: 79, 9: 79, 10: 85, 11: 225,
                12: 97, 13: 111, 14: 103, 15: 73, 16: 105, 19: 83, 20: 115, 21: 87, 22: 119, 23: 122, 24: 101}
    for n, i in enumerate(sorted(base_idx)):
        cx = sep + (n % cols) * (2 * CELDA * esc + 3 * sep)
        cy = sep + (n // cols) * (CELDA * esc + 2 * sep)
        dibujar(celda(im, base_idx[i]), cx, cy, (120, 124, 150))
        dibujar(glifos[i], cx + CELDA * esc + sep, cy, (255, 255, 255))
    # palabras de prueba con la fuente ya arreglada, como las espacia FontRenderer
    # (ancho de cada glifo = ultima columna con tinta + 2 px; espacio = 8 px)
    nueva = aplicar(im, glifos)
    pal = ['não são ações Missões', 'Você ainda não tem mascotes', 'ÁRVORE ÍNDICE ÓRBITA ÚNICO',
           'ÀS ÂNCORA ÊXITO ÔNIBUS ÕES', 'Ação Mágica Énfasis Ñandú', 'çãõáéíóúâêô ß ı İ ğ ş ž']
    esc2 = 3
    alto = sep + len(pal) * (CELDA * esc2 + sep)
    lienzo = Image.new('RGB', (W, H + alto), (34, 36, 52))
    lienzo.paste(fondo, (0, 0))
    pxl = lienzo.load()
    for k, frase in enumerate(pal):
        x, y0 = sep, H + sep + k * (CELDA * esc2 + sep)
        for ch in frase:
            if ch == ' ':
                x += 8 * esc2
                continue
            if ch not in CHARSET:
                continue        # va por unicode_page_XX.png, no por ascii.png
            i = CHARSET.index(ch)
            gl = celda(nueva, i)
            l0, l1 = gl.columnas()
            for yy in range(CELDA):
                for xx in range(CELDA):
                    if gl.f[yy][xx]:
                        for a2 in range(esc2):
                            for b2 in range(esc2):
                                pxl[x + xx * esc2 + a2, y0 + yy * esc2 + b2] = (255, 255, 255)
            x += (l1 + 3) * esc2
    os.makedirs(os.path.dirname(ruta), exist_ok=True)
    lienzo.save(ruta)
    return ruta


def escribir_zip(ruta_zip, nueva):
    buf = io.BytesIO()
    nueva.save(buf, 'PNG', optimize=True)
    tmp = tempfile.NamedTemporaryFile(delete=False, suffix='.zip', dir=os.path.dirname(os.path.abspath(ruta_zip)))
    tmp.close()
    with zipfile.ZipFile(ruta_zip) as zin, zipfile.ZipFile(tmp.name, 'w') as zout:
        for info in zin.infolist():
            datos = buf.getvalue() if info.filename == ENTRADA else zin.read(info.filename)
            zout.writestr(info, datos)
    shutil.move(tmp.name, ruta_zip)


def main():
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8')
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--origen', default=ZIP_DEFECTO, help='zip del que se leen las letras base')
    ap.add_argument('--zip', help='zip en el que escribir el ascii.png nuevo')
    ap.add_argument('--check', help='zip a comprobar')
    a = ap.parse_args()

    im = leer_fuente(a.origen)
    glifos = construir(im)
    nueva = aplicar(im, glifos)

    if a.check:
        actual = leer_fuente(a.check)
        malas = [i for i in CASILLAS
                 if list(celda(actual, i).f) != list(glifos.get(i, Glifo()).f)]
        if malas:
            print(f'FALLA: {len(malas)} casillas no coinciden con el generador: '
                  + ', '.join(f'{i}({CHARSET[i] if CHARSET[i] != _NUL else "vacia"})' for i in malas))
            sys.exit(1)
        print(f'ok: {len(CASILLAS)} casillas de la fuente al dia')
        return

    print('hoja:', hoja(im, glifos, os.path.join(AQUI, '_preview', 'acentos.png')))
    if a.zip:
        escribir_zip(a.zip, nueva)
        print('escrito:', a.zip)


if __name__ == '__main__':
    main()
