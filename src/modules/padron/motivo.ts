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
  nombre: { label: 'Nombre', color: 'warning' },
}

export const motivoLabel = (m: MotivoDeDivergencia) => TEXTOS[m].label
export const motivoColor = (m: MotivoDeDivergencia) => TEXTOS[m].color

/** Lo que abre la puerta manda sobre lo cosmético al ordenar la lista. */
const PESO: Record<MotivoDeDivergencia, number> = { vigencia: 0, bloqueo: 1, nombre: 2 }

export const gravedad = (d: Divergencia): number =>
  Math.min(...d.motivos.map((m) => PESO[m]))

/** `2026-09-30T23:59:59-06:00` → `30/09/2026`. Nulo = sin fecha de fin. */
export function diaLegible(v: string | null | undefined): string {
  if (v === undefined) return 'no consta'
  if (v === null) return 'sin fecha de fin'
  const [a, m, d] = v.slice(0, 10).split('-')
  return `${d}/${m}/${a}`
}
