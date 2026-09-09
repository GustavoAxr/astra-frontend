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

/**
 * EL ORDEN DEL MENÚ, Y POR QUÉ ES ESE.
 *
 * De lo que se abre todos los días a lo que se configura una vez. Antes había
 * dos apartados arriba —los de configurar— y debajo siete entradas sueltas que
 * mezclaban el trabajo diario con los aparatos: «Relojes, Turnos, Asistencia,
 * Tiempo extra, Marcajes, Salud de relojes, Agentes» no es una lista, es lo que
 * quedó de irlas agregando.
 *
 * Ahora cada apartado responde a UNA pregunta:
 *
 *   · Día a día   → ¿cómo va la gente?          (se abre a diario)
 *   · Personal    → ¿quién es y qué le pasa?    (se abre cada semana)
 *   · Estructura  → ¿contra qué se mide?        (se toca al contratar o al cambiar reglas)
 *   · Relojes     → ¿los aparatos están bien?   (se mira cuando algo falla)
 *
 * Y todo va en apartados, sin entradas sueltas: una entrada suelta al mismo
 * nivel que un apartado dice «esto no pertenece a ningún sitio», y en un menú
 * de trece pantallas eso se acumula hasta que nada parece estar donde va.
 */
/**
 * Todos MENOS la gerencia. Se escribe así —lo que sí ve, no lo que no— porque
 * un rol nuevo debe aparecer explícitamente donde le toque en vez de heredar
 * acceso a todo por olvido.
 */
export const SIN_GERENCIA: readonly Role[] = [
  'DIRECTOR_HOLDING',
  'ADMIN_EMPRESA',
  'RRHH',
  'SUPERVISOR',
  'OPERADOR',
  'SOPORTE',
]

export const NAVIGATION: readonly NavEntry[] = [
  /*
   * LA GERENCIA VE UNA SOLA PANTALLA, y por eso cada entrada dice quién la ve.
   *
   * El rol `GERENTE` existe para pedir tiempo extra —el jefe de área que pide
   * que alguien se quede— y nada más. Enseñarle la asistencia de toda la
   * plantilla, los marcajes o los relojes sería darle una consola de RRHH a
   * quien solo tiene que firmar una solicitud. El servidor lo aplica igual:
   * esto solo evita ofrecer pantallas que responderían 403.
   */
  {
    label: 'Día a día',
    icon: 'i-lucide-calendar-check',
    /*
     * En el orden de una revisión de verdad: primero la conclusión, luego lo
     * que espera una decisión, y al final la evidencia a la que se baja cuando
     * un número no cuadra. Al revés obligaría a empezar por los marcajes crudos
     * para llegar a lo que se venía a ver.
     */
    children: [
      {
        name: 'attendance',
        label: 'Asistencia',
        icon: 'i-lucide-calendar-check',
        roles: SIN_GERENCIA,
      },
      { name: 'overtime', label: 'Tiempo extra', icon: 'i-lucide-timer' },
      { name: 'punches', label: 'Marcajes', icon: 'i-lucide-fingerprint', roles: SIN_GERENCIA },
    ],
  },
  {
    label: 'Personal',
    icon: 'i-lucide-users',
    children: [
      { name: 'employees', label: 'Plantilla', icon: 'i-lucide-contact', roles: SIN_GERENCIA },
      {
        name: 'absences',
        label: 'Vacaciones y permisos',
        icon: 'i-lucide-plane',
        roles: SIN_GERENCIA,
      },
      {
        name: 'holidays',
        label: 'Días festivos',
        icon: 'i-lucide-party-popper',
        roles: SIN_GERENCIA,
      },
    ],
  },
  {
    label: 'Estructura',
    icon: 'i-lucide-building-2',
    /*
     * En el mismo orden en que se llena una adscripción: dónde trabaja, con qué
     * horario, en qué área y con qué puesto. Son exactamente las cuatro cosas a
     * las que apunta una adscripción, y encontrarlas en el orden en que se
     * preguntan ahorra buscar.
     */
    children: [
      {
        name: 'organization',
        label: 'Razones sociales y bases',
        icon: 'i-lucide-building',
        roles: SIN_GERENCIA,
      },
      { name: 'shifts', label: 'Turnos', icon: 'i-lucide-calendar-clock', roles: SIN_GERENCIA },
      {
        name: 'departments',
        label: 'Departamentos',
        icon: 'i-lucide-network',
        roles: SIN_GERENCIA,
      },
      { name: 'positions', label: 'Puestos', icon: 'i-lucide-briefcase', roles: SIN_GERENCIA },
      /*
       * Va en Estructura y no en Personal porque no es gente que trabaja: es
       * gente que ENTRA AL SISTEMA. Mezclarlas haría pensar que dar de alta a
       * alguien en la plantilla le crea una cuenta, que es justo lo que no pasa.
       */
      /*
       * Va en Estructura, con lo que se configura una vez: cargar la plantilla
       * en lote es trabajo de arranque o de temporada, no de todos los días.
       */
      {
        name: 'imports',
        label: 'Cargar desde Excel',
        icon: 'i-lucide-file-spreadsheet',
        roles: ACTION_ROLES.bulkImport,
      },
      {
        name: 'users',
        label: 'Quién entra a Astra',
        icon: 'i-lucide-key-round',
        roles: ACTION_ROLES.manageUsers,
      },
      /*
       * Junto a los usuarios porque las dos contestan a lo mismo: qué se le ha
       * mandado a quién. Solo RRHH la ve.
       */
      {
        name: 'outbox',
        label: 'Correos que manda Astra',
        icon: 'i-lucide-mail',
        roles: ACTION_ROLES.viewOutbox,
      },
    ],
  },
  {
    label: 'Relojes',
    icon: 'i-lucide-hard-drive',
    // El aparato, su estado, y lo que lo conecta. Es el orden en que se busca
    // cuando alguien avisa de que un reloj no está mandando marcajes.
    children: [
      { name: 'devices', label: 'Equipos', icon: 'i-lucide-alarm-clock', roles: SIN_GERENCIA },
      {
        name: 'device-health',
        label: 'Salud del enlace',
        icon: 'i-lucide-activity',
        roles: SIN_GERENCIA,
      },
      {
        name: 'agents',
        label: 'Agentes de sitio',
        icon: 'i-lucide-server',
        // GET /agents responde 403 al DIRECTOR_HOLDING. Se oculta para no
        // ofrecer una pantalla que va a fallar; si alguien llega por URL, la
        // petición se hace igual y el servidor responde 403.
        roles: ACTION_ROLES.listAgents,
      },
    ],
  },
]

