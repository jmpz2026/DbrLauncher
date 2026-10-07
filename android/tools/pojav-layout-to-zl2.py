# Convierte un layout PojavLauncher/MojoLauncher (mControlDataList, v9) al formato ZalithLauncher2.
# Uso: python android/tools/pojav-layout-to-zl2.py <layout-pojav.json> android/ZalithLauncher2/ZalithLauncher/src/main/assets/default_layout.json
# Ojo: editar default_layout.json siempre con Python, nunca con node: JSON.parse estropea los numeros grandes.
import json, re, sys, hashlib

SRC, DST = sys.argv[1], sys.argv[2]
# Pantalla de referencia en dp: movil 20:9 (2400x1080 @ 2.75).
W, H = 873.0, 393.0
SCALE = 120.0  # preferred_scale = scaledAt: tamaños tal cual los dejo el autor
MARGIN = 2.0

src = json.load(open(SRC, encoding='utf-8'))
assert src.get('version') == 9, src.get('version')
assert src['scaledAt'] == SCALE


def ev(expr, w, h):
    v = {'screen_width': W, 'screen_height': H, 'width': w, 'height': h, 'margin': MARGIN,
         'right': W - w, 'bottom': H - h, 'preferred_scale': SCALE}
    e = re.sub(r'\$\{(\w+)\}', lambda m: repr(v[m.group(1)]), expr)
    e = e.replace('px(', '(')
    assert re.fullmatch(r'[0-9eE.+\-*/() ]+', e), e
    return float(eval(e))


def glfw(code):
    if 29 <= code <= 54:
        return 'GLFW_KEY_' + chr(ord('A') + code - 29)
    if 7 <= code <= 16:
        return 'GLFW_KEY_' + str(code - 7)
    if 131 <= code <= 142:
        return 'GLFW_KEY_F' + str(code - 130)
    return {61: 'GLFW_KEY_TAB', 59: 'GLFW_KEY_LEFT_SHIFT', 60: 'GLFW_KEY_RIGHT_SHIFT', 62: 'GLFW_KEY_SPACE',
            113: 'GLFW_KEY_LEFT_CONTROL', 114: 'GLFW_KEY_RIGHT_CONTROL', 57: 'GLFW_KEY_LEFT_ALT',
            111: 'GLFW_KEY_ESCAPE', 66: 'GLFW_KEY_ENTER', 67: 'GLFW_KEY_BACKSPACE'}[code]


def color(argb):  # editorVersion 11: ARGB en los 32 bits bajos (sin signo)
    return argb & 0xFFFFFFFF


def uid(*parts):
    return hashlib.sha1('|'.join(map(str, parts)).encode()).hexdigest()[:12]


# Un estilo por opacidad (Pojav aplica la opacidad a todo el boton, texto incluido).
styles, style_of = [], {}


def style(c):
    a = round(float(c['opacity']), 2)
    if a in style_of:
        return style_of[a]
    u = uid('style', a)
    shape = {'topStart': 0.0, 'topEnd': 0.0, 'bottomEnd': 0.0, 'bottomStart': 0.0}
    cfg = {'alpha': a, 'pressedAlpha': min(1.0, a + 0.3),
           'backgroundColor': color(c['bgColor']),
           'pressedBackgroundColor': color(0x80000000 | (c['bgColor'] & 0xFFFFFF)),
           'contentColor': color(0xFFFFFFFF), 'pressedContentColor': color(0xFFFFFFFF),
           'borderWidth': int(c['strokeWidth']), 'pressedBorderWidth': int(c['strokeWidth']),
           'borderColor': color(c['strokeColor']), 'pressedBorderColor': color(c['strokeColor']),
           'borderRadius': shape, 'pressedBorderRadius': shape}
    styles.append({'name': 'dbr %d%%' % round(a * 100), 'uuid': u, 'animateSwap': False, 'commonStyle': True,
                   'lightStyle': cfg, 'darkStyle': dict(cfg)})
    style_of[a] = u
    return u


