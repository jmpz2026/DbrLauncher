# Genera el layout de controles por defecto de DBR (formato ZalithLauncher2, editorVersion 11).
# Uso: python android/tools/dbr-layout.py android/ZalithLauncher2/ZalithLauncher/src/main/assets/default_layout.json
# Ojo: editar default_layout.json siempre con Python, nunca con node: JSON.parse estropea los numeros grandes.
#
# Diseño: pocos botones grandes con nombre, como los controles de un juego movil.
#   - base:       Menu y "Mas" (siempre), Teclado (solo con un menu abierto).
#   - juego:      combate y movimiento DBC, solo con el raton capturado (se esconden en los menus).
#   - mas:        teclas de uso raro, oculta; el boton "Mas" la abre y la cierra.
#   - movimiento: WASD de respaldo, se oculta si el joystick esta activo.
# Las teclas salen de DBR-ASSETS/options.txt (key_Lock On, key_Energy Control/Flight, ...).
import hashlib, json, sys

DST = sys.argv[1]
# Pantalla de referencia en dp: movil 20:9 (2400x1080 @ 2.75). Las coordenadas de abajo son centros en dp.
W, H = 873.0, 393.0


def uid(*parts):
    return hashlib.sha1('|'.join(map(str, parts)).encode()).hexdigest()[:12]


def shape(r):
    return {'topStart': r, 'topEnd': r, 'bottomEnd': r, 'bottomStart': r}


def style(name, bg, pressed_bg, border, pressed_border, font):
    cfg = {'alpha': 0.9, 'pressedAlpha': 1.0,
           'backgroundColor': bg, 'pressedBackgroundColor': pressed_bg,
           'contentColor': 0xFFFFFFFF, 'pressedContentColor': 0xFFFFFFFF,
           'fontSize': font, 'pressedFontSize': font,
           'borderWidth': 1, 'pressedBorderWidth': 2,
           'borderColor': border, 'pressedBorderColor': pressed_border,
           'borderRadius': shape(16.0), 'pressedBorderRadius': shape(16.0)}
    return {'name': name, 'uuid': uid('style', name), 'animateSwap': False, 'commonStyle': True,
            'lightStyle': cfg, 'darkStyle': dict(cfg)}


STYLES = [
    style('dbr normal', 0x8C26282E, 0xB3474B55, 0x59FFFFFF, 0xB3FFFFFF, 12),
    style('dbr ataque', 0xA6A8662E, 0xD9C98545, 0xB3E8A869, 0xFFFFD08A, 14),
    style('dbr menu', 0x8C26282E, 0xB3474B55, 0x40FFFFFF, 0xB3FFFFFF, 11),
]
NORMAL, ATAQUE, MENU = (s['uuid'] for s in STYLES)


def key(k):
    return {'type': 'key', 'key': 'GLFW_KEY_' + k}


def event(e):
    return {'type': 'launcher_event', 'key': e}


LMB, RMB = event('GLFW_MOUSE_BUTTON_LEFT'), event('GLFW_MOUSE_BUTTON_RIGHT')


def button(layer, text, cx, cy, w, h, events, st=NORMAL, vis='in_game', toggle=False, icon=None):
    left, top = cx - w / 2, cy - h / 2
    assert 0 <= left and left + w <= W and 0 <= top and top + h <= H, text
    return {
        'text': {'default': text, 'matchQueue': []},
        'uuid': uid('button', layer, text),
        'position': {'x': round(left / (W - w) * 10000), 'y': round(top / (H - h) * 10000)},
        # El tamaño escala con el alto de la pantalla, como los botones de Pojav.
        'buttonSize': {'type': 'percentage', 'widthDp': w, 'heightDp': h,
                       'widthPercentage': round(w / H * 10000), 'heightPercentage': round(h / H * 10000),
                       'widthReference': 'screen_height', 'heightReference': 'screen_height'},
        'buttonStyle': st,
        'textAlignment': 'Center',
        'visibilityType': vis,
        'clickEvents': events,
        'isSwipple': False,
        'isPenetrable': False,
        'isToggleable': toggle,
        # DBR: icono encima del texto; ids en LayerController/.../data/ButtonIcons.kt
        **({'icon': icon} if icon else {}),
    }


def layer(name, buttons, hide=False, hide_when_joystick=False):
    return {'name': name, 'uuid': uid('layer', name), 'hide': hide, 'hideWhenMouse': False,
            'hideWhenGamepad': True, 'hideWhenJoystick': hide_when_joystick, 'visibilityType': 'always',
            'normalButtons': buttons}


MAS = uid('layer', 'mas')

