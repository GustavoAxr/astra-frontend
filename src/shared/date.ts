/**
 * Fecha de HOY en la zona de quien está capturando, en formato `YYYY-MM-DD`.
 *
 * No usar `new Date().toISOString().slice(0, 10)`: eso da la fecha en UTC, y en
 * México —seis horas atrás— a partir de las 18:00 devuelve el día siguiente.
 * Con eso, una adscripción capturada por la tarde empezaba mañana, la persona
 * se quedaba sin turno vigente hoy y el motor la marcaba sin horario. El error
 * solo aparecía después de cierta hora, que es la peor clase de error.
 */
export function todayLocal(): string {
  const ahora = new Date()
  const mes = String(ahora.getMonth() + 1).padStart(2, '0')
  const dia = String(ahora.getDate()).padStart(2, '0')
  return `${ahora.getFullYear()}-${mes}-${dia}`
}

export interface Rango {
  from: string
  to: string
}

/**
 * Cuántos días tiene ese mes. `mes` va de 1 a 12.
 *
 * El día 0 del mes SIGUIENTE es el último del actual, y así el calendario
 * resuelve solo febrero, los bisiestos y los meses de 31. Escribir la tabla a
 * mano —«abril 30, junio 30…»— es donde se cuela el año bisiesto que nadie
 * probó hasta que llegó.
 */
export function ultimoDiaDelMes(anio: number, mes: number): number {
  return new Date(anio, mes, 0).getDate()
}

const yyyymmdd = (anio: number, mes: number, dia: number): string =>
  `${anio}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`

/**
 * La quincena a la que pertenece una fecha: del 1 al 15, o del 16 a fin de mes.
 *
 * La segunda termina el último día del mes SEA CUAL SEA: 28, 29, 30 o 31. Por
 * eso se pregunta al calendario en vez de sumar quince días, que en febrero se
 * pasaría de mes y en un mes de 31 dejaría un día fuera de toda quincena.
 */
export function quincenaDe(fecha: string): Rango {
  const [anio, mes, dia] = fecha.split('-').map(Number)
  const a = anio ?? 0
  const m = mes ?? 1
  if ((dia ?? 1) <= 15) return { from: yyyymmdd(a, m, 1), to: yyyymmdd(a, m, 15) }
  return { from: yyyymmdd(a, m, 16), to: yyyymmdd(a, m, ultimoDiaDelMes(a, m)) }
}

/**
 * La quincena inmediatamente anterior — la que se cierra en nómina.
 *
 * Desde la primera del mes se retrocede al mes anterior, y ahí la segunda
 * quincena termina donde ese mes termine: del 16 al 28 en febrero de un año
 * normal, al 29 en uno bisiesto.
 */
export function quincenaAnterior(fecha: string): Rango {
  const [anio, mes, dia] = fecha.split('-').map(Number)
  const a = anio ?? 0
  const m = mes ?? 1

  if ((dia ?? 1) > 15) return { from: yyyymmdd(a, m, 1), to: yyyymmdd(a, m, 15) }

  const mesAnterior = m === 1 ? 12 : m - 1
  const anioAnterior = m === 1 ? a - 1 : a
  return {
    from: yyyymmdd(anioAnterior, mesAnterior, 16),
    to: yyyymmdd(anioAnterior, mesAnterior, ultimoDiaDelMes(anioAnterior, mesAnterior)),
  }
}

/**
 * Un mes, en `YYYY-MM`. Es la unidad con la que se navega la asistencia.
 *
 * SE GUARDA EL MES Y NO SUS DOS FECHAS: así «agosto» sigue siendo agosto pase
 * lo que pase, y el rango se deriva cuando hace falta. Guardando el rango, un
 * cambio de corte —mes entero o quincena— obligaría a recalcular las dos
 * fechas en cada sitio que las toque.
 */
export const mesDe = (fecha: string): string => fecha.slice(0, 7)

/** El mes anterior o el siguiente, cruzando el año sin sumarle nada a mano. */
export function moverMes(mes: string, pasos: number): string {
  const [anio, m] = mes.split('-').map(Number)
  // El día 1 evita el problema clásico: sumar un mes al 31 de enero da el 3 de
  // marzo, porque febrero no tiene 31.
  const d = new Date((anio ?? 0), (m ?? 1) - 1 + pasos, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

/** Qué parte del mes se está mirando. */
export type CorteDelMes = 'mes' | 'primera' | 'segunda'

/**
 * El rango de fechas de un mes, entero o por quincenas.
 *
 * Las quincenas siguen siendo cortes de CALENDARIO —del 1 al 15 y del 16 a fin
 * de mes— porque son los que se cierran en nómina, y el último día sale del
 * calendario para que febrero y los bisiestos se resuelvan solos.
 */
export function rangoDelMes(mes: string, corte: CorteDelMes = 'mes'): Rango {
  const [anio, m] = mes.split('-').map(Number)
  const a = anio ?? 0
  const mm = m ?? 1
  const ultimo = ultimoDiaDelMes(a, mm)

  if (corte === 'primera') return { from: yyyymmdd(a, mm, 1), to: yyyymmdd(a, mm, 15) }
  if (corte === 'segunda') return { from: yyyymmdd(a, mm, 16), to: yyyymmdd(a, mm, ultimo) }
  return { from: yyyymmdd(a, mm, 1), to: yyyymmdd(a, mm, ultimo) }
}

const MESES = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
]

/**
 * «agosto de 2026». Se arma a mano y no con `Intl` sobre un `Date` para no
 * volver a caer en que una fecha suelta se interpreta como UTC y en México
 * retrocede un día — que en el último día del mes cambia el mes entero.
 */
export function mesEnPalabras(mes: string): string {
  const [anio, m] = mes.split('-').map(Number)
  return `${MESES[(m ?? 1) - 1]} de ${anio}`
}
