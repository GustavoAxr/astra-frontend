import type { ShiftPolicy, ShiftSegment } from './types'

/**
 * Resumen legible del horario de un turno.
 *
 * Existe porque la pregunta operativa —«¿a qué hora entra?»— no se contesta
 * mirando el turno, sino sus bloques. Y el ciclo NO es la semana: un 4x3 dura
 * 7 días pero un 14x14 dura 28, así que no se puede hablar de «lunes».
 */
export interface ShiftSummary {
  /** Ej. «09:00 · 9 h» o «14:00 y 16:00 · 8 h». */
  schedule: string
  /** Días con trabajo dentro del ciclo. */
  workDays: number
  restDays: number
  /** Tolerancia de entrada, que es lo que define un retardo. */
  graceInMinutes: number | null
}

const hhmm = (time: string): string => time.slice(0, 5)

function minutesToHours(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m === 0 ? `${h} h` : `${h} h ${m} min`
}

export function summarizeShift(policy: ShiftPolicy): ShiftSummary {
  const working = policy.segments.filter((s) => !s.isRestDay && s.startTime !== null)
  const restDays = new Set(policy.segments.filter((s) => s.isRestDay).map((s) => s.cycleDay)).size
  const workDays = new Set(working.map((s) => s.cycleDay)).size

  if (working.length === 0) {
    // Un turno de disponibilidad no tiene horas; decir «sin horario» es más
    // honesto que pintar un guion que parece un dato faltante.
    return { schedule: 'Sin horario fijo', workDays: 0, restDays, graceInMinutes: null }
  }

  // Las horas de entrada distintas del ciclo: una jornada partida tiene dos.
  const starts = [...new Set(working.map((s) => hhmm(s.startTime as string)))].sort()
  const totalPerDay = dailyMinutes(working)

  return {
    schedule: `${starts.join(' y ')} · ${minutesToHours(totalPerDay)}`,
    workDays,
    restDays,
    graceInMinutes: working[0]?.graceInMinutes ?? null,
  }
}

/** Minutos del día con más carga: es el que marca la jornada del turno. */
function dailyMinutes(working: ShiftSegment[]): number {
  const porDia = new Map<number, number>()
  for (const s of working) {
    porDia.set(s.cycleDay, (porDia.get(s.cycleDay) ?? 0) + (s.durationMinutes ?? 0))
  }
  return Math.max(...porDia.values(), 0)
}
