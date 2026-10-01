# Responde el diálogo «Guardar» o «Abrir» del sistema (GTK) como una persona: le da el foco, escribe la ruta
# completa y presiona Enter. Solo para las pruebas de extremo a extremo en Linux (Xvfb, sin gestor de ventanas).
# Usa libX11 y libxdo (paquete libxdo3, que ya exige Tauri en Linux) con ctypes; no necesita instalar nada más.
# Uso: python3 pruebas-e2e/dialogo.py "<ruta>" [segundos de espera]
import ctypes
import sys
import time

ruta = sys.argv[1].encode()
espera = float(sys.argv[2]) if len(sys.argv) > 2 else 15

x11 = ctypes.CDLL("libX11.so.6")
xdo = ctypes.CDLL("libxdo.so.3")
x11.XOpenDisplay.restype = ctypes.c_void_p
x11.XDefaultRootWindow.restype = ctypes.c_ulong
x11.XDefaultRootWindow.argtypes = [ctypes.c_void_p]
x11.XQueryTree.argtypes = [ctypes.c_void_p, ctypes.c_ulong, ctypes.POINTER(ctypes.c_ulong), ctypes.POINTER(ctypes.c_ulong),
                           ctypes.POINTER(ctypes.POINTER(ctypes.c_ulong)), ctypes.POINTER(ctypes.c_uint)]
x11.XFetchName.argtypes = [ctypes.c_void_p, ctypes.c_ulong, ctypes.POINTER(ctypes.c_char_p)]
x11.XSetInputFocus.argtypes = [ctypes.c_void_p, ctypes.c_ulong, ctypes.c_int, ctypes.c_ulong]
x11.XRaiseWindow.argtypes = [ctypes.c_void_p, ctypes.c_ulong]
x11.XFlush.argtypes = [ctypes.c_void_p]
x11.XSync.argtypes = [ctypes.c_void_p, ctypes.c_int]


class Atributos(ctypes.Structure):
    _fields_ = [("x", ctypes.c_int), ("y", ctypes.c_int), ("width", ctypes.c_int), ("height", ctypes.c_int),
                ("border_width", ctypes.c_int), ("depth", ctypes.c_int), ("visual", ctypes.c_void_p),
                ("root", ctypes.c_ulong), ("c_class", ctypes.c_int), ("bit_gravity", ctypes.c_int),
                ("win_gravity", ctypes.c_int), ("backing_store", ctypes.c_int), ("backing_planes", ctypes.c_ulong),
                ("backing_pixel", ctypes.c_ulong), ("save_under", ctypes.c_int), ("colormap", ctypes.c_ulong),
                ("map_installed", ctypes.c_int), ("map_state", ctypes.c_int), ("all_event_masks", ctypes.c_long),
                ("your_event_mask", ctypes.c_long), ("do_not_propagate_mask", ctypes.c_long),
                ("override_redirect", ctypes.c_int), ("screen", ctypes.c_void_p)]


x11.XGetWindowAttributes.argtypes = [ctypes.c_void_p, ctypes.c_ulong, ctypes.POINTER(Atributos)]
xdo.xdo_new.restype = ctypes.c_void_p
xdo.xdo_new.argtypes = [ctypes.c_char_p]
xdo.xdo_enter_text_window.argtypes = [ctypes.c_void_p, ctypes.c_ulong, ctypes.c_char_p, ctypes.c_uint]
xdo.xdo_send_keysequence_window.argtypes = [ctypes.c_void_p, ctypes.c_ulong, ctypes.c_char_p, ctypes.c_uint]

pantalla = x11.XOpenDisplay(None)
raiz = x11.XDefaultRootWindow(pantalla)
TITULOS = (b"Guardar", b"Abrir", b"Save", b"Open")


def buscar_dialogo():
    r, p = ctypes.c_ulong(), ctypes.c_ulong()
    hijos, n = ctypes.POINTER(ctypes.c_ulong)(), ctypes.c_uint()
    x11.XQueryTree(pantalla, raiz, ctypes.byref(r), ctypes.byref(p), ctypes.byref(hijos), ctypes.byref(n))
    for i in range(n.value):
        ventana = hijos[i]
        nombre = ctypes.c_char_p()
        atributos = Atributos()
        x11.XGetWindowAttributes(pantalla, ventana, ctypes.byref(atributos))
        if atributos.map_state == 2 and x11.XFetchName(pantalla, ventana, ctypes.byref(nombre)) and nombre.value:
            if any(t in nombre.value for t in TITULOS):
                return ventana, nombre.value.decode(errors="replace")
    return None, None


limite = time.time() + espera
ventana, titulo = buscar_dialogo()
while ventana is None and time.time() < limite:
    time.sleep(0.2)
    ventana, titulo = buscar_dialogo()
if ventana is None:
    sys.exit("No apareció el diálogo del sistema")

time.sleep(0.8)  # que termine de dibujarse
x11.XRaiseWindow(pantalla, ventana)
x11.XSetInputFocus(pantalla, ventana, 2, 0)  # RevertToParent, CurrentTime
x11.XSync(pantalla, 0)
time.sleep(0.3)
teclado = xdo.xdo_new(None)
# Ctrl+L abre la barra de ubicación del diálogo de GTK; Ctrl+A borra el nombre sugerido.
xdo.xdo_send_keysequence_window(teclado, 0, b"ctrl+l", 20000)
time.sleep(0.3)
xdo.xdo_send_keysequence_window(teclado, 0, b"ctrl+a", 20000)
xdo.xdo_enter_text_window(teclado, 0, ruta, 20000)
time.sleep(0.3)
xdo.xdo_send_keysequence_window(teclado, 0, b"Return", 20000)
print(f"Diálogo «{titulo}» respondido con {ruta.decode()}")
