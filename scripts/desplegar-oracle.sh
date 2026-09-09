#!/usr/bin/env bash
#
# PUBLICA EL FRONTEND EN astra.codegahp.com (Oracle).
#
# El front es HTML y JavaScript estáticos: no hay servicio que reiniciar ni
# proceso que se caiga. Publicar es copiar archivos, y por eso este guion cabe
# en una pantalla.
#
# LA DIRECCIÓN DE LA API VA AQUÍ Y NO EN UN .env, a propósito. Los `.env` están
# gitignoreados —y deben estarlo, llevan secretos— pero esto no es un secreto:
# es la decisión de a qué servidor le habla la aplicación publicada. Escondida
# en un archivo sin versionar, nadie puede ver desde el repositorio a dónde
# apunta lo que está en producción, y una equivocación ahí solo se descubre
# cuando la gente no puede checar.
#
#   ./scripts/desplegar-oracle.sh
#
set -euo pipefail

SERVIDOR="ubuntu@157.137.185.154"
CLAVE="${CLAVE_ORACLE:-$HOME/.ssh/ssh-key-oracle2.key}"
DESTINO="/var/www/astra"

export VITE_API_URL="https://apiastra.codegahp.com"

raiz="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$raiz"

echo "→ Compilando con VITE_API_URL=$VITE_API_URL"
npm run build

# Comprobación barata que evita el fallo más caro: publicar un paquete que
# sigue apuntando a localhost porque alguien tocó la variable.
if grep -rq "localhost:300" dist/assets/ 2>/dev/null; then
  echo "ABORTADO: el paquete compilado todavía menciona localhost." >&2
  exit 1
fi

echo "→ Copiando a $SERVIDOR:$DESTINO"
# `--delete` para que un archivo que ya no se genera desaparezca del servidor.
# Sin él, un `sw.js` viejo sobreviviría a la versión que lo quitó y seguiría
# gobernando la caché de todos los teléfonos.
rsync -az --delete -e "ssh -i $CLAVE -o BatchMode=yes" dist/ "$SERVIDOR:$DESTINO/"

echo "→ Publicado. Comprobando:"
curl -s -o /dev/null -w "   https://astra.codegahp.com/ → %{http_code}\n" \
  --max-time 15 https://astra.codegahp.com/ || echo "   (sin respuesta todavía)"
