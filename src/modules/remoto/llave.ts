import { startAuthentication, startRegistration } from '@simplewebauthn/browser'
import type { AuthenticationResponseJSON } from '@simplewebauthn/browser'

import { remotoApi } from './api'

/**
 * LA HUELLA DEL PROPIO TELÉFONO.
 *
 * Envuelve `@simplewebauthn/browser` para dejar en la pantalla solo dos verbos:
 * activar y firmar. Lo que NO depende de para qué se firma —si el aparato puede
 * tener huella, y qué quiere decir cada error de la biblioteca— vive en
 * `@/shared/huella`, porque la pantalla de la credencial de puerta pregunta
 * exactamente lo mismo y dos copias se habrían desviado.
 */

/**
 * Da de alta la llave en este teléfono.
 *
 * A partir de que esto termina bien, este teléfono YA NO PUEDE checar sin
 * firmar: lo impone el servidor. Es la parte que conviene que la pantalla diga
 * antes, no después.
 */
export async function activarLlave(entityId: string, token: string): Promise<void> {
  const opciones = await remotoApi.opcionesDeLlave(entityId, token)
  const respuesta = await startRegistration({ optionsJSON: opciones })
  await remotoApi.activarLlave(entityId, token, respuesta)
}

/** Pide la huella y devuelve la firma de ESTA checada. */
export async function firmarChecada(
  entityId: string,
  token: string,
): Promise<AuthenticationResponseJSON> {
  const opciones = await remotoApi.opcionesDeChecada(entityId, token)
  return startAuthentication({ optionsJSON: opciones })
}
