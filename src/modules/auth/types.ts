/** Los seis códigos que puede traer `roles`. Un usuario puede traer más de uno. */
export const ROLES = [
  'DIRECTOR_HOLDING',
  'ADMIN_EMPRESA',
  'RRHH',
  'SUPERVISOR',
  'OPERADOR',
  'SOPORTE',
] as const

export type Role = (typeof ROLES)[number]

export const ROLE_LABEL: Record<Role, string> = {
  DIRECTOR_HOLDING: 'Dirección del grupo',
  ADMIN_EMPRESA: 'Administrador de razón social',
  RRHH: 'Recursos Humanos',
  SUPERVISOR: 'Supervisor de instalación',
  OPERADOR: 'Operador',
  SOPORTE: 'Soporte técnico',
}

/** Lo que devuelven `POST /auth/login` y `POST /auth/refresh`. */
export interface AuthUser {
  id: string
  email: string
  fullName: string
  /**
   * Contraseña provisional. Hoy **no bloquea**: no existe ruta para cambiarla,
   * y todos los usuarios sembrados vienen con `true`. Se pinta como aviso.
   */
  mustChangePassword: boolean
  roles: Role[]
}

export interface AuthSession {
  user: AuthUser
}

/**
 * Lo que devuelve `GET /auth/me`. Es más grande que `AuthUser`.
 *
 * `legalEntities` e `installations` son **conteos, no arreglos**: los ids del
 * selector de empresa salen de `GET /legal-entities`, ya filtrado por RLS.
 */
export interface Me {
  id: string
  email: string
  fullName: string
  roles: Role[]
  legalEntities: number
  installations: number
  /** La persona a la que le corresponden sus propias checadas, o `null`. */
  employeeId: string | null
}

export interface LoginDto {
  email: string
  password: string
}
