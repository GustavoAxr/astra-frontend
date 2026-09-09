/**
 * DÓNDE VIVE EL TOKEN DEL TELÉFONO.
 *
 * En `localStorage` y no en una cookie, y la razón es que **el token ES el
 * teléfono**: si viajara solo en una cookie, cerrar la pestaña en modo privado
 * o una limpieza de sitio lo perdería, y la persona tendría que volver a pedir
 * un código cada semana. Aquí sobrevive a cerrar el navegador, que es el
 * comportamiento que alguien espera de «este teléfono ya está dado de alta».
 *
 * QUÉ SIGNIFICA QUE ESTÉ AQUÍ Y NO EN UNA COOKIE HttpOnly
 * Que un script en esta página podría leerlo. Es un riesgo REAL y se acepta a
 * conciencia: esta pantalla no carga nada de terceros, y la alternativa —una
 * cookie de sesión— no sobrevive al caso de uso. Lo que compensa el riesgo está
 * del otro lado: el token vence a los noventa días, se puede revocar desde
 * Astra, y CADA CHECADA manda un acuse al correo de la persona.
 *
 * Se guarda por empresa. Alguien puede estar dado de alta en dos razones
 * sociales del mismo grupo y una clave única las pisaría entre sí.
 */
const PREFIJO = 'astra.remoto.telefono'

export interface TelefonoGuardado {
  token: string
  venceEl: string
}

const clave = (entityId: string): string => `${PREFIJO}.${entityId}`

export function leerTelefono(entityId: string): TelefonoGuardado | null {
  try {
    const crudo = localStorage.getItem(clave(entityId))
    if (crudo === null) return null

    const dato = JSON.parse(crudo) as Partial<TelefonoGuardado>
    if (typeof dato.token !== 'string' || typeof dato.venceEl !== 'string') {
      return null
    }

    /*
     * Se comprueba el vencimiento AQUÍ además de en el servidor. No es
     * seguridad —quien manipule esto se salta la comprobación— sino cortesía:
     * enseñar «vuelve a dar de alta tu teléfono» antes de que la persona pida
     * el GPS y espere veinte segundos para recibir un error.
     */
    if (new Date(dato.venceEl).getTime() <= Date.now()) return null

    return { token: dato.token, venceEl: dato.venceEl }
  } catch {
    // Modo privado, almacenamiento lleno o un valor de una versión anterior.
    // Ninguno es motivo para tumbar la pantalla: se hace como si no hubiera.
    return null
  }
}

export function guardarTelefono(entityId: string, dato: TelefonoGuardado): void {
  try {
    localStorage.setItem(clave(entityId), JSON.stringify(dato))
  } catch {
    /*
     * Si no se pudo guardar, la checada de HOY funciona igual —el token está en
     * memoria— y mañana se pedirá otro código. Peor sería no dejar checar.
     */
  }
}

export function olvidarTelefono(entityId: string): void {
  try {
    localStorage.removeItem(clave(entityId))
  } catch {
    /* Nada que hacer, y nada que se rompa por no hacerlo. */
  }
}