base = [
    button('base', 'Menú', 62, 120, 92, 40, [event('launcher.event.switch_menu')], MENU, 'always', icon='grid_view'),
    button('base', 'Teclado', 62, 166, 92, 40, [event('launcher.event.switch_ime')], MENU, 'in_menu', icon='keyboard'),
    button('base', 'Más', 840, 30, 50, 48, [{'type': 'switch_layer', 'key': MAS}], MENU, 'always', icon='expand_more'),
]

juego = [
    # Columna izquierda, bajo el HUD de JRMCore.
    button('juego', 'Chat', 62, 166, 92, 40, [key('T')], MENU, icon='chat'),
    button('juego', 'Inventario', 62, 212, 92, 40, [key('E')], MENU, icon='backpack'),
    # Fila superior derecha. Son de mantener: transformar (G) y la rueda de formas (Y) actuan
    # mientras se mantienen, y en Acciones (X) se elige la opcion soltando.
    button('juego', 'Rueda formas', 612, 30, 84, 48, [key('Y')], icon='donut_large'),
    button('juego', 'Transformar', 702, 30, 80, 48, [key('G')], icon='auto_awesome'),
    button('juego', 'Acciones', 778, 30, 64, 48, [key('X')], icon='list'),
    # Pulgar izquierdo, al lado del joystick.
    button('juego', 'Cargar Ki', 290, 290, 58, 58, [key('C')], icon='flare'),
    # Pulgar derecho.
    button('juego', 'Fijar', 560, 258, 50, 50, [key('Z')], icon='my_location'),
    button('juego', 'Turbo', 640, 262, 50, 50, [key('R')], icon='speed'),
    button('juego', 'Atacar', 735, 262, 76, 76, [LMB], ATAQUE, icon='swords'),
    button('juego', 'Saltar', 822, 262, 56, 56, [key('SPACE')], icon='keyboard_double_arrow_up'),
    button('juego', 'Correr', 822, 180, 50, 50, [key('LEFT_CONTROL')], icon='directions_run'),
    button('juego', 'Volar', 628, 345, 52, 52, [key('F')], icon='flight'),
    button('juego', 'Usar', 700, 345, 56, 52, [RMB], icon='touch_app'),
    button('juego', 'Agacharse', 790, 345, 64, 52, [key('LEFT_SHIFT')], toggle=True, icon='keyboard_double_arrow_down'),
]

# Rejilla de 5 columnas arriba al centro, entre el HUD y los botones de la derecha.
# Escudo Ki = O: KeyBindings de DbrShieldKi (DbrServerPack).
MAS_KEYS = [
    ('Estadísticas', [key('V')]), ('Misiones', [key('N')]), ('Escudo Ki', [key('O')]),
    ('Ki Sense\nScouter', [key('F4')]), ('Soltar', [key('Q')]), ('Cámara', [key('F5')]),
    ('Jugadores', [key('TAB')]), ('Calendario', [key('U')]), ('Hablar', [key('J')]), ('Armario', [key('P')]),
    ('Alt', [key('LEFT_ALT')]), ('Captura', [key('F2')]), ('Debug', [key('F3')]),
    ('Teclado', [event('launcher.event.switch_ime')]),
]
COLS, BW, BH, GAP, TOP = 5, 70, 38, 6, 60
LEFT = (W - (COLS * BW + (COLS - 1) * GAP)) / 2
mas = [button('mas', text, LEFT + BW / 2 + (i % COLS) * (BW + GAP), TOP + BH / 2 + (i // COLS) * (BH + GAP),
              BW, BH, events, MENU, 'always')
       for i, (text, events) in enumerate(MAS_KEYS)]

# Cruceta de respaldo en el sitio del joystick (centro ~170,275).
movimiento = [
    button('movimiento', '▲', 170, 222, 46, 46, [key('W')]),
    button('movimiento', '◀', 117, 275, 46, 46, [key('A')]),
    button('movimiento', '▼', 170, 328, 46, 46, [key('S')]),
    button('movimiento', '▶', 223, 275, 46, 46, [key('D')]),
]

layout = {
    'info': {'name': {'default': 'DBR', 'matchQueue': []}, 'author': {'default': 'Dbr', 'matchQueue': []},
             'description': {'default': 'Controles por defecto de Dragon Block Resurrection', 'matchQueue': []},
             'versionCode': 3, 'versionName': '3.0'},
    'layers': [layer('base', base), layer('juego', juego),
               layer('movimiento', movimiento, hide_when_joystick=True),
               layer('mas', mas, hide=True)],
    'styles': STYLES,
    'editorVersion': 11,
}

with open(DST, 'w', encoding='utf-8', newline='\n') as f:
    json.dump(layout, f, ensure_ascii=False, indent=2)
    f.write('\n')
print('%d botones -> %s' % (sum(len(l['normalButtons']) for l in layout['layers']), DST))
