export type MotivoDeDivergencia = 'nombre' | 'vigencia' | 'bloqueo'

export interface Divergencia {
  externalUserId: string
  employeeId: string
  employeeCode: string
  /** En qué difiere. Una persona puede acumular varios. */
  motivos: MotivoDeDivergencia[]
  nombre: { enElEquipo: string | null; enAstra: string }
  /** `null` = sin fecha de fin. `undefined` = el equipo no lo cuenta. */
  vigencia: { enElEquipo: string | null | undefined; enAstra: string | null }
  bloqueo: { enElEquipo: boolean | undefined; enAstra: boolean }
}

export interface EstadoDelPadron {
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
  status: 'pending' | 'sent' | 'applied' | 'failed' | 'cancelled'
  attempts: number
  lastError: string | null
  lastErrorCode: string | null
  requestedByName: string | null
  createdAt: string
  finishedAt: string | null
}
