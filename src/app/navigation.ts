import { ACTION_ROLES } from '@/modules/auth/permissions'
import type { Role } from '@/modules/auth/types'

/** Una entrada que lleva a una pantalla. */
export interface NavLink {
  /** Nombre de la ruta, no la URL. */
  name: string
  label: string
  icon: string
  /**
   * Roles que ven la entrada. `undefined` = la ven todos.
   *
   * Esto **oculta, no protege**: el permiso real lo aplican el servidor y RLS.
   * Nunca se envuelve una llamada a la API en una comprobación de rol; la
   * llamada se hace igual y el servidor decide. Duplicar el permiso aquí solo
   * crearía dos verdades que acaban contradiciéndose.
   */
  roles?: readonly Role[]
}

/**
 * Un apartado que agrupa pantallas. **No tiene ruta propia** y es a propósito:
 * pulsar «Personal» no debe llevar a ningún sitio, porque no hay una pantalla
 * de «personal» — hay varias, y son las de dentro. Un grupo que además navega
 * obliga a inventarse una pantalla resumen que nadie pidió.
 */
export interface NavGroup {
  label: string
  icon: string
  children: readonly NavLink[]
}

export type NavEntry = NavLink | NavGroup

export const isGroup = (entry: NavEntry): entry is NavGroup => 'children' in entry

export const NAVIGATION: readonly NavEntry[] = [
  {
    label: 'Organización',
    icon: 'i-lucide-building-2',
    children: [
      { name: 'organization', label: 'Razones sociales y bases', icon: 'i-lucide-building' },
      { name: 'departments', label: 'Departamentos', icon: 'i-lucide-network' },
      { name: 'positions', label: 'Puestos', icon: 'i-lucide-briefcase' },
    ],
  },
  {
    label: 'Personal',
    icon: 'i-lucide-users',
    children: [
      { name: 'employees', label: 'Plantilla', icon: 'i-lucide-contact' },
      { name: 'absences', label: 'Vacaciones y permisos', icon: 'i-lucide-plane' },
      { name: 'holidays', label: 'Días festivos', icon: 'i-lucide-party-popper' },
    ],
  },
  { name: 'devices', label: 'Relojes', icon: 'i-lucide-alarm-clock' },
  { name: 'shifts', label: 'Turnos', icon: 'i-lucide-calendar-clock' },
  { name: 'attendance', label: 'Asistencia', icon: 'i-lucide-calendar-check' },
  /*
   * Va suelta y no dentro de «Personal»: es una BANDEJA —se entra a firmar lo
   * que está esperando— y quien la abre no viene a administrar personal, viene
   * a resolver algo que bloquea el pago de unas horas. La ve cualquiera: saber
   * qué se autorizó no es un privilegio, es lo que hace auditable el pago.
   */
  { name: 'overtime', label: 'Tiempo extra', icon: 'i-lucide-timer' },
  { name: 'punches', label: 'Marcajes', icon: 'i-lucide-fingerprint' },
  { name: 'device-health', label: 'Salud de relojes', icon: 'i-lucide-activity' },
  {
    name: 'agents',
    label: 'Agentes de sitio',
    icon: 'i-lucide-server',
    // GET /agents responde 403 al DIRECTOR_HOLDING. Se oculta para no ofrecer
    // una pantalla que va a fallar; si alguien llega por URL, la petición se
    // hace igual y el servidor responde 403.
    roles: ACTION_ROLES.listAgents,
  },
]

/*
 * QUÉ FALTA EN «PERSONAL» Y POR QUÉ NO ESTÁ TODAVÍA
 *
 *  · Conteo global de horas y gráficas — `computed_attendance` está VACÍA y no
 *    hay nada que la llene: el motor de cálculo no existe. Una gráfica sobre
 *    cero filas no es un módulo a medias, es una pantalla que miente. Es la
 *    pieza que hay que construir antes que ninguna otra de este apartado.
 *  · Periodos de nómina — no hay ni tabla ni endpoint.
 *
 * El expediente tampoco está aquí, y no es olvido: es de UNA persona, así que
 * se llega desde Plantilla. Una entrada de menú tendría que preguntar «¿de
 * quién?» antes de enseñar nada.
 *
 * «Marcajes sin dueño» YA NO ESTÁ EN EL MENÚ, y también a propósito: es una
 * bandeja de excepción, no una sección. La pantalla y su ruta siguen vivas en
 * `/marcajes-sin-dueno` —ahí espera lo que llega de gente sin enrolar— y se
 * llega desde donde se menciona: la lectura de un reloj y la conciliación.
 */

export function visibleNavigation(roles: readonly Role[]): NavEntry[] {
  const visible = (link: NavLink): boolean =>
    link.roles === undefined || link.roles.some((role) => roles.includes(role))

  return NAVIGATION.flatMap((entry): NavEntry[] => {
    if (!isGroup(entry)) return visible(entry) ? [entry] : []

    // Un grupo al que no le queda ningún hijo visible desaparece entero: dejar
    // el encabezado suelto solo enseñaría que hay algo que no se puede ver.
    const children = entry.children.filter(visible)
    return children.length ? [{ ...entry, children }] : []
  })
}
