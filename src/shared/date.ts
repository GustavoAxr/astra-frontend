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
