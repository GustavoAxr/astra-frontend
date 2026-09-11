import type { Divergencia, MotivoDeDivergencia } from './types'

/**
 * Un solo sitio traduce los motivos. Sin esto acabarían escritos a mano en cada
 * plantilla y cada uno diría una cosa distinta.
 */
const TEXTOS: Record<MotivoDeDivergencia, { label: string; color: 'warning' | 'error' }> = {
  // La vigencia es la grave: significa que el reloj le sigue abriendo la puerta
  // a alguien a quien Astra ya le puso fecha de salida.
  vigencia: { label: 'Vigencia', color: 'error' },
  bloqueo: { label: 'Bloqueo', color: 'error' },
  // El fallo que no se ve: la credencial se reconoce, la checada llega y el
  // imán no se suelta. La persona se queda fuera con el marcaje hecho.
  permiso: { label: 'Sin permiso de puerta', color: 'error' },
  // Una vigencia que empieza tarde deja fuera a quien acaba de entrar.
  inicio: { label: 'Fecha de alta', color: 'warning' },
  nombre: { label: 'Nombre', color: 'warning' },
  // No abre ni cierra puertas, pero sale en la ficha del aparato y en sus
  // listados. Se empuja como todo lo demás.
  sexo: { label: 'Sexo', color: 'warning' },
}

export const motivoLabel = (m: MotivoDeDivergencia) => TEXTOS[m].label
export const motivoColor = (m: MotivoDeDivergencia) => TEXTOS[m].color

/** Lo que abre la puerta manda sobre lo cosmético al ordenar la lista. */
const PESO: Record<MotivoDeDivergencia, number> = {
  permiso: 0,
  vigencia: 1,
  bloqueo: 2,
  inicio: 3,
  nombre: 4,
  sexo: 5,
}

export const gravedad = (d: Divergencia): number =>
  Math.min(...d.motivos.map((m) => PESO[m]))

/** `H`/`M` como se escribe para una persona. Nada que decir si no consta. */
export function sexoLegible(v: 'H' | 'M' | null | undefined): string {
  if (v === 'H') return 'Hombre'
  if (v === 'M') return 'Mujer'
  if (v === null) return 'sin dato'
  return 'no consta'
}

/** `2026-09-30T23:59:59-06:00` → `30/09/2026`. Nulo = sin fecha de fin. */
export function diaLegible(v: string | null | undefined): string {
  if (v === undefined) return 'no consta'
  if (v === null) return 'sin fecha de fin'
  const [a, m, d] = v.slice(0, 10).split('-')
  return `${d}/${m}/${a}`
}
