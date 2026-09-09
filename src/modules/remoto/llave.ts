import {
  WebAuthnError,
  browserSupportsWebAuthn,
  platformAuthenticatorIsAvailable,
  startAuthentication,
  startRegistration,
} from '@simplewebauthn/browser'
import type { AuthenticationResponseJSON } from '@simplewebauthn/browser'

import { remotoApi } from './api'

/**
 * LA HUELLA DEL PROPIO TELÉFONO.
 *
 * Envuelve `@simplewebauthn/browser` para dejar en la pantalla solo dos verbos
 * —activar y firmar— y, sobre todo, para traducir sus errores. Los que salen
 * de la biblioteca están escritos para quien programa («The operation either
 * timed out or was not allowed»); quien tiene el teléfono en la mano necesita
 * saber si tiene que volver a poner el dedo o llamar a Recursos Humanos.
 */

/**
 * ¿Este teléfono puede tener llave?
 *
 * Se preguntan las dos cosas y hacen falta las dos: que el navegador entienda
 * WebAuthn, y que el aparato tenga un autenticador PROPIO —huella, cara, PIN
 * del sistema—. Un navegador de escritorio sin lector cumple la primera y no
 * la segunda, y ofrecerle activar la huella sería mandarlo a un diálogo que
 * termina en nada.
 */
export async function sePuedeUsarLlave(): Promise<boolean> {
  if (!browserSupportsWebAuthn()) return false
  try {
    return await platformAuthenticatorIsAvailable()
  } catch {
    return false
  }
}

/**
 * Da de alta la llave en este teléfono.
 *
 * A partir de que esto termina bien, este teléfono YA NO PUEDE checar sin
 * firmar: lo impone el servidor. Es la parte que conviene que la pantalla diga
 * antes, no después.
 */
export async function activarLlave(
  entityId: string,
  token: string,
): Promise<void> {
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

/**
 * El error de WebAuthn, en palabras.
 *
 * Se distinguen los tres casos que llevan a acciones distintas, y solo esos:
 * volver a intentarlo, usar otro teléfono, o avisar a sistemas. Enumerar los
 * quince nombres de error de la especificación no ayudaría a nadie que tenga
 * que checar y llegue tarde.
 */
export function loQuePasoConLaLlave(e: unknown): string {
  if (e instanceof WebAuthnError) {
    switch (e.name) {
      case 'NotAllowedError':
        /*
         * El mismo error para «canceló» y «se agotó el tiempo»: la
         * especificación los junta A PROPÓSITO, para que una página no pueda
         * distinguir si hay alguien delante. No se puede afinar más, y
         * pretender lo contrario sería inventar.
         */
        return 'No se completó. Vuelve a intentarlo y pon tu huella cuando el teléfono te la pida.'
      case 'InvalidStateError':
        return 'Este teléfono ya tiene la huella activada.'
      case 'NotSupportedError':
        return 'Este teléfono no puede usar huella para checar. Puedes checar sin ella.'
      default:
        return 'No pudimos usar la huella de este teléfono. Vuelve a intentarlo.'
    }
  }
  return e instanceof Error
    ? e.message
    : 'No pudimos usar la huella de este teléfono.'
}
