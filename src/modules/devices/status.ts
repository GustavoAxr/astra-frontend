/**
 * Vocabulario de estados. Vive aquí y no en la plantilla porque el conjunto es
 * del backend, no de lo que se vio en los datos de prueba: la tabla `devices`
 * declara cuatro estados y la de agentes otros cuatro distintos.
 *
 * El caso por omisión **no inventa**: si el backend añade un estado, se pinta
 * su código tal cual en gris, no se le asigna un significado que no tiene.
 * Suponer «lo que no es ONLINE está caído» hacía que un equipo en mantenimiento
 * apareciera como avería.
 */
type StatusLook = { label: string; color: 'success' | 'warning' | 'error' | 'neutral' }

const DEVICE_STATUS: Record<string, StatusLook> = {
  ONLINE: { label: 'En línea', color: 'success' },
  OFFLINE: { label: 'Sin conexión', color: 'error' },
  MAINTENANCE: { label: 'En mantenimiento', color: 'warning' },
  DECOMMISSIONED: { label: 'Dado de baja', color: 'neutral' },
}

const AGENT_STATUS: Record<string, StatusLook> = {
  ONLINE: { label: 'En línea', color: 'success' },
  OFFLINE: { label: 'Sin conexión', color: 'error' },
  MAINTENANCE: { label: 'En mantenimiento', color: 'warning' },
  REVOKED: { label: 'Revocado', color: 'neutral' },
}

export function deviceStatusLook(status: string): StatusLook {
  return DEVICE_STATUS[status] ?? unknown(status)
}

export function agentStatusLook(status: string): StatusLook {
  return AGENT_STATUS[status] ?? unknown(status)
}

function unknown(status: string): StatusLook {
  return { label: status, color: 'neutral' }
}
