/**
 * Cómo clasificaba **el equipo** a la persona en el instante del marcaje.
 *
 * No es un dato nuestro y no hay que confundirlo con la baja en Astra: son dos
 * hechos distintos y pueden discrepar. Alguien puede estar activo en la
 * plantilla y marcado como no autorizado en el reloj, o al revés.
 *
 * El código viaja crudo desde el fabricante y se traduce **aquí y en ningún
 * otro sitio**, como `punchType` y `verificationMethod`. Hikvision emite
 * `normal`, `visitor` y `blackList` —lo que su propia interfaz en español llama
 * «persona en la lista de no autorizados»—; otra marca nombrará lo suyo.
 *
 * `null` es «no consta», y **no es lo mismo que «normal»**: significa que el
 * equipo no lo declaró. Afirmar «normal» ahí sería inventar evidencia, igual
 * que deducir una entrada por el orden de las checadas.
 */
export interface DeviceUserTypeLook {
  label: string
  /** Rojo solo para lo que el equipo señaló él mismo. */
  color: 'neutral' | 'warning' | 'error'
  /** El equipo dijo explícitamente que esa persona no está autorizada. */
  flagged: boolean
  /** El equipo declaró algo. `false` = no consta. */
  declared: boolean
  /** La frase larga, para el `title` del elemento. */
  detail: string
}

const NO_AUTORIZADA: DeviceUserTypeLook = {
  label: 'No autorizada en el reloj',
  color: 'error',
  flagged: true,
  declared: true,
  detail:
    'El equipo la tenía en su lista de no autorizados y aun así registró el ' +
    'marcaje. Estar en esa lista no le impide checar ni pasar.',
}

const LOOKS: Record<string, DeviceUserTypeLook> = {
  normal: {
    label: 'Normal',
    color: 'neutral',
    flagged: false,
    declared: true,
    detail: 'El equipo la tenía dada de alta como persona normal.',
  },
  visitor: {
    label: 'Visitante',
    color: 'warning',
    flagged: false,
    declared: true,
    detail: 'El equipo la tenía dada de alta como visitante, no como personal.',
  },
  // `blackList` es la grafía del DS-K1T805MX; `blockList` la de otros
  // firmwares. Son el mismo hecho y se pintan igual.
  blacklist: NO_AUTORIZADA,
  blocklist: NO_AUTORIZADA,
}

const NO_CONSTA: DeviceUserTypeLook = {
  label: 'No consta',
  color: 'neutral',
  flagged: false,
  declared: false,
  detail: 'El equipo no declaró cómo clasificaba a esta persona.',
}

export function deviceUserTypeLook(raw: string | null): DeviceUserTypeLook {
  if (raw === null || raw.trim() === '') return NO_CONSTA

  // La búsqueda ignora mayúsculas —`blackList` y `BlackList` son el mismo
  // hecho— pero el código crudo es el que se manda al filtrar.
  const look = LOOKS[raw.trim().toLowerCase()]
  if (look) return look

  // Un código que no conozco se pinta con su código, sin inventarle
  // significado, y se marca como declarado: el equipo SÍ dijo algo.
  return {
    label: raw,
    color: 'warning',
    flagged: false,
    declared: true,
    detail: `El equipo declaró «${raw}», un valor que este catálogo todavía no traduce.`,
  }
}

/**
 * Opciones del filtro de `GET /punches?deviceUserType=`.
 *
 * Los valores van con la grafía EXACTA que emite el equipo, porque el servidor
 * compara el código crudo. Cambiar aquí `blackList` por `blacklist` devolvería
 * cero filas sin decir por qué.
 */
export const DEVICE_USER_TYPES = ['normal', 'visitor', 'blackList'] as const
