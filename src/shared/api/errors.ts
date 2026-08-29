/**
 * Forma única de error de la API. La produce un filtro global en el backend,
 * así que TODOS los errores la respetan, incluidos los 401 y los 500.
 */
export interface ApiErrorBody {
  statusCode: number
  /** Siempre string. El filtro ya aplanó el arreglo de class-validator. */
  message: string
  error: string
  timestamp: string
  path: string
  requestId: string
  /** Solo aparece cuando hay MÁS DE UN fallo de validación. */
  details?: string[]
}

export class ApiError extends Error {
  readonly status: number
  readonly details: readonly string[]
  /** También viaja en la cabecera `x-request-id`. Píntalo: localiza la petición en la bitácora. */
  readonly requestId: string | null
  readonly path: string | null

  constructor(status: number, body: Partial<ApiErrorBody>, requestId: string | null) {
    super(body.message ?? fallbackMessage(status))
    this.name = 'ApiError'
    this.status = status
    this.details = body.details ?? []
    this.requestId = body.requestId ?? requestId
    this.path = body.path ?? null
  }

  get isValidation(): boolean {
    return this.status === 400
  }

  get isUnauthorized(): boolean {
    return this.status === 401
  }

  /** Privilegios insuficientes por rol. El servidor manda el texto ya redactado. */
  get isForbidden(): boolean {
    return this.status === 403
  }

  /**
   * Recurso inexistente **o de otra razón social**: el backend responde 404 en
   * ambos casos, a propósito, para no filtrar la existencia de datos ajenos.
   *
   * Por eso jamás se pinta un 404 como «no tienes permiso»: desde aquí es
   * indistinguible de un id que no existe, y afirmarlo sería mentir.
   */
  get isNotFound(): boolean {
    return this.status === 404
  }

  get isServer(): boolean {
    return this.status >= 500
  }

  /**
   * Reparte `details` entre los campos que el formulario conoce y el resto.
   *
   * Los detalles no traen el campo aparte: vienen dentro del texto
   * (`"legalEntityId must be a UUID"`). Se toma el primer token, pero solo se
   * acepta si es un campo que pedimos — si no, los mensajes de negocio en
   * español («El código solo admite mayúsculas…») acabarían atribuidos a un
   * campo llamado «El».
   */
  splitDetails(knownFields: readonly string[] = []): {
    byField: Record<string, string[]>
    general: string[]
  } {
    const byField: Record<string, string[]> = {}
    const general: string[] = []
    const known = new Set(knownFields)

    for (const detail of this.details.length > 0 ? this.details : [this.message]) {
      const field = detail.split(' ')[0] ?? ''

      if (known.has(field)) {
        ;(byField[field] ??= []).push(detail)
      } else {
        general.push(detail)
      }
    }

    return { byField, general }
  }
}

/** La petición no llegó a salir o no hubo respuesta. Distinto de un error de la API. */
export class NetworkError extends Error {
  constructor(cause: unknown) {
    super('No se pudo contactar con el servidor.')
    this.name = 'NetworkError'
    this.cause = cause
  }
}

/** La sesión se perdió y no se puede recuperar: hay que volver a entrar. */
export class SessionLostError extends Error {
  constructor(cause?: unknown) {
    super('Tu sesión terminó. Vuelve a entrar.')
    this.name = 'SessionLostError'
    this.cause = cause
  }
}

function fallbackMessage(status: number): string {
  // Ojo con el 404: nunca «no tienes permiso». Ver ApiError.isNotFound.
  if (status === 404) return 'No se encontró el recurso.'
  if (status === 403) return 'No tienes los privilegios suficientes.'
  if (status >= 500) return 'El servidor tuvo un problema.'
  return 'La petición no se pudo completar.'
}
