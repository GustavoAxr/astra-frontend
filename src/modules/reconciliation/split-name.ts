/**
 * Parte el nombre que el reloj tiene guardado en nombre y apellidos.
 *
 * **Es una conjetura, no un dato.** El equipo guarda una sola cadena y no
 * distingue dónde acaba el nombre y empiezan los apellidos. Se aplica la
 * convención mexicana —nombres, apellido paterno, apellido materno— pero el
 * resultado tiene que quedar EDITABLE antes de crear a nadie: un expediente con
 * el apellido mal es un expediente que alguien tendrá que corregir a mano
 * después, cuando ya tenga checadas colgando.
 *
 * Casos que se manejan:
 *  · «Eduardo Gomez»                    -> Eduardo / Gomez
 *  · «Omar Ruiz Lopez»                  -> Omar / Ruiz / Lopez
 *  · «Jazlyn Itzal Rodriguez Gonzalez»  -> Jazlyn Itzal / Rodriguez / Gonzalez
 *  · «Romeo de la cruz»                 -> Romeo / de la cruz
 *    (las partículas se pegan al apellido que las sigue; separarlas daría
 *     «de» como apellido paterno, que no existe)
 */
export interface SplitName {
  firstName: string
  lastName: string
  secondLastName: string
}

/** Partículas que forman parte del apellido, no un apellido por sí solas. */
const PARTICULAS = new Set(['de', 'del', 'la', 'las', 'los', 'y', 'da', 'do', 'van', 'von', "d'"])

const esParticula = (palabra: string): boolean => PARTICULAS.has(palabra.toLowerCase())

/**
 * Agrupa las palabras pegando cada partícula a la siguiente: «de la cruz» pasa
 * a ser una sola pieza en vez de tres.
 */
function agrupar(palabras: string[]): string[] {
  const piezas: string[] = []
  let pendiente: string[] = []

  for (const palabra of palabras) {
    if (esParticula(palabra)) {
      pendiente.push(palabra)
      continue
    }
    piezas.push([...pendiente, palabra].join(' '))
    pendiente = []
  }

  // Si el nombre acaba en partícula, se pega a la última pieza en vez de perderse.
  if (pendiente.length > 0) {
    if (piezas.length > 0) piezas[piezas.length - 1] += ` ${pendiente.join(' ')}`
    else piezas.push(pendiente.join(' '))
  }

  return piezas
}

export function splitName(raw: string | null): SplitName {
  const limpio = (raw ?? '').trim().replace(/\s+/g, ' ')
  if (limpio === '') return { firstName: '', lastName: '', secondLastName: '' }

  const piezas = agrupar(limpio.split(' '))

  // Una sola pieza: no hay apellido que separar. Se deja como nombre y que la
  // persona complete; inventar un apellido sería peor que dejarlo vacío.
  if (piezas.length === 1) return { firstName: piezas[0]!, lastName: '', secondLastName: '' }

  if (piezas.length === 2) {
    return { firstName: piezas[0]!, lastName: piezas[1]!, secondLastName: '' }
  }

  // Tres o más: las dos últimas son los apellidos, el resto es el nombre.
  return {
    firstName: piezas.slice(0, -2).join(' '),
    lastName: piezas.at(-2)!,
    secondLastName: piezas.at(-1)!,
  }
}
