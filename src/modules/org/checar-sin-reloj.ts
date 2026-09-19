import type {
  AuthenticationResponseJSON,
  PublicKeyCredentialRequestOptionsJSON,
} from '@simplewebauthn/browser'

import { http } from '@/shared/api/http'

/**
 * CHECAR SIN RELOJ, desde el teléfono de quien está en la puerta.
 *
 * Vive en `org` y no en un módulo propio porque **es una propiedad de la base**,
 * como su domicilio o su área: cada instalación tiene su cartel y vale siempre.
 * Un módulo aparte pedía una pantalla aparte, y esa pantalla obligaba a que
 * alguien «abriera la contingencia» antes de que nadie pudiera checar — un
 * trámite en el peor momento posible.
 *
 * Las tres llamadas van con `skipRefresh` porque no hay sesión que refrescar:
 * sin eso, un 401 dispararía un intento de refresco que también fallaría, y la
 * persona vería un error de sesión en una pantalla que nunca pidió sesión.
 */
export interface BaseVistaDesdeElTelefono {
  installationName: string
  /** Si es `false`, esa base acepta desde cualquier parte: falta dibujar su área. */
  tieneArea: boolean
}

/** Qué le va a pedir la puerta a esta persona para dejarla checar. */
export type LoQuePideLaPuerta = 'HUELLA' | 'PIN' | 'NADA'

/**
 * EL PERMISO YA NO TRAE EL NOMBRE, y no es un descuido.
 *
 * Lo traía, y eso convertía el cartel de la puerta en un directorio: con probar
 * números salía la plantilla entera, y con la plantilla en la mano, fichar por
 * cualquiera. El nombre llega al final, con la checada ya registrada.
 */
export interface PermisoParaChecar {
  nonce: string
  expiresAt: string
  pide: LoQuePideLaPuerta
  /** Solo cuando pide huella: lo que el navegador necesita para firmar. */
  opciones?: PublicKeyCredentialRequestOptionsJSON
  /** Tiene las dos y puede cambiar: hay días en que el lector no lee. */
  tambienPin: boolean
}

/**
 * QUÉ PASÓ CON LA PUERTA.
 *
 * `NO_CONFIGURADA` es el caso normal —ese sitio no tiene la apertura encendida y
 * la puerta se abre como siempre— y por eso no se pinta. Los otros tres sí: la
 * persona está delante de un imán que no se movió y necesita saber si empujar,
 * esperar o buscar a alguien con llave.
 */
export type EstadoDeLaPuerta =
  'NO_CONFIGURADA' | 'SIN_AREA' | 'PEDIDA' | 'RELOJ_APAGADO' | 'NO_SE_PUDO'

export interface ChecadaDeLaPuerta {
  cuando: string
  /** Aparece aquí y en ningún otro sitio: es el acuse, no un directorio. */
  nombreCorto: string
  puerta: EstadoDeLaPuerta
}

/** El reto para firmar sin decir quién eres. Lo resuelve la propia credencial. */
export interface RetoSinNumero {
  nonce: string
  opciones: PublicKeyCredentialRequestOptionsJSON
}

export const checarSinReloj = {
  retoSinNumero: (entityId: string, installationId: string) =>
    http.post<RetoSinNumero>(
      `/contingency/${entityId}/${installationId}/passkey/options`,
      {},
      { skipRefresh: true },
    ),

  /**
   * LA CHECADA DE QUIEN TECLEÓ SU CÓDIGO PERSONAL.
   *
   * Sin número de empleado: el código lo inventó esa persona y solo lo sabe
   * ella, mientras que el número va escrito en el gafete que lleva colgado.
   * Pedir los dos era pedir un secreto y un dato público.
   */
  checarConCodigo: (
    entityId: string,
    installationId: string,
    cuerpo: {
      codigo: string
      lat: number
      lng: number
      accuracyMeters?: number
    },
  ) =>
    http.post<ChecadaDeLaPuerta>(`/contingency/${entityId}/${installationId}/code/punch`, cuerpo, {
      skipRefresh: true,
    }),

  /**
   * LA CHECADA DE QUIEN NO TECLEÓ NADA.
   *
   * Sin número y sin permiso: quién es lo dice la firma, que lleva dentro a qué
   * credencial pertenece. Lo que impide repetirla es el reto, que sirve una vez.
   */
  checarConHuella: (
    entityId: string,
    installationId: string,
    cuerpo: {
      nonce: string
      lat: number
      lng: number
      accuracyMeters?: number
      firma: AuthenticationResponseJSON
    },
  ) =>
    http.post<ChecadaDeLaPuerta>(
      `/contingency/${entityId}/${installationId}/passkey/punch`,
      cuerpo,
      { skipRefresh: true },
    ),

  mirar: (entityId: string, installationId: string, signal?: AbortSignal) =>
    http.get<BaseVistaDesdeElTelefono>(`/contingency/${entityId}/${installationId}`, {
      skipRefresh: true,
      signal,
    }),

  identificar: (entityId: string, installationId: string, employeeCode: string) =>
    http.post<PermisoParaChecar>(
      `/contingency/${entityId}/${installationId}/identify`,
      { employeeCode },
      { skipRefresh: true },
    ),

  checar: (
    entityId: string,
    installationId: string,
    cuerpo: {
      nonce: string
      lat: number
      lng: number
      accuracyMeters?: number
      /* Una de las dos, la que haya pedido el paso anterior. Nunca las dos. */
      pin?: string
      firma?: AuthenticationResponseJSON
    },
  ) =>
    http.post<ChecadaDeLaPuerta>(`/contingency/${entityId}/${installationId}/punch`, cuerpo, {
      skipRefresh: true,
    }),
}
