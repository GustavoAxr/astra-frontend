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
  /**
   * Si este teléfono ya tiene huella activada.
   *
   * ES UNA PISTA, NO UN PERMISO. Quien manda es el servidor: si hay llave, la
   * checada sin firma se rechaza venga de donde venga. Esto solo evita pedir
   * la huella a quien no la tiene y ahorrar un viaje de ida y vuelta.
   *
   * Vive dentro del mismo registro que el token, y eso es lo correcto: si el
   * token desaparece, el teléfono se vuelve a dar de alta entero y la llave se
   * activa otra vez. Guardarlo aparte solo abriría la puerta a que uno
   * sobreviviera al otro.
   */
  conLlave?: boolean
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

    return {
      token: dato.token,
      venceEl: dato.venceEl,
      conLlave: dato.conLlave === true,
    }
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

/** Deja constancia de que este teléfono ya tiene huella. */
export function marcarConLlave(entityId: string): void {
  const guardado = leerTelefono(entityId)
  if (guardado === null) return
  guardarTelefono(entityId, { ...guardado, conLlave: true })
}

export function olvidarTelefono(entityId: string): void {
  try {
    localStorage.removeItem(clave(entityId))
  } catch {
    /* Nada que hacer, y nada que se rompa por no hacerlo. */
  }
}

/**
 * CUÁL FUE LA ÚLTIMA EMPRESA.
 *
 * Existe por el icono de la pantalla de inicio. El manifiesto de una
 * aplicación instalable es un archivo estático: su `start_url` no puede llevar
 * dentro el identificador de una razón social, así que el icono apunta a
 * `/remoto` a secas y es aquí donde se averigua a dónde ir.
 *
 * Se guarda aparte del token y NO dentro de él: es la respuesta a «¿a dónde
 * llevo a esta persona?», y tiene que sobrevivir a que el token se borre —a
 * alguien a quien se le venció el teléfono hay que llevarlo a pedir un código
 * de SU empresa, no a una pantalla que le pregunte cuál era—.
 */
const CLAVE_ULTIMA = 'astra.remoto.ultimaEmpresa'

export function recordarEmpresa(entityId: string): void {
  try {
    localStorage.setItem(CLAVE_ULTIMA, entityId)
  } catch {
    /* Sin almacenamiento el icono llevará a la pantalla que lo explica. */
  }
}

export function ultimaEmpresa(): string | null {
  try {
    const valor = localStorage.getItem(CLAVE_ULTIMA)
    /*
     * Se comprueba la FORMA, no solo que haya algo. Un valor corrupto —de una
     * versión anterior, o de alguien tocando el almacenamiento— acabaría en la
     * ruta como `/remoto/basura` y el servidor contestaría un 400 que nadie
     * sabría leer. Mejor tratarlo como si no hubiera nada.
     */
    if (valor === null || !/^[0-9a-f-]{36}$/i.test(valor)) return null
    return valor
  } catch {
    return null
  }
}
