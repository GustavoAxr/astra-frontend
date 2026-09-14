import type { Holiday } from './types'

/**
 * COPIAR EL CALENDARIO DE UN AÑO AL SIGUIENTE, decidiendo choque por choque.
 *
 * Quien captura diez festivos propios no quiere volver a capturarlos cada
 * enero. Lo que sí quiere es que la copia **no le pise lo que ya escribió a
 * mano** en el año de destino, y esa es toda la razón de que esto exista en vez
 * de un botón que crea diez filas a ciegas.
 *
 * Aquí solo se PLANEA: quién choca con quién y qué opciones tiene cada fila.
 * Escribir es cosa de la pantalla, y solo después de que una persona mire la
 * lista — la misma regla de la conciliación: la máquina propone, una persona
 * confirma.
 */

/**
 * Qué hacer con un festivo del año de origen.
 *
 * `reemplazar` NO borra y vuelve a crear: CORRIGE el que ya estaba. El índice
 * único `(razón social, día)` impide que los dos existan a la vez, así que
 * borrar primero dejaría el día descubierto si el alta fallara después. Lo que
 * se ve al final es lo mismo —un solo festivo ese día, con el nombre del año de
 * origen— y no hay un instante en que el día no sea festivo.
 */
export type Decision = 'copiar' | 'omitir' | 'reemplazar'

export type Resultado = 'pendiente' | 'copiado' | 'reemplazado' | 'omitido' | 'error'

export interface FilaCopia {
  /** El festivo del año de origen, tal cual vino. */
  origen: Holiday
  /** Nunca nulo: los de ley no se copian y no llegan hasta aquí. */
  legalEntityId: string
  /**
   * El mismo día y mes en el año de destino. `null` cuando esa fecha no existe
   * allí: un 29 de febrero copiado a un año que no es bisiesto.
   */
  fecha: string | null
  /**
   * El festivo de LA MISMA razón social que ya ocupa ese día, si lo hay. Es el
   * choque de verdad: la base no admite los dos.
   */
  choque: Holiday | null
  /**
   * El festivo DE LEY que cae ese día, si lo hay. No impide copiar —son índices
   * distintos y pueden convivir— pero sí hay que decirlo: nadie quiere dos
   * festivos el 25 de diciembre sin haberlo pedido.
   */
  deLey: Holiday | null
  decision: Decision
  resultado: Resultado
  detalle: string
}

/**
 * Qué se puede hacer con cada festivo del año de origen.
 *
 * `destino` son los festivos QUE YA HAY en el año al que se copia, incluidos
 * los de ley: sin ellos no se puede avisar de que el día ya está ocupado.
 */
export function planearCopia(
  origen: readonly Holiday[],
  destino: readonly Holiday[],
  añoDestino: number,
): FilaCopia[] {
  const filas: FilaCopia[] = []

  for (const festivo of origen) {
    /*
     * LOS DE LEY NO SE COPIAN, y no es una limitación: es lo correcto.
     *
     * Cada año trae los suyos, sembrados con una migración, y los de febrero,
     * marzo y noviembre son LUNES MÓVILES. Copiar el 16 de marzo de 2026 a 2027
     * habría puesto el natalicio de Juárez en martes, un día que ese año se
     * trabaja. Además la API los rechaza: crear un festivo global desde la
     * pantalla de un cliente lo metería en la nómina de los demás inquilinos.
     */
    if (festivo.legalEntityId === null) continue
    const legalEntityId = festivo.legalEntityId

    const fecha = mismoDiaEn(festivo.holidayDate, añoDestino)
    const choque =
      fecha === null
        ? null
        : (destino.find((d) => d.legalEntityId === legalEntityId && d.holidayDate === fecha) ??
          null)
    const deLey =
      fecha === null
        ? null
        : (destino.find((d) => d.legalEntityId === null && d.holidayDate === fecha) ?? null)

    filas.push({
      origen: festivo,
      legalEntityId,
      fecha,
      choque,
      deLey,
      /*
       * POR OMISIÓN SE CONSERVA LO QUE YA ESTABA. Quien copia un año encima de
       * otro no espera que le cambien lo que ya había capturado; que el valor
       * por omisión sea el destructivo es cómo se pierde trabajo con un clic.
       */
      decision: fecha === null || choque !== null || deLey !== null ? 'omitir' : 'copiar',
      resultado: 'pendiente',
      detalle: '',
    })
  }

  // Por el día del año de origen: es el mismo orden que tendrán en el destino, y
  // así las filas que no se pueden copiar no se van todas juntas al principio.
  return filas.sort((a, b) => a.origen.holidayDate.localeCompare(b.origen.holidayDate))
}

/**
 * La misma fecha en otro año, o `null` si ese día no existe allí.
 *
 * Solo el 29 de febrero puede desaparecer, pero la comprobación se hace
 * mirando lo que devolvió el calendario y no buscando «02-29»: `new Date(2027,
 * 1, 29)` no falla, se DESBORDA al 1 de marzo. Copiar un festivo al día
 * siguiente sin decir nada es bastante peor que no copiarlo.
 */
function mismoDiaEn(iso: string, año: number): string | null {
  const [, mes, dia] = iso.split('-')
  if (mes === undefined || dia === undefined) return null

  const prueba = new Date(año, Number(mes) - 1, Number(dia))
  if (prueba.getMonth() !== Number(mes) - 1 || prueba.getDate() !== Number(dia)) return null

  return `${año}-${mes}-${dia}`
}
