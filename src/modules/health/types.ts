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

  /**
   * LOS DOS LATIDOS, por separado. El del reloj dice que el aparato contesta;
   * el del agente, que el enlace está vivo.
   */
  deviceHeartbeatAt: string | null
  agentHeartbeatAt: string | null
  installationName: string | null
  /** Para pasar lista en esa base sin salir de aquí. */
  installationId: string | null

  /**
   * Qué murió, si es que murió algo. Lo decide el servidor y no la pantalla:
   * es una regla de negocio —cuánto silencio se tolera, y a quién se cree
   * cuando hay duda— y repetirla aquí garantizaría que un día las dos digan
   * cosas distintas del mismo equipo.
   */
  diagnostico: 'AL_DIA' | 'RELOJ_MUDO' | 'ENLACE_CAIDO' | 'SIN_ESTRENAR'
}

/**
 * Qué significa cada diagnóstico y qué hacer con él.
 *
 * `accion` es lo que separa un panel de un adorno: decir «RELOJ_MUDO» sin
 * decir qué se hace con eso deja a quien lo lee igual de perdido que antes.
 */
export const DIAGNOSTICO: Record<
  DeviceSyncState['diagnostico'],
  { label: string; color: 'success' | 'warning' | 'error' | 'neutral'; accion: string }
> = {
  AL_DIA: {
    label: 'Al día',
    color: 'success',
    accion: 'El aparato contesta y el enlace está vivo.',
  },
  RELOJ_MUDO: {
    label: 'Reloj sin responder',
    color: 'error',
    accion:
      'El enlace está vivo y el aparato no contesta: está apagado o averiado. Las checadas de estas horas NO existen en ninguna parte. Es el caso que justifica abrir una contingencia.',
  },
  ENLACE_CAIDO: {
    label: 'Enlace caído',
    color: 'warning',
    accion:
      'No llega el agente. Las checadas SÍ se están tomando y esperan en su cola: llegarán solas cuando vuelva. No hace falta contingencia.',
  },
  SIN_ESTRENAR: {
    label: 'Sin estrenar',
    color: 'neutral',
    accion:
      'Este reloj no ha reportado nunca. No es una avería: es que todavía no ha hablado.',
  },
}
