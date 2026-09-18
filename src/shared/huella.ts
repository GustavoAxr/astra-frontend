import {
  WebAuthnError,
  browserSupportsWebAuthn,
  platformAuthenticatorIsAvailable,
} from '@simplewebauthn/browser'

/**
 * LA HUELLA DEL PROPIO APARATO, en lo que no depende de para qué se use.
 *
 * Vive en `shared` y no dentro de un módulo porque hay DOS sitios que piden la
 * huella por razones distintas —checar a distancia y registrar la credencial de
 * la puerta— y las dos preguntas de abajo son las mismas para ambos. Duplicadas
 * se habrían desviado: una traduciría `NotAllowedError` como «vuelve a
 * intentarlo» y la otra como «tu teléfono no puede», y la misma persona leería
 * dos explicaciones distintas del mismo error.
 *
 * Lo que sí es de cada módulo es QUÉ se firma y contra qué ruta, y eso se queda
 * en su sitio.
 */

/**
 * ¿Este aparato puede tener huella?
 *
 * Se preguntan las dos cosas y hacen falta las dos: que el navegador entienda
 * WebAuthn, y que el aparato tenga un autenticador PROPIO —huella, cara, PIN
 * del sistema—. Un navegador de escritorio sin lector cumple la primera y no
 * la segunda, y ofrecerle activar la huella sería mandarlo a un diálogo que
 * termina en nada.
 */
export async function sePuedeUsarHuella(): Promise<boolean> {
  if (!browserSupportsWebAuthn()) return false
  try {
    return await platformAuthenticatorIsAvailable()
  } catch {
    return false
  }
}

/**
 * El error de WebAuthn, en palabras.
 *
 * Se distinguen los tres casos que llevan a acciones distintas, y solo esos:
 * volver a intentarlo, usar otro teléfono, o avisar a sistemas. Enumerar los
 * quince nombres de error de la especificación no ayudaría a nadie que tenga
 * que checar y llegue tarde.
 */
export function loQuePasoConLaHuella(e: unknown): string {
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
        return 'Este teléfono no puede usar huella. Puedes usar un PIN.'
      default:
        return 'No pudimos usar la huella de este teléfono. Vuelve a intentarlo.'
    }
  }
  return e instanceof Error ? e.message : 'No pudimos usar la huella de este teléfono.'
}
