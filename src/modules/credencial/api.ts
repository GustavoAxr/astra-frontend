import type {
  PublicKeyCredentialCreationOptionsJSON,
  RegistrationResponseJSON,
} from '@simplewebauthn/browser'

import { http } from '@/shared/api/http'

/**
 * LA CREDENCIAL CON LA QUE SE PRUEBA QUIÉN ERES AL CHECAR EN LA PUERTA.
 *
 * Módulo propio y no dentro de `remoto` —donde vive la huella de home office—
 * porque son dos accesos distintos: aquel habilita un EQUIPO para checar desde
 * casa y este registra a la PERSONA para checar en su centro de trabajo con el
 * teléfono que traiga puesto ese día. Se ven por separado y se revocan por
 * separado.
 *
 * Las cuatro primeras llamadas van con `skipRefresh` por lo mismo que las del
 * cartel: no hay sesión que refrescar, y un 401 disparando un refresco solo
 * conseguiría enseñar un error de sesión a quien nunca pidió una.
 */

/** Lo que se sabe de la invitación DESPUÉS de teclear el código, nunca antes. */
export interface InvitacionCanjeada {
  nombre: string
  empresa: string
  tienePasskey: boolean
  tienePin: boolean
  /** Tenía algo y se le venció: es una renovación, no un estreno. */
  vencida: boolean
}

export interface CredencialRegistrada {
  listo: true
  nombre: string
  venceEl: string
}

/** Lo que ve RRHH. Nada de esto sirve para checar por nadie. */
export interface AccesoMovil {
  employeeId: string
  employeeName: string
  employeeCode: string
  tienePasskey: boolean
  tienePin: boolean
  venceEl: string | null
  invitacionViva: boolean
  invitacionEnviadaA: string | null
  invitacionVenceEl: string | null
}

/**
 * LAS DOS MITADES VIAJAN EN CADA LLAMADA.
 *
 * El `nonce` dice de qué invitación se trata y el código prueba que quien la
 * usa la recibió. No se guarda un pase intermedio porque sin sesión no hay
 * dónde, y fabricarlo sería inventar una sesión con otro nombre.
 */
export interface Invitacion {
  nonce: string
  codigo: string
}

export const credencialApi = {
  canjear: (entityId: string, invitacion: Invitacion) =>
    http.post<InvitacionCanjeada>(`/checkin-credentials/${entityId}/redeem`, invitacion, {
      skipRefresh: true,
    }),

  ponerPin: (entityId: string, invitacion: Invitacion, pin: string) =>
    http.post<CredencialRegistrada>(
      `/checkin-credentials/${entityId}/pin`,
      { ...invitacion, pin },
      { skipRefresh: true },
    ),

  opcionesDeHuella: (entityId: string, invitacion: Invitacion) =>
    http.post<PublicKeyCredentialCreationOptionsJSON>(
      `/checkin-credentials/${entityId}/passkey/options`,
      invitacion,
      { skipRefresh: true },
    ),

  registrarHuella: (
    entityId: string,
    invitacion: Invitacion,
    respuesta: RegistrationResponseJSON,
    etiqueta?: string,
  ) =>
    http.post<CredencialRegistrada>(
      `/checkin-credentials/${entityId}/passkey`,
      { ...invitacion, respuesta, ...(etiqueta ? { etiqueta } : {}) },
      { skipRefresh: true },
    ),

  /* ---- Y lo que se ve desde Clocc, con sesión ----------------------- */

  estado: (employeeId?: string, signal?: AbortSignal) =>
    http.get<AccesoMovil[]>('/checkin-credentials/status', {
      query: { employeeId },
      signal,
    }),

  /**
   * Mandarle la invitación con la que registra su PIN o su huella.
   *
   * SOLO EL ID viaja. Ni la empresa ni el correo: los dos salen del expediente
   * de esa persona en el servidor. Dejar que el correo viajara en el cuerpo
   * convertiría esto en una forma de mandar la invitación de cualquiera a la
   * dirección que uno quisiera.
   */
  invitar: (employeeId: string, email?: string) =>
    http.post<{ enviadoA: string; caduca: string }>('/checkin-credentials/invite', {
      employeeId,
      ...(email ? { email } : {}),
    }),

  revocar: (employeeId: string, kind: 'passkey' | 'pin' | 'todo' = 'todo') =>
    http.post<{ revocadas: number }>('/checkin-credentials/revoke', { employeeId, kind }),
}
