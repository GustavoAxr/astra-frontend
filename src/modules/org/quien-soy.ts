/**
 * QUIÉN SOY EN ESTE TELÉFONO.
 *
 * ══ QUÉ PROBLEMA RESUELVE ══
 *
 * El cartel de la puerta pedía el número de empleado CADA VEZ. Tenía sentido
 * cuando la contingencia era un teléfono compartido pegado a una puerta, pero
 * no lo tiene desde que cada quien llega con el suyo y trae su credencial
 * registrada: si el teléfono ya demostró de quién es, volver a preguntarle el
 * número es tratarlo como si fuera de cualquiera.
 *
 * Así que se recuerda AQUÍ, en el aparato, y en cuanto hay memoria la pantalla
 * salta directa a la huella o al PIN.
 *
 * ══ ESTO NO ES UNA CREDENCIAL, Y POR ESO PUEDE VIVIR AQUÍ ══
 *
 * Lo que se guarda es un número de empleado que va escrito en el gafete y un
 * nombre que esa persona ya conoce. Quien se lleve el teléfono no puede checar
 * con esto: le seguirá haciendo falta la huella o el PIN, que es justo lo que
 * NO se guarda en ninguna parte del navegador. Si el almacenamiento se pierde
 * —modo privado, datos borrados—, lo único que pasa es que hay que teclear el
 * número una vez más.
 *
 * SE GUARDA POR EMPRESA porque el mismo aparato puede escanear el cartel de dos
 * razones sociales distintas, y el número de empleado solo significa algo
 * dentro de la suya.
 */

export interface QuienSoy {
  employeeCode: string
  /** Para saludar sin preguntarle al servidor. Lo dijo él mismo al registrarse. */
  nombreCorto: string
}

const llave = (entityId: string): string => `clocc.quien-soy.${entityId}`

export function recordarQuienSoy(entityId: string, quien: QuienSoy): void {
  try {
    localStorage.setItem(llave(entityId), JSON.stringify(quien))
  } catch {
    // Modo privado, cuota llena o almacenamiento bloqueado. No es un fallo que
    // haya que contarle a nadie: la pantalla sigue funcionando pidiendo el
    // número, que es exactamente lo que hacía antes.
  }
}

export function quienSoy(entityId: string): QuienSoy | null {
  try {
    const crudo = localStorage.getItem(llave(entityId))
    if (crudo === null) return null
    const leido = JSON.parse(crudo) as Partial<QuienSoy>
    if (typeof leido.employeeCode !== 'string' || leido.employeeCode === '') return null
    return {
      employeeCode: leido.employeeCode,
      nombreCorto: typeof leido.nombreCorto === 'string' ? leido.nombreCorto : '',
    }
  } catch {
    return null
  }
}

/** «No soy yo»: el aparato pasó a otras manos, o lo prestó un rato. */
export function olvidarQuienSoy(entityId: string): void {
  try {
    localStorage.removeItem(llave(entityId))
  } catch {
    /* Ver arriba: no poder olvidar tampoco es algo que se pueda arreglar aquí. */
  }
}
