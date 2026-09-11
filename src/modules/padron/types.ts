export type MotivoDeDivergencia = 'nombre' | 'vigencia' | 'inicio' | 'bloqueo' | 'permiso'

export interface Divergencia {
  externalUserId: string
  employeeId: string
  employeeCode: string
  /** En qué difiere. Una persona puede acumular varios. */
  motivos: MotivoDeDivergencia[]
  nombre: { enElEquipo: string | null; enAstra: string }
  /** `null` = sin fecha de fin. `undefined` = el equipo no lo cuenta. */
  vigencia: { enElEquipo: string | null | undefined; enAstra: string | null }
  /** Desde cuándo vale su acceso. Es lo que deja fuera a quien entró hoy. */
  inicio: { enElEquipo: string | null | undefined; enAstra: string | null }
  /**
   * La plantilla horaria de puerta. `null` en el equipo = NO tiene permiso, y
   * eso es una persona que checa y se queda fuera. `undefined` = no se compara
   * porque ese equipo no abre ninguna puerta.
   */
  permiso: { enElEquipo: string | null | undefined; enAstra: string | null }
  bloqueo: { enElEquipo: boolean | undefined; enAstra: boolean }
}

/**
 * DE CUÁNDO ES LA FOTO contra la que se comparó.
 *
 * El servidor no ve el reloj: lo lee el agente y deja una foto. Esta pantalla
 * TIENE que decir cuándo se tomó, o una comparación de anteayer se lee como el
 * estado de ahora mismo — y alguien decide una baja con datos viejos.
 */
export interface FotoDelPadron {
  /** Cuándo se pidió la última lectura. `null` = nunca se pidió. */
  requestedAt: string | null
  /** Cuándo llegó. `null` = nunca ha llegado ninguna. */
  readAt: string | null
  usersCount: number | null
  lastError: string | null
}

export interface EstadoDelPadron {
  foto: FotoDelPadron
  divergencias: Divergencia[]
  /** Los que ya están como deben. Se dice, para que el cero se lea. */
  alDia: number
}

export interface SyncResult {
  encoladas: number
  /** Lo que no se encoló y por qué. No es un error: es información. */
  rechazadas: { id: string; motivo: string }[]
}

export interface Orden {
  id: string
  deviceId: string
  deviceName: string | null
  employeeId: string | null
  employeeName: string | null
  externalUserId: string
  kind: 'upsert' | 'remove'
  /**
   * Qué pedía la orden. Es lo que permite responder «¿al reloj ya le llegó que
   * esta persona está de baja?» sin volver a preguntarle al equipo. `null` en
   * las órdenes viejas, guardadas antes de que esto existiera.
   */
  intencion: 'alta' | 'cierre' | 'retiro' | null
  /**
   * Lo que se le mandó al equipo, campo por campo. Comparado con el expediente
   * de hoy dice si el reloj se quedó atrás. **No trae la clave de puerta**: va
   * en la carga pero no sale de la base.
   */
  enviado: {
    name: string
    validFrom: string | null
    validTo: string | null
    enabled: boolean | null
    sex: 'H' | 'M' | null
  } | null
  status: 'pending' | 'sent' | 'applied' | 'failed' | 'cancelled'
  attempts: number
  lastError: string | null
  lastErrorCode: string | null
  requestedByName: string | null
  createdAt: string
  finishedAt: string | null
}
