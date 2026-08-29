import { todayLocal } from '@/shared/date'
import type { EmployeeException, EmploymentEvent } from './types'

/**
 * Lo que se puede deducir de la vida laboral y de las incidencias de una
 * persona. Sin componentes ni plantillas: son cuentas sobre fechas, y las
 * cuentas sobre fechas es donde se esconden los errores de un día.
 *
 * Todo se compara contra `todayLocal()` —la fecha LOCAL, no `new Date()`—
 * porque una fecha suelta como «2026-08-29» leída con `new Date` se interpreta
 * como UTC y en México retrocede un día: unas vacaciones que empiezan hoy
 * saldrían como «próximas».
 */

const DIA_MS = 86_400_000

/** Días entre dos fechas sueltas, sin que la zona horaria estorbe. */
export function diasEntre(desde: string, hasta: string): number {
  return Math.round((Date.parse(`${hasta}T00:00:00Z`) - Date.parse(`${desde}T00:00:00Z`)) / DIA_MS)
}

/** Días que dura una incidencia, contando los dos extremos. */
export function duracionEnDias(desde: string, hasta: string): number {
  return diasEntre(desde, hasta) + 1
}

export type EstadoDeIncidencia = 'en-curso' | 'proxima' | 'terminada'

/**
 * Si la incidencia está pasando, está por venir o ya pasó.
 *
 * Importa más de lo que parece: la lista viene ordenada por fecha y sin esto
 * hay que restar mentalmente contra hoy para saber si alguien está ahora mismo
 * de vacaciones, que es justo la pregunta que trae a alguien a esta pantalla.
 */
export function estadoDeIncidencia(
  x: Pick<EmployeeException, 'startDate' | 'endDate'>,
  hoy = todayLocal(),
): EstadoDeIncidencia {
  if (x.endDate < hoy) return 'terminada'
  if (x.startDate > hoy) return 'proxima'
  return 'en-curso'
}

/** `'09:00:00'` → `'09:00'`. La base entrega `TIME` con segundos. */
export const horaCorta = (hora: string): string => hora.slice(0, 5)

/** Los tipos de evento que ponen a alguien a trabajar, y los que lo sacan. */
const ALTAS = new Set(['HIRED', 'REINSTATED'])
const BAJAS = new Set(['TERMINATED', 'RESIGNED'])

export interface VidaLaboral {
  /** El alta vigente: la última que no tiene una baja después. */
  altaVigente: string | null
  /** La baja vigente, si la persona salió y no ha vuelto. */
  bajaVigente: string | null
  /** Días desde el alta vigente. Nulo si no hay alta o si ya causó baja. */
  antiguedadEnDias: number | null
  /**
   * Lo que no cuadra en el historial. No se corrige solo ni se esconde: se
   * enseña, porque son capturas que alguien tiene que revisar.
   */
  inconsistencias: { eventId: string; aviso: string }[]
}

/**
 * Recorre la vida laboral en orden y saca la antigüedad y lo que no cuadra.
 *
 * POR QUÉ SE RECORRE HACIA ADELANTE
 * La lista llega de la más reciente a la más antigua —así la pinta la
 * pantalla—, pero una historia laboral solo se entiende en el orden en que
 * ocurrió: un reingreso solo es reingreso si antes hubo una baja. Se copia y se
 * ordena en vez de confiar en el orden de llegada.
 */
export function resumirVidaLaboral(eventos: EmploymentEvent[], hoy = todayLocal()): VidaLaboral {
  const orden = [...eventos].sort(
    (a, b) =>
      a.effectiveDate.localeCompare(b.effectiveDate) || a.createdAt.localeCompare(b.createdAt),
  )

  let altaVigente: string | null = null
  let bajaVigente: string | null = null
  const inconsistencias: { eventId: string; aviso: string }[] = []

  for (const e of orden) {
    // Un evento con fecha futura ya está capturado, pero todavía no ocurrió:
    // contarlo diría que alguien lleva trabajando desde una fecha que no llega.
    if (e.effectiveDate > hoy) continue

    if (ALTAS.has(e.eventType)) {
      if (altaVigente !== null) {
        /*
         * UN ALTA SOBRE UN ALTA NO REINICIA LA ANTIGÜEDAD.
         *
         * Se ve con los datos que hay: EMP-00000001 tiene dos «contratación»
         * —2024 y 2026— sin ninguna baja en medio. Tomando la última, la
         * pantalla diría que lleva dos días en la empresa cuando lleva dos
         * años. Si nunca causó baja, la relación laboral no se interrumpió: la
         * antigüedad corre desde la primera. El alta de más se marca para que
         * alguien la corrija, que es lo que de verdad hay que hacer con ella.
         */
        inconsistencias.push({
          eventId: e.id,
          aviso:
            'Ya estaba dado de alta y no hay baja entre las dos: la antigüedad ' +
            'se sigue contando desde el alta anterior.',
        })
      } else {
        altaVigente = e.effectiveDate
      }
      bajaVigente = null
    } else if (BAJAS.has(e.eventType)) {
      if (altaVigente === null) {
        inconsistencias.push({
          eventId: e.id,
          aviso: 'Hay una baja sin un alta previa que la explique.',
        })
      }
      bajaVigente = e.effectiveDate
      altaVigente = null
    }
    // SUSPENDED no interrumpe la antigüedad: la relación laboral sigue viva.
  }

  return {
    altaVigente,
    bajaVigente,
    antiguedadEnDias: altaVigente === null ? null : diasEntre(altaVigente, hoy),
    inconsistencias,
  }
}

/**
 * «2 años y 3 meses». En años y meses, no en días: nadie dice que lleva 823
 * días en la empresa, y para una antigüedad esa es la unidad que se usa.
 */
export function antiguedadEnPalabras(dias: number): string {
  if (dias < 31) return dias === 1 ? '1 día' : `${dias} días`

  const meses = Math.floor(dias / 30.44)
  if (meses < 12) return meses === 1 ? '1 mes' : `${meses} meses`

  const años = Math.floor(meses / 12)
  const resto = meses % 12
  const parteAños = años === 1 ? '1 año' : `${años} años`
  if (resto === 0) return parteAños
  return `${parteAños} y ${resto === 1 ? '1 mes' : `${resto} meses`}`
}

/**
 * Cuántos días de cada incidencia lleva la persona en el año que corre.
 *
 * Se recorta al año: unas vacaciones del 29 de diciembre al 5 de enero reparten
 * sus días entre dos años, y cargárselos todos al año en que empezaron daría
 * saldos de vacaciones que no cuadran con nómina.
 */
export function diasPorTipoEnElAño(
  incidencias: EmployeeException[],
  año: number,
): { nombre: string; dias: number }[] {
  const desdeElAño = `${año}-01-01`
  const hastaElAño = `${año}-12-31`
  const acumulado = new Map<string, number>()

  for (const x of incidencias) {
    if (x.endDate < desdeElAño || x.startDate > hastaElAño) continue

    const desde = x.startDate < desdeElAño ? desdeElAño : x.startDate
    const hasta = x.endDate > hastaElAño ? hastaElAño : x.endDate

    // Un permiso de unas horas no es un día: se cuenta aparte, no como 1.
    const dias = x.startTime ? 0 : duracionEnDias(desde, hasta)
    acumulado.set(x.exceptionName, (acumulado.get(x.exceptionName) ?? 0) + dias)
  }

  return [...acumulado.entries()]
    .filter(([, dias]) => dias > 0)
    .map(([nombre, dias]) => ({ nombre, dias }))
    .sort((a, b) => b.dias - a.dias)
}
