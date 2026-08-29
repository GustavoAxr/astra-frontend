export interface ReconcileSuggestion {
  employeeId: string
  employeeCode: string
  fullName: string
  /** 0–100. */
  score: number
  /** En español, para mostrar tal cual. */
  reason: string
}

export interface ReconcilePending {
  /** Con los ceros a la izquierda TAL CUAL: es la llave dentro del reloj. */
  externalUserId: string
  deviceName: string | null
  /**
   * Vive **en el elemento**, no en la sugerencia. Es `true` solo cuando hay una
   * candidata con 80 o más y le saca 20 puntos a la segunda.
   *
   * Dos hermanos con los mismos apellidos —el caso común, no el raro— salen
   * siempre en `false` y con los candidatos empatados, para que quien concilia
   * vea el empate y lo resuelva.
   */
  confident: boolean
  /** Máximo 5, de mayor a menor. Puede venir **vacío**: esos se asignan a mano. */
  suggestions: ReconcileSuggestion[]
}

export interface ReconcilePreview {
  deviceId: string
  serialNumber: string
  /** Ya emparejados: no vienen en `pending`. */
  alreadyMapped: number
  confidentCount: number
  pending: ReconcilePending[]
}

export interface ReconcileResult {
  enrolled: number
  /** Marcajes huérfanos que se resolvieron solos al enrolar. Es la recompensa visible. */
  trayResolved: number
}
