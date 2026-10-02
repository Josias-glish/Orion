#!/bin/sh
# CA-10 y CA-30: corre las pruebas de extremo a extremo de las etapas 2, 3, 4 y 6 con el programa real y la red
# desactivada. Cubre los flujos 0 (etapa 2), 1 y 2 (etapa 3), 3 y 5 (etapa 4) y los sementales de otras fincas
# (etapa 6). Solo Linux; ver docs/PRUEBA_TECNICA.md. CA-33 tiene su propia prueba: pruebas-e2e/actualizacion.mjs.
#
# Uso, desde la raíz del proyecto y como administrador (unshare necesita permisos):
#   npx tauri build --debug --no-bundle
#   sudo sh pruebas-e2e/todas.sh capturas
#
# «unshare -n» crea un espacio de red vacío: dentro no hay más interfaz que «lo» (el propio equipo), así que
# cualquier intento de conectarse a internet falla. Se levanta «lo» porque tauri-driver usa 127.0.0.1.
set -u
CAPTURAS="$(realpath -m "${1:-capturas}")"
mkdir -p "$CAPTURAS"
PROGRAMA="$PWD/src-tauri/target/debug/registro-caprino"
DATOS="${XDG_CONFIG_HOME:-$HOME/.config}/co.registrocaprino.escritorio"
FALLOS=0

for ETAPA in etapa2 etapa3 etapa4 etapa6; do
  echo "=== $ETAPA (sin red) ==="
  rm -rf "$DATOS/registro-caprino.db" "$DATOS/registro-caprino.db-wal" "$DATOS/registro-caprino.db-shm" "$DATOS/documentos" "$DATOS/fotos"
  unshare -n sh -c "
    if command -v ip >/dev/null; then ip link set lo up; else python3 pruebas-e2e/levantar-lo.py; fi
    echo \"Interfaces de red disponibles: \$(tail -n +3 /proc/net/dev | cut -d: -f1 | tr -d ' ' | tr '\n' ' ')\"
    xvfb-run -a node pruebas-e2e/$ETAPA.mjs '$PROGRAMA' '$CAPTURAS/$ETAPA'
  " 2>&1 | grep -v "libEGL\|dconf\|Gtk-CRITICAL" | tee "$CAPTURAS-$ETAPA.txt"
  grep -q "✘" "$CAPTURAS-$ETAPA.txt" && FALLOS=$((FALLOS + 1))
done

echo
for ETAPA in etapa2 etapa3 etapa4 etapa6; do echo "$ETAPA: $(tail -n 1 "$CAPTURAS-$ETAPA.txt")"; done
[ "$FALLOS" -eq 0 ] && echo "CA-10: los flujos 0, 1, 2, 3 y 5 y los sementales de otras fincas funcionan sin red." || echo "Hubo fallos en $FALLOS etapas."
exit "$FALLOS"
