import type { Role } from './types'

/**
 * Espejo de los `@Roles(...)` del backend, **solo para ocultar lo que no
 * aplica**.
 *
 * `SOPORTE` aparece en TODAS: es el superadministrador del proveedor y por
 * decisión del cliente tiene las mismas acciones que la cuenta más alta.
 * `DIRECTOR_HOLDING` sigue sin escribir nada: ve todo el grupo y recibe avisos,
 * pero las altas las hacen la razón social o soporte. No es control de acceso: el permiso lo aplican el servidor y RLS,
 * y las llamadas se hacen igual si alguien llega por URL.
 *
 * Existe porque la alternativa es peor: enseñar un botón que siempre va a
 * devolver 403 hace que el usuario crea que el sistema está roto.
 *
 * Si el backend cambia sus `@Roles`, esta tabla se queda vieja y el único
 * síntoma es un botón de más o de menos — nunca un agujero de seguridad.
 * Sacada de `api-astra/src/modules/**\/*.controller.ts`.
 */
export const ACTION_ROLES = {
  createLegalEntity: ['DIRECTOR_HOLDING', 'SOPORTE'],
  editLegalEntity: ['DIRECTOR_HOLDING', 'ADMIN_EMPRESA', 'SOPORTE'],
  deleteLegalEntity: ['DIRECTOR_HOLDING', 'SOPORTE'],
  createInstallation: ['DIRECTOR_HOLDING', 'ADMIN_EMPRESA', 'SOPORTE'],
  editInstallation: ['DIRECTOR_HOLDING', 'ADMIN_EMPRESA', 'SOPORTE'],
  deleteInstallation: ['DIRECTOR_HOLDING', 'ADMIN_EMPRESA', 'SOPORTE'],
  discoverDevice: ['ADMIN_EMPRESA', 'SOPORTE'],
  enrollDevice: ['ADMIN_EMPRESA', 'SOPORTE'],
  previewReconciliation: ['RRHH', 'ADMIN_EMPRESA', 'SOPORTE'],
  applyReconciliation: ['RRHH', 'ADMIN_EMPRESA', 'SOPORTE'],
  listAgents: ['ADMIN_EMPRESA', 'SOPORTE', 'SUPERVISOR'],
  createAgent: ['ADMIN_EMPRESA', 'SOPORTE'],
  assignEmployee: ['RRHH', 'ADMIN_EMPRESA', 'SOPORTE'],
  deleteEmployee: ['RRHH', 'ADMIN_EMPRESA', 'SOPORTE'],
  requestOvertime: ['SUPERVISOR', 'RRHH', 'ADMIN_EMPRESA', 'SOPORTE'],
  /*
   * OJO: aquí SOPORTE **no** está, y es la única excepción de la tabla.
   *
   * El backend declara `@Roles('RRHH', 'ADMIN_EMPRESA')` en aprobar y rechazar
   * —comprobado en `attendance.controller.ts`—. Ponerlo aquí para respetar la
   * regla de «SOPORTE en todas» solo conseguiría enseñarle dos botones que
   * devuelven 403. Si la decisión es que soporte también firme, se cambia en el
   * backend y esta línea lo sigue; al revés no funciona.
   */
  approveOvertime: ['RRHH', 'ADMIN_EMPRESA'],
} as const satisfies Record<string, readonly Role[]>

export type Action = keyof typeof ACTION_ROLES

export function canDo(action: Action, roles: readonly Role[]): boolean {
  return ACTION_ROLES[action].some((role) => roles.includes(role))
}
