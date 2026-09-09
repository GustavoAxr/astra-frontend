/** Fila de `GET /devices`. Arreglo plano: veinte relojes, no dos mil. */
export interface Device {
  id: string
  legalEntityId: string
  installationId: string
  edgeAgentId: string | null
  serialNumber: string
  brand: string
  model: string | null
  protocol: string
  ip: string | null
  status: string
  lastHeartbeatAt: string | null
  clockOffsetMs: number | null
  isActive: boolean
  /**
   * ¿Controla una puerta o un imán? No todos: hay checadores que solo registran
   * horarios. Decide si se le mandan permisos de acceso —sin ellos la
   * credencial se reconoce y la puerta no se abre— y si el padrón se los
   * reclama.
   */
  opensDoor: boolean
  /**
   * Si una checada hecha desde el teléfono le pide a este reloj que abra.
   *
   * Apagado por omisión: que una checada abra una puerta es una decisión de
   * seguridad de cada sitio, no algo que aparezca solo porque se actualizó el
   * sistema.
   */
  phonePunchOpensDoor: boolean
}

/** Un equipo que el sondeo cree haber reconocido. */
export interface DiscoveryCandidate {
  brand: string
  /** Lo que hay que mandar al alta. */
  protocol: string
  model: string | null
  firmware: string | null
  serialNumber: string | null
  port: number | null
  /** 0–100. */
  score: number
  /** En español, para mostrar tal cual. */
  reasons: string[]
  /** El equipo pedirá usuario y contraseña para dejar leer sus marcajes. */
  requiresCredentials: boolean
}

export type DiscoveryConfidence = 'ALTA' | 'MEDIA' | 'BAJA'

export interface DiscoveryResult {
  ip: string
  confidence: DiscoveryConfidence
  /** `null` = nadie reconoció el equipo. */
  best: DiscoveryCandidate | null
  /** De más a menos seguro. */
  candidates: DiscoveryCandidate[]
  /** No es un error: el equipo ya estaba dado de alta. */
  alreadyEnrolledAs: { id: string; serialNumber: string } | null
  /** Texto cuando nadie reconoce nada. Se muestra y se deja copiar. */
  unidentifiedSummary: string | null
  evidenceId: string | null
}

/**
 * Cómo se comparte el reloj entre razones sociales.
 *
 * `GLOBAL` es cómodo y concede mucho: el reloj servirá también a las razones
 * sociales que se den de alta **en el futuro**. Por eso se enseña con su
 * explicación a la vista, no escondido en un desplegable.
 */
export const SHARING_MODES = ['DEDICATED', 'SHARED', 'GLOBAL'] as const
export type SharingMode = (typeof SHARING_MODES)[number]

export const SHARING_MODE_LABEL: Record<SharingMode, { label: string; hint: string }> = {
  DEDICATED: {
    label: 'De una sola empresa',
    hint: 'El caso normal. El reloj atiende solo a esta razón social.',
  },
  SHARED: {
    label: 'Compartido',
    hint: 'Atiende a varias empresas declaradas una por una, como una puerta compartida.',
  },
  GLOBAL: {
    label: 'Global',
    hint: 'Atiende a TODAS las razones sociales, incluidas las que se den de alta después.',
  },
}

export interface EnrollDeviceForm {
  installationId: string
  ip: string
  serialNumber: string
  brand: string
  protocol: string
  model: string
  sharingMode: SharingMode
  opensDoor: boolean
  /**
   * QUÉ AGENTE LO ATIENDE. Vacío = ninguno.
   *
   * Sin esto, un reloj dado de alta desde la pantalla nacía huérfano y nunca
   * recibía órdenes: el servidor las reparte por agente. No fallaba nada
   * visible —se veía igual que uno bien puesto— y esa es la peor forma de
   * romperse.
   */
  edgeAgentId: string
}

/** Lo que devuelve `POST /devices/:id/sync`. */
export interface SyncOutcome {
  deviceId: string
  serialNumber: string
  /** Tramos leídos en esta llamada. */
  batches: number
  inserted: number
  duplicates: number
  /** Checadas de gente que todavía no está enrolada: van a la bandeja. */
  unmatched: number
  /** Quedan eventos por leer en el equipo: hay que volver a llamar. */
  hasMore: boolean
  /** Por dónde va la lectura, en palabras del propio equipo. */
  watermarkLabel: string | null
}