LAYER_GUI, LAYER_MAIN, LAYER_MOVE = uid('layer', 'gui'), uid('layer', 'main'), uid('layer', 'move')
MOVE = {51, 29, 47, 32}  # WASD: se ocultan si el joystick de movimiento esta activo
layers = {LAYER_GUI: [], LAYER_MAIN: [], LAYER_MOVE: []}
names = {LAYER_GUI: 'gui', LAYER_MAIN: 'main', LAYER_MOVE: 'move'}
report = []

for i, c in enumerate(src['mControlDataList']):
    w, h = c['width'], c['height']
    x, y = ev(c['dynamicX'], w, h), ev(c['dynamicY'], w, h)
    px = round(max(0.0, min(1.0, x / (W - w))) * 10000)
    py = round(max(0.0, min(1.0, y / (H - h))) * 10000)
    text = c['name'].strip()
    codes = [k for k in c['keycodes'] if k != 0]
    events, layer = [], LAYER_MAIN
    for k in codes:
        if k == -1:
            events.append({'type': 'launcher_event', 'key': 'launcher.event.switch_ime'})
        elif k == -2:
            layer = LAYER_GUI
            events += [{'type': 'switch_layer', 'key': LAYER_MAIN}, {'type': 'switch_layer', 'key': LAYER_MOVE}]
        elif k == -3:
            events.append({'type': 'launcher_event', 'key': 'GLFW_MOUSE_BUTTON_LEFT'})
        elif k == -4:
            events.append({'type': 'launcher_event', 'key': 'GLFW_MOUSE_BUTTON_RIGHT'})
        elif k == -5:
            events.append({'type': 'launcher_event', 'key': 'launcher.event.switch_menu'})
            text = 'Menú'
        elif k < 0:
            raise SystemExit('keycode especial sin equivalente: %d (%s)' % (k, text))
        else:
            events.append({'type': 'key', 'key': glfw(k)})
    if codes and all(k in MOVE for k in codes):
        layer = LAYER_MOVE
    vis = 'always' if c['displayInGame'] and c['displayInMenu'] else 'in_game' if c['displayInGame'] else 'in_menu'

    def pct(v):
        return max(100, min(10000, round(v / H * 10000)))

    layers[layer].append({
        'text': {'default': text, 'matchQueue': []},
        'uuid': uid('btn', i, c['name']),
        'position': {'x': px, 'y': py},
        'buttonSize': {'type': 'percentage', 'widthDp': round(w, 2), 'heightDp': round(h, 2),
                       'widthPercentage': pct(w), 'heightPercentage': pct(h),
                       'widthReference': 'screen_height', 'heightReference': 'screen_height'},
        'buttonStyle': style(c),
        'textAlignment': 'Center',
        'visibilityType': vis,
        'clickEvents': events,
        'isSwipple': bool(c['isSwipeable']),
        'isPenetrable': bool(c['passThruEnabled']),
        'isToggleable': bool(c['isToggle']),
    })
    report.append('%-6s %-4s x=%5d y=%5d w=%4d tog=%d %s' % (
        text, names[layer], px, py, pct(w), c['isToggle'], [e['key'] for e in events]))


def mk_layer(name, u, buttons, **kw):
    return {'name': name, 'uuid': u, 'hide': False, 'hideWhenMouse': False, 'hideWhenGamepad': True,
            'visibilityType': 'always', **kw, 'normalButtons': buttons}


out = {
    'info': {'name': {'default': 'DBR', 'matchQueue': []}, 'author': {'default': 'Dbr', 'matchQueue': []},
             'description': {'default': 'Controles por defecto de Dragon Block Resurrection', 'matchQueue': []},
             'versionCode': 1, 'versionName': '1.0'},
    'layers': [mk_layer('gui', LAYER_GUI, layers[LAYER_GUI]),
               mk_layer('botones', LAYER_MAIN, layers[LAYER_MAIN]),
               mk_layer('movimiento', LAYER_MOVE, layers[LAYER_MOVE], hideWhenJoystick=True)],
    'styles': styles,
    'editorVersion': 11,
}
open(DST, 'w', encoding='utf-8', newline='\n').write(json.dumps(out, ensure_ascii=False, indent=2) + '\n')
sys.stdout.reconfigure(encoding='utf-8')
print('\n'.join(report))
print(len(styles), 'estilos')
