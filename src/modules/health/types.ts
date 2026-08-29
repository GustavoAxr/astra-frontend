/**
 * Fila de `GET /devices/sync-state`: cómo va la lectura de cada reloj.
 *
 * La **marca de agua** es hasta dónde se leyó. Si deja de avanzar, el equipo
 * sigue vivo pero ya no entrega checadas — que es peor que verlo caído, porque
 * no se nota.
 */
export interface DeviceSyncState {
  deviceId: string
  serialNumber: string
  watermark: string | null
  watermarkLabel: string | null
  lastReadAt: string | null
  lastSuccessAt: string | null
  /** Fallos seguidos. Uno es ruido; cinco es una visita a la instalación. */
  consecutiveFailures: number
  lastError: string | null
  totalPunches: number
  totalDuplicates: number
  totalUnmatched: number
  updatedAt: string | null
}
