/**
 * Vocabulario de los marcajes. **Regla 1 del proyecto.**
 *
 * `punchType` casi siempre llega como `UNKNOWN` y así hay que pintarlo: «sin
 * clasificar». Deducir entrada o salida por el orden de las checadas —«la
 * primera del día es entrada»— es inventar evidencia, y esta tabla es
 * justamente la que se enseña en una auditoría.
 *
 * Por eso la traducción vive aquí y en ningún otro sitio: si alguien escribe
 * «Entrada» en una plantilla, se le nota.
 */
export const PUNCH_TYPES = ['IN', 'OUT', 'BREAK_START', 'BREAK_END', 'UNKNOWN'] as const
export type PunchType = (typeof PUNCH_TYPES)[number]

interface PunchLook {
  label: string
  /** Neutro para lo que no consta: nada de verde/rojo que sugiera dirección. */
  color: 'success' | 'error' | 'warning' | 'neutral'
  /** La explicación larga, para el visor de evidencia y los títulos al pasar el ratón. */
  detail: string
}

const LOOKS: Record<string, PunchLook> = {
  IN: {
    label: 'Entrada',
    color: 'success',
    detail: 'El equipo declaró expresamente que es una entrada.',
  },
  OUT: {
    label: 'Salida',
    color: 'warning',
    detail: 'El equipo declaró expresamente que es una salida.',
  },
  BREAK_START: {
    label: 'Inicio de descanso',
    color: 'neutral',
    detail: 'El equipo declaró que es el inicio de un descanso.',
  },
  BREAK_END: {
    label: 'Fin de descanso',
    color: 'neutral',
    detail: 'El equipo declaró que es el fin de un descanso.',
  },
  UNKNOWN: {
    label: 'Sin clasificar',
    color: 'neutral',
    detail:
      'El equipo registró el paso pero no dijo si era entrada o salida: no ' +
      'viene configurado con modos de asistencia, así que no manda ' +
      '`attendanceStatus`. Lo empareja el motor contra los segmentos del ' +
      'turno. Deducirlo por el orden —«la primera del día es entrada»— sería ' +
      'inventar evidencia.',
  },
}

export function punchTypeLook(type: string): PunchLook {
  // Un tipo que no conozco se pinta con su código, no se le inventa significado.
  return (
    LOOKS[type] ?? {
      label: type,
      color: 'neutral',
      detail: `El equipo declaró «${type}», un valor que este catálogo todavía no traduce.`,
    }
  )
}
