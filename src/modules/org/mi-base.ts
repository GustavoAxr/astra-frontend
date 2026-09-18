/**
 * CUÁL ES «MI» BASE EN ESTE TELÉFONO.
 *
 * ══ PARA QUÉ ══
 *
 * Para que el cartel se pueda añadir a la pantalla de inicio y abrirse de un
 * toque al día siguiente. El manifiesto de una aplicación instalable es un
 * archivo estático: su `start_url` no puede llevar dentro el identificador de
 * una razón social ni el de una base. Así que la dirección instalada es
 * `/checar` a secas, y aquí se recuerda a dónde llevaba.
 *
 * Es lo mismo que hace el checado a distancia con su empresa, y por lo mismo.
 *
 * ══ ESTO NO ES UNA CREDENCIAL ══
 *
 * Son dos identificadores que van escritos en un cartel pegado a una puerta, a
 * la vista de cualquiera que pase. Quien se lleve el teléfono no puede checar
 * con esto: le seguirá haciendo falta la cara o el código, que no se guardan en
 * el navegador en ningún momento.
 */

const CLAVE = 'clocc.mi-base'

export interface MiBase {
  entityId: string
  installationId: string
}

/** Se comprueba la FORMA: un valor corrupto acabaría en la ruta y daría un 400. */
const esUuid = (v: unknown): v is string =>
  typeof v === 'string' && /^[0-9a-f-]{36}$/i.test(v)

export function recordarMiBase(base: MiBase): void {
  try {
    localStorage.setItem(CLAVE, JSON.stringify(base))
  } catch {
    /* Sin almacenamiento, el icono llevará a la pantalla que lo explica. */
  }
}

export function miBase(): MiBase | null {
  try {
    const crudo = localStorage.getItem(CLAVE)
    if (crudo === null) return null
    const leido = JSON.parse(crudo) as Partial<MiBase>
    if (!esUuid(leido.entityId) || !esUuid(leido.installationId)) return null
    return { entityId: leido.entityId, installationId: leido.installationId }
  } catch {
    return null
  }
}
