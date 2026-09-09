import type { Role } from '@/modules/auth/types'
import type { Adjustment } from './types'

/**
 * QUIÉN PUEDE FIRMAR QUÉ, del lado de la pantalla.
 *
 * Es un ESPEJO de `overtime-approval.ts` del backend, que es quien manda. Aquí
 * solo sirve para no ofrecer un botón que va a fallar: RRHH veía «Aprobar»
 * sobre una solicitud que ya había firmado, la pulsaba y le respondía un error.
 * Un botón que siempre falla hace creer que el sistema está roto.
 *
 * OCULTA, NO PROTEGE. Si esta tabla se queda vieja, el peor síntoma posible es
 * un botón de más o de menos: el servidor rechaza igual, y antes que él, una
 * restricción de la base.
 */

export type PapelDeFirma = 'RRHH' | 'DIRECCION'

/** Los dos papeles, en el orden en que se pintan. */
export const PAPELES: readonly PapelDeFirma[] = ['RRHH', 'DIRECCION']

/**
 * Qué papel firma esta persona, según sus roles.
 *
 * La dirección de la razón social y la del grupo firman las dos como
 * DIRECCIÓN; cuál de ellas llega a ver una solicitud lo decide RLS.
 */
export function papelDe(roles: readonly Role[]): PapelDeFirma | null {
  if (roles.includes('RRHH')) return 'RRHH'
  if (roles.includes('ADMIN_EMPRESA') || roles.includes('DIRECTOR_HOLDING')) return 'DIRECCION'
  return null
}

export interface Firmabilidad {
  puede: boolean
  /** Por qué no. Se pinta en lugar de los botones, para no dejar un hueco mudo. */
  motivo?: string
}

/**
 * Si quien está mirando puede firmar esta solicitud ahora mismo.
 *
 * Las mismas cuatro preguntas que hace el servidor, en el mismo orden: ¿tu rol
 * firma?, ¿sigue pendiente?, ¿la pediste tú?, ¿ya pusiste tu firma?
 */
export function puedeFirmar(
  solicitud: Adjustment,
  usuario: { id: string; roles: readonly Role[] },
): Firmabilidad {
  const papel = papelDe(usuario.roles)

  if (papel === null) return { puede: false, motivo: 'Tu rol no firma solicitudes.' }
  if (solicitud.status !== 'PENDING') return { puede: false }

  if (solicitud.requestedBy === usuario.id) {
    return { puede: false, motivo: 'La pediste tú: tiene que firmarla otra persona.' }
  }

  if (solicitud.approvals.some((f) => f.kind === papel)) {
    return { puede: false, motivo: 'Ya pusiste tu firma. Falta la otra.' }
  }

  return { puede: true }
}

/** Los papeles que todavía no han firmado. */
export function firmasQueFaltan(solicitud: Adjustment): PapelDeFirma[] {
  // Lo que detectó el reloj no lo pidió nadie y se resuelve con una sola firma.
  if (solicitud.requestedBy === null) return []
  const puestas = new Set(solicitud.approvals.map((f) => f.kind))
  return PAPELES.filter((papel) => !puestas.has(papel))
}
