import type { ShiftPolicy, ShiftSegment } from '@/modules/employees/types'

/**
 * Un día del ciclo, listo para pintar.
 *
 * El ciclo NO es la semana: un 4x3 dura 7 días pero un 14x14 dura 28, y hay
 * turnos de rotación continua que no caen siempre en el mismo día. Por eso se
 * numeran los días del ciclo en vez de nombrarlos «lunes».
 */
export interface CycleDay {
  day: number
  rest: boolean
  blocks: {
    label: string
    /** «09:00 → 18:00». */
    range: string
    minutes: number
    graceIn: number
    breakMinutes: number
    /** El bloque termina al día siguiente. */
    crossesMidnight: boolean
  }[]
  /** Minutos de trabajo del día, sumando sus bloques. */
  totalMinutes: number
}

const hhmm = (t: string): string => t.slice(0, 5)

/** Suma minutos a «HH:MM:SS» y dice si cruzó la medianoche. */
function endOf(start: string, minutes: number): { end: string; next: boolean } {
  const [h, m] = hhmm(start).split(':').map(Number)
  const total = (h ?? 0) * 60 + (m ?? 0) + minutes
  const next = total >= 24 * 60
  const fin = total % (24 * 60)
  return {
    end: `${String(Math.floor(fin / 60)).padStart(2, '0')}:${String(fin % 60).padStart(2, '0')}`,
    next,
  }
}

export function buildCycle(policy: ShiftPolicy): CycleDay[] {
  const porDia = new Map<number, ShiftSegment[]>()
  for (const s of policy.segments) {
    porDia.set(s.cycleDay, [...(porDia.get(s.cycleDay) ?? []), s])
  }

  const dias: CycleDay[] = []
  for (let day = 1; day <= policy.cycleLengthDays; day += 1) {
    const segmentos = (porDia.get(day) ?? []).sort((a, b) => a.sequence - b.sequence)

    // Un día sin bloques declarados también es descanso: la ausencia de horario
    // es una decisión, no un hueco en los datos. (`every` ya devuelve `true`
    // con la lista vacía, así que ese caso queda cubierto sin comprobarlo.)
    const rest = segmentos.every((s) => s.isRestDay)

    const blocks = segmentos
      .filter((s) => !s.isRestDay && s.startTime !== null)
      .map((s) => {
        const minutes = s.durationMinutes ?? 0
        const { end, next } = endOf(s.startTime as string, minutes)
        return {
          label: s.segmentName ?? 'Jornada',
          range: `${hhmm(s.startTime as string)} → ${end}`,
          minutes,
          graceIn: s.graceInMinutes,
          breakMinutes: s.breakMinutes,
          crossesMidnight: next,
        }
      })

    dias.push({
      day,
      rest,
      blocks,
      totalMinutes: blocks.reduce((acc, b) => acc + b.minutes, 0),
    })
  }

  return dias
}

export function formatMinutes(minutes: number): string {
  if (minutes === 0) return '—'
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h === 0) return `${m} min`
  return m === 0 ? `${h} h` : `${h} h ${m} min`
}