/*
 * QUÉ NO ESTÁ EN EL MENÚ, Y NO ES OLVIDO
 *
 *  · El EXPEDIENTE es de UNA persona: una entrada de menú tendría que
 *    preguntar «¿de quién?» antes de enseñar nada. Se llega desde Plantilla.
 *  · El PADRÓN DEL RELOJ y la CONCILIACIÓN son de UN equipo —llevan su
 *    `deviceId` en la ruta— y por lo mismo se llegan desde Equipos.
 *  · MARCAJES SIN DUEÑO es una bandeja de excepción, no una sección: ahí
 *    espera lo que llega de gente sin enrolar. Vive en `/marcajes-sin-dueno` y
 *    se llega desde donde se menciona, que es la lectura de un reloj.
 *
 * Lo que sigue faltando de verdad son los PERIODOS DE NÓMINA: no hay ni tabla
 * ni endpoint, así que no hay pantalla que poner.
 */

/**
 * El menú que le toca a estos roles.
 *
 * OCULTA, NO PROTEGE. Una entrada escondida no cierra nada: si alguien llega
 * por la URL, la pantalla se abre y es el servidor quien responde 403. Existe
 * porque la alternativa es peor —enseñar una entrada que siempre va a fallar
 * hace creer que el sistema está roto—.
 *
 * Un apartado que se queda sin hijos visibles desaparece entero: un
 * encabezado que no despliega nada es una promesa vacía.
 */
export function visibleNavigation(roles: readonly Role[]): NavEntry[] {
  const visible = (link: NavLink): boolean =>
    link.roles === undefined || link.roles.some((role) => roles.includes(role))

  return NAVIGATION.flatMap<NavEntry>((entry) => {
    if (!isGroup(entry)) return visible(entry) ? [entry] : []

    const hijos = entry.children.filter(visible)
    return hijos.length > 0 ? [{ ...entry, children: hijos }] : []
  })
}

/**
 * La primera pantalla que esta persona puede abrir.
 *
 * Hace falta porque «la pantalla de entrada» no es la misma para todos: un
 * gerente no puede ver Organización, que era el destino fijo tras entrar y el
 * de la ruta raíz. Sale de la MISMA tabla que el menú para que no haya dos
 * ideas distintas de a dónde puede ir alguien.
 */
export function primeraPantalla(roles: readonly Role[]): string {
  for (const entry of visibleNavigation(roles)) {
    if (!isGroup(entry)) return entry.name
    const primero = entry.children[0]
    if (primero) return primero.name
  }
  // Sin ninguna pantalla visible no hay nada que ofrecer, y mandarlo a una que
  // no puede abrir sería un bucle de redirecciones.
  return 'login'
}
