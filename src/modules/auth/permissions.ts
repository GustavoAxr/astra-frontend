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
  /*
   * ADMINISTRAR USUARIOS, y la dirección aparece aquí a propósito.
   *
   * `DIRECTOR_HOLDING` no escribe en ningún otro sitio de la API —es un rol de
   * lectura sobre todo el grupo—, pero decidir QUIÉN ADMINISTRA es justamente
   * lo suyo. El precio hay que decirlo: quien concede roles puede concederse
   * uno a sí mismo. En una herramienta de una sola empresa eso es lo normal, y
   * queda registrado quién concedió qué.
   */
  /*
   * LA BANDEJA DE CORREOS ES SOLO DE RRHH, por decisión suya.
   *
   * No es una pantalla de diagnóstico: enseña el CUERPO de los correos, y esos
   * correos llevan la clave de puerta de gente real. Quien la abre tiene que
   * ser quien ya maneja esos datos. El efecto de esto es que `SOPORTE` —quien
   * depuraría un fallo de correo— no la ve.
   */
  /*
   * LA CARGA MASIVA ES SOLO DEL PROVEEDOR, por decisión suya.
   *
   * Da de alta a doscientas personas de una vez: es trabajo de puesta en
   * marcha, no de la operación diaria. Ni RRHH ni la administración de la
   * empresa la ven.
   *
   * Se ata al rol y no a una cuenta porque el sistema concede permisos a roles
   * dentro de un alcance, no a personas. Hoy `SOPORTE` es exactamente
   * `soporte@codegahp.mx`; el día que haya un segundo usuario con ese rol,
   * también entrará.
   */
  bulkImport: ['SOPORTE'],
  viewOutbox: ['RRHH', 'SOPORTE'],
  manageUsers: ['DIRECTOR_HOLDING', 'ADMIN_EMPRESA', 'SOPORTE'],
  /*
   * DAR ACCESO AL ASISTENTE, y NO son los mismos que administran usuarios.
   *
   * Son los dos roles a los que el asistente contesta —quien reparte una llave
   * sabe para qué sirve porque la usa—. `SOPORTE` y `DIRECTOR_HOLDING` quedan
   * fuera A PROPÓSITO aunque vean la pantalla entera: soporte entra a
   * cualquier cliente, y repartir acceso a un chat que responde con datos de
   * la plantilla es cosa del cliente, no del proveedor.
   *
   * Es la única acción de esta tabla que NO coincide con la pantalla donde
   * vive, así que aquí ocultar sí importa: sin esta línea, esos dos verían un
   * botón que el servidor contesta con 403.
   */
  manageAssistantLinks: ['ADMIN_EMPRESA', 'RRHH'],
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
  /*
   * Los mismos que registran una justificación, y por el mismo peso: un festivo
   * es un día que deja de contarse como falta — pero para la plantilla entera,
   * no para una persona.
   */
  manageHoliday: ['RRHH', 'ADMIN_EMPRESA', 'SOPORTE'],
  assignEmployee: ['RRHH', 'ADMIN_EMPRESA', 'SOPORTE'],
  deleteEmployee: ['RRHH', 'ADMIN_EMPRESA', 'SOPORTE'],
  /*
   * BORRAR DEFINITIVAMENTE no es dar de baja, y por eso no es de RRHH.
   *
   * La baja es trabajo suyo y se deshace. Esto destruye el expediente y su
   * historia, y no hay vuelta atrás; el backend lo declara para `ADMIN_EMPRESA`
   * y `SOPORTE` y esta línea lo sigue.
   */
  purgeEmployee: ['ADMIN_EMPRESA', 'SOPORTE'],
  requestOvertime: ['GERENTE', 'SUPERVISOR', 'RRHH', 'ADMIN_EMPRESA', 'SOPORTE'],
  /*
   * QUIÉN FIRMA UNA SOLICITUD. Son dos firmas y dos papeles: RRHH firma como
   * RRHH, y la dirección de la razón social o la del grupo firman como
   * DIRECCIÓN. Cuál de las dos direcciones llega a ver una solicitud lo decide
   * RLS, que a `ADMIN_EMPRESA` solo le enseña la suya.
   *
   * OJO: aquí SOPORTE **no** está, y es la única excepción de la tabla. El
   * backend no lo declara en firmar, y ponerlo solo conseguiría enseñarle dos
   * botones que devuelven 403. Si la decisión es que soporte también firme, se
   * cambia en el backend y esta línea lo sigue; al revés no funciona.
   */
  approveOvertime: ['RRHH', 'ADMIN_EMPRESA', 'DIRECTOR_HOLDING', 'SOPORTE'],
} as const satisfies Record<string, readonly Role[]>

export type Action = keyof typeof ACTION_ROLES

export function canDo(action: Action, roles: readonly Role[]): boolean {
  return ACTION_ROLES[action].some((role) => roles.includes(role))
}
