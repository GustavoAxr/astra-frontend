/** Fila de `GET /unmatched-punches`: arreglo plano. */
export interface UnmatchedPunch {
  id: string
  /** El número del empleado DENTRO del reloj, con ceros a la izquierda. */
  externalUserId: string
  /**
   * Nombre que el reloj tenía guardado. Cuando viene, asignar toma segundos;
   * cuando es `null`, hay que ir físicamente al equipo a averiguar de quién es.
   */
  deviceReportedName: string | null
  punchTime: string
  serialNumber: string
}

/** `GET /unmatched-punches/count`. Se agrega en la base: es barato de pedir. */
export interface UnmatchedPunchCount {
  total: number
  byDevice: { deviceId: string; serialNumber: string; count: number }[]
}
