import type { ShiftPolicy, ShiftSegment } from '@/modules/employees/types'

/**
 * QUÉ ES ESE DÍA PARA ESA PERSONA.
 *
 * El ciclo NO es la semana: un 4x3 dura 7 días pero un 14x14 dura 28, y hay
 * turnos de rotación continua que no caen siempre en el mismo día. Por eso se
 * numeran los días del ciclo en vez de nombrarlos «lunes».
 *
 * Era un booleano `rest`, y ahí estaba el fallo: un día sin bloques declarados
 * se daba por descanso SIEMPRE. En un turno de horario fijo eso es correcto
 * —los días que no tienen jornada son libres— pero en uno flexible es al revés:
 * no hay bloques porque la hora da igual, no porque nadie trabaje. La pantalla
 * acababa pintando «Descanso» los siete días de un turno de tiempo completo.
 *
 * Son cuatro cosas distintas y se responden distinto, así que se nombran:
 *
 * · TRABAJO     — tiene bloques con hora.
 * · DESCANSO    — alguien lo declaró descanso. Es un dato, no una ausencia.
 * · DISPONIBLE  — turno flexible: aquí SE PUEDE trabajar para cumplir las horas
 *                 del ciclo. Que no tenga hora no lo hace libre.
 * · SIN_HORARIO — turno abierto: no hay horario contractual que declarar.
 */
export type EstadoDelDia = 'TRABAJO' | 'DESCANSO' | 'DISPONIBLE' | 'SIN_HORARIO'

export interface CycleDay {
  day: number
  estado: EstadoDelDia
  /** Atajo para el estilo: solo el descanso DECLARADO se pinta apagado. */
  rest: boolean
  blocks: {
    label: string
    /** «09:00 → 18:00». */
    range: string
    minutes: number
    graceIn: number
    breakMinutes: number
    /** Si el descanso se resta de la jornada sin exigir marcajes. */
    breakAutoDeduct: boolean
    /** Si el descanso se paga. Pagado y descontado son cosas distintas. */
    breakIsPaid: boolean
    /**
     * Lo que el bloque aporta a la jornada: su duración menos el descanso, y
     * SOLO si ese descanso se descuenta.
     */
    workedMinutes: number
    /** El bloque termina al día siguiente. */
    crossesMidnight: boolean
  }[]
  /**
   * Minutos de trabajo del día.
   *
   * DESCUENTA EL DESCANSO SOLO SI ESTÁ MARCADO PARA DESCONTARSE, que es lo que
   * hace el motor de cálculo. Antes esto sumaba las duraciones sin más y el
   * formulario restaba el descanso siempre: tres sitios daban tres jornadas
   * distintas para el mismo turno, y la que mandaba —la del motor— no era la
   * que se veía en pantalla.
   */
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

    /*
     * El descanso DECLARADO manda sobre todo lo demás, en cualquier modo: si
     * alguien marcó ese día como libre, lo es aunque el turno sea flexible.
     */
    const declaradoDescanso =
      segmentos.length > 0 && segmentos.every((s) => s.isRestDay);

    /*
     * Un día SIN NADA declarado significa cosas distintas según el turno, y
     * confundirlas es lo que pintaba semanas enteras de «Descanso»:
     *
     * · FIXED    → los días sin jornada son libres. Ahí el booleano acertaba.
     * · FLEXIBLE → se puede trabajar; lo que se debe son las horas del ciclo,
     *              no una hora de entrada.
     * · OPEN     → no hay horario contractual. Ni descanso ni jornada: nada
     *              que declarar, que no es lo mismo que un día libre.
     */
    const vacio = segmentos.length === 0
    const estado: EstadoDelDia = declaradoDescanso
      ? 'DESCANSO'
      : vacio
        ? policy.scheduleMode === 'FLEXIBLE'
          ? 'DISPONIBLE'
          : policy.scheduleMode === 'OPEN'
            ? 'SIN_HORARIO'
            : 'DESCANSO'
        : 'TRABAJO'

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
          breakAutoDeduct: s.breakAutoDeduct,
          breakIsPaid: s.breakIsPaid,
          workedMinutes: minutes - (s.breakAutoDeduct ? s.breakMinutes : 0),
          crossesMidnight: next,
        }
      })

    dias.push({
      day,
      estado,
      // Solo el descanso declarado —y el que se deduce en un turno fijo— se
      // pinta apagado. Un día disponible NO va apagado: es un día de trabajo.
      rest: estado === 'DESCANSO',
      blocks,
      totalMinutes: blocks.reduce((acc, b) => acc + b.workedMinutes, 0),
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


/**
 * QUÉ SE DEBE Y EN QUÉ DÍAS, cuando el turno no fija horas de entrada.
 *
 * Un turno flexible no se explica con una rejilla de siete casillas: lo que
 * obliga no es «entrar a las nueve» sino «cumplir veinte horas antes de que
 * acabe el ciclo». Esta línea es esa frase, y va arriba, junto al nombre —donde
 * alguien la lee— en vez de dejar que se deduzca de siete casillas iguales.
 *
 * Devuelve `null` para los turnos de horario fijo: ahí la rejilla ya lo dice
 * todo y una frase de más sería ruido.
 */
export function compromisoDelCiclo(
  policy: ShiftPolicy,
  dias: CycleDay[],
): string | null {
  if (policy.scheduleMode === 'FIXED') return null

  const habiles = dias.filter((d) => d.estado !== 'DESCANSO').map((d) => d.day)
  if (habiles.length === 0) return 'Todo el ciclo es descanso'

  const cuando = ventana(habiles, policy.cycleLengthDays)

  if (policy.scheduleMode === 'OPEN') {
    // Sin objetivo no hay nada que cumplir: se dice qué días alcanza y ya.
    return `Sin horario contractual · ${cuando}`
  }

  const objetivo = policy.targetMinutesPerCycle
  if (objetivo === null || objetivo === 0) {
    /*
     * Flexible SIN horas declaradas es un turno a medio configurar, y decirlo
     * vale más que callarlo: nadie puede incumplir un objetivo que no existe,
     * así que el motor no va a reclamar nada y las horas no se van a revisar.
     */
    return `Sin horas declaradas · ${cuando}`
  }

  return `${formatMinutes(objetivo)} a cumplir ${cuando}`
}

/** «del día 1 al 5», «los días 1, 2 y 4», «todo el ciclo». */
function ventana(dias: number[], largo: number): string {
  if (dias.length === largo) return 'en todo el ciclo'

  const seguidos = dias.every((d, i) => i === 0 || d === (dias[i - 1] ?? 0) + 1)
  if (seguidos) {
    return dias.length === 1
      ? `el día ${dias[0]}`
      : `del día ${dias[0]} al ${dias[dias.length - 1]}`
  }

  const lista = dias.join(', ').replace(/, (\d+)$/, ' y $1')
  return `los días ${lista}`
}
