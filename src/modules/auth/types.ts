/** Los códigos que puede traer `roles`. Un usuario puede traer más de uno. */
export const ROLES = [
  'DIRECTOR_HOLDING',
  'ADMIN_EMPRESA',
  'RRHH',
  'SUPERVISOR',
  /**
   * Solo SOLICITA tiempo extra. Lo trae la migración 023: es el jefe de área
   * —dirección de obra, jefatura de planta— que pide que alguien se quede, y no
   * administra nada más. Su menú es una sola pantalla a propósito.
   */
  'GERENTE',
  'OPERADOR',
  'SOPORTE',
] as const

export type Role = (typeof ROLES)[number]

export const ROLE_LABEL: Record<Role, string> = {
  DIRECTOR_HOLDING: 'Dirección del grupo',
  ADMIN_EMPRESA: 'Administrador de razón social',
  RRHH: 'Recursos Humanos',
  SUPERVISOR: 'Supervisor de instalación',
  GERENTE: 'Gerencia · solicita tiempo extra',
  OPERADOR: 'Operador',
  SOPORTE: 'Soporte técnico',
}

/** Lo que devuelven `POST /auth/login` y `POST /auth/refresh`. */
export interface AuthUser {
  id: string
  email: string
  fullName: string
  /**
   * Contraseña provisional. Avisa, **no bloquea**: todos los usuarios sembrados
   * vienen con `true`, así que tratarlo como bloqueo dejaría fuera a todo el
   * mundo. El aviso ahora sí lleva a algún sitio — `POST /auth/change-password`.
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

  /**
   * EN QUÉ CLIENTE ESTÁ ACTUANDO. Casi siempre el suyo.
   *
   * Solo cambia cuando un operador de plataforma eligió otro. Sin este dato el
   * selector no tenía de dónde recordar dónde estabas: tras recargar decía
   * siempre «Mi propio cliente», también estando dentro de los datos de otro
   * cliente — que es exactamente lo contrario de lo que hay que enseñar.
   */
  tenantId: string
  /**
   * EL SUYO, el de su ficha. Distinto de `tenantId` solo estando en otro cliente.
   *
   * Los dos hacen falta y confundirlos rompía el selector: al filtrar la lista
   * con el cliente EN EL QUE ESTÁS, ese cliente desaparecía de las opciones —y
   * el desplegable, sin nada que emparejar, enseñaba su UUID en crudo— mientras
   * el tuyo salía por su nombre, duplicando «Mi propio cliente».
   */
  tenantPropio: string
  actuandoEnOtroCliente: boolean
}

export interface LoginDto {
  email: string
  password: string
}

/**
 * El cuerpo de `POST /auth/change-password`. Los nombres son los del DTO del
 * servidor —en español— y no se traducen: con `forbidNonWhitelisted` activo, un
 * `current`/`next` sería un 400 y no un campo ignorado.
 */
export interface ChangePasswordDto {
  actual: string
  nueva: string
}

/**
 * Lo que devuelve el cambio. `sesionesCerradas` las cuenta TODAS, incluida la
 * que pidió el cambio: el servidor revoca la familia entera a propósito —el
 * motivo normal para cambiar una contraseña es sospechar que alguien entró, y
 * dejar una sesión viva desperdiciaría el cambio—. Después de esto hay que
 * volver a entrar, y la interfaz tiene que contarlo antes de que pase.
 */
export interface ChangePasswordResult {
  sesionesCerradas: number
  mensaje: string
}
