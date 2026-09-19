<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAsync } from '@/shared/composables/useAsync'
import ApiErrorAlert from '@/shared/ui/ApiErrorAlert.vue'
import ReportExportMenu from '@/modules/reports/components/ReportExportMenu.vue'
import {
  mesDe,
  mesEnPalabras,
  moverMes,
  quincenaAnterior,
  quincenaDe,
  rangoDelMes,
  todayLocal,
  type Rango,
} from '@/shared/date'
import ConfirmDialog from '@/shared/ui/ConfirmDialog.vue'
import { useAuthStore } from '@/modules/auth/store'
import { orgApi } from '@/modules/org/api'
import { attendanceApi } from '@/modules/attendance/api'
import { padronApi } from '@/modules/padron/api'
import { enPlano } from '@/shared/text'
import { WHATSAPP_ACTIVO } from '@/shared/config/funciones'
import EmployeeDayTimeline from '@/modules/attendance/components/EmployeeDayTimeline.vue'
import CorregirDiaModal from '@/modules/attendance/components/CorregirDiaModal.vue'
import TelefonosRemotos from '../components/TelefonosRemotos.vue'
import CredencialDeChecado from '../components/CredencialDeChecado.vue'
import type { TabsItem } from '@nuxt/ui'
import type { DerivedDay } from '@/modules/attendance/types'
import { attendanceStatusLook } from '@/modules/attendance/types'
import { useAviso } from '@/shared/ui/aviso'
import { employeesApi } from '../api'
import { summarizeShift } from '../shift-summary'
import EmployeeEditModal from '../components/EmployeeEditModal.vue'
import DeleteEmployeeModal from '../components/DeleteEmployeeModal.vue'
import EmployeeStatusModal from '../components/EmployeeStatusModal.vue'
import AssignmentModal from '../components/AssignmentModal.vue'
import EnrolarEnRelojModal from '../components/EnrolarEnRelojModal.vue'
import {
  ASSIGNMENT_REASON_LABEL,
  EMPLOYMENT_EVENTS,
  EMPLOYMENT_EVENT_LABEL,
  type AssignmentReason,
  type EmploymentEventType,
} from '../types'
import {
  antiguedadEnPalabras,
  diasPorTipoEnElAño,
  duracionEnDias,
  estadoDeIncidencia,
  horaCorta,
  resumirVidaLaboral,
} from '../hr-timeline'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const id = computed(() => String(route.params.employeeId))

const canWrite = computed(() => auth.can('assignEmployee'))
/*
 * REPARTIR CREDENCIALES DE PUERTA NO ES ASIGNAR ADSCRIPCIONES.
 *
 * Va con su propio permiso y no con `canWrite` porque el backend declara otros
 * roles: `SOPORTE` asigna adscripciones en cualquier cliente pero no reparte
 * con qué ficha la gente su jornada — eso es del cliente.
 */
const puedeDarAcceso = computed(() => auth.can('grantMobileCheckIn'))
/*
 * Y VERLO es más ancho que repartirlo. Sin esta línea, la tarjeta le pedía el
 * estado al servidor para `DIRECTOR_HOLDING` y `OPERADOR` —que sí abren el
 * expediente— y se llevaba un 403 pintado en rojo.
 */
const puedeVerAcceso = computed(() => auth.can('viewMobileCheckIn'))

/**
 * Borrar definitivamente es de quien administra la razón social, no de RRHH.
 * Espejo de los `@Roles` del backend; oculta, no protege.
 */
const canPurge = computed(() => auth.can('purgeEmployee'))
/** Oculta lo que no aplica; NO protege. El portero está en el servidor. */
const puedeCorregir = computed(() => auth.can('correctAttendance'))
/** El día que RRHH está corrigiendo. `null` = no hay ninguno abierto. */
const corrigiendo = ref<DerivedDay | null>(null)
/** Escribir en un equipo es de RRHH y del administrador. Regla 6: oculta, no protege. */
const canPush = computed(() => auth.can('assignEmployee'))

const borrarOpen = ref(false)
const estadoOpen = ref(false)
/**
 * SIN NÚMERO EN NINGÚN RELOJ, que es distinto de «el reloj tiene datos viejos».
 *
 * Hasta ahora el único sitio del que alguien salía hacia el reloj era la
 * casilla del formulario de alta, de un solo intento. Si ese paso fallaba, la
 * persona quedaba en Astra sin acceso a la puerta y sin forma de arreglarlo:
 * el padrón empuja a quien YA está vinculado, no vincula a quien no lo está.
 * El propio mensaje de error remitía aquí, y aquí no había nada.
 */
const enrolarOpen = ref(false)
/** Abrir el modal directo en el paso del reloj, sin repetir la baja. */
const soloElReloj = ref(false)

const employee = useAsync((signal) => employeesApi.get(id.value, signal))
const shifts = useAsync((signal) => employeesApi.shiftPolicies(undefined, signal))
const installations = useAsync((signal) => orgApi.installations({ incluirInactivas: true }, signal))
const events = useAsync((signal) => employeesApi.events(id.value, signal))
const exceptions = useAsync((signal) => employeesApi.exceptions({ employeeId: id.value }, signal))
const exceptionTypes = useAsync((signal) => employeesApi.exceptionTypes(signal))
const departments = useAsync((signal) => employeesApi.departments(signal))
const positions = useAsync((signal) => orgApi.positions(undefined, signal))
/**
 * QUÉ PERIODO SE ESTÁ MIRANDO.
 *
 * Son dos cosas separadas, igual que en la pantalla de Asistencia: el MES sobre
 * el que uno se para —y por el que navegan las flechas— y el CORTE dentro de
 * ese mes. Se guarda el mes en `YYYY-MM` y no sus dos fechas porque «agosto»
 * sigue siendo agosto se mire cuando se mire; el rango se deriva.
 *
 * ── POR QUÉ HIZO FALTA ──
 * Antes solo existía el corte, y siempre contra HOY: los cinco periodos salían
 * de días naturales hacia atrás desde el día en curso, así que el expediente no
 * alcanzaba más allá del mes corriente. Con checadas desde agosto y estando en
 * septiembre, agosto ya no se podía mirar entero — y el expediente es justo
 * donde alguien discute una falta de hace dos meses.
 *
 * `libre` es la salida para el corte que no es un mes ni una quincena: los
 * catorce días de un finiquito, o un tramo que cruza dos meses.
 */
type Periodo =
  'dia' | 'semana' | 'quincena' | 'quincena-anterior' | 'mes' | 'primera' | 'segunda' | 'libre'

const mesActual = mesDe(todayLocal())
const mes = ref(mesActual)
const periodo = ref<Periodo>('semana')
const esMesActual = computed(() => mes.value === mesActual)

/** El rango libre. Arranca en el mes que se esté mirando, no en blanco. */
const libreDesde = ref(rangoDelMes(mesActual, 'mes').from)
const libreHasta = ref(todayLocal())

/*
 * LAS OPCIONES CAMBIAN SEGÚN EL MES. «Hoy», «esta semana» y «la quincena en
 * curso» solo significan algo en el mes en el que estamos: ofrecer «hoy»
 * estando parado en julio sería ofrecer un día que no está en la pantalla. En
 * un mes pasado lo que hay son cortes de calendario.
 *
 * El rango libre está en las dos listas: no depende del mes, y es lo que
 * permite un tramo que los cruza.
 */
const PERIODOS_DEL_MES_EN_CURSO = [
  { label: 'Hoy', value: 'dia' },
  { label: 'Últimos 7 días', value: 'semana' },
  { label: 'Quincena en curso', value: 'quincena' },
  { label: 'Quincena anterior', value: 'quincena-anterior' },
  { label: 'Mes completo', value: 'mes' },
  { label: 'Rango libre', value: 'libre' },
]

const PERIODOS_DE_UN_MES_PASADO = [
  { label: 'Mes completo', value: 'mes' },
  { label: '1.ª quincena', value: 'primera' },
  { label: '2.ª quincena', value: 'segunda' },
  { label: 'Rango libre', value: 'libre' },
]

const periodos = computed(() =>
  esMesActual.value ? PERIODOS_DEL_MES_EN_CURSO : PERIODOS_DE_UN_MES_PASADO,
)

/**
 * NUNCA SE PIDEN DÍAS QUE NO HAN OCURRIDO.
 *
 * Un día con turno y sin checadas es una FALTA para el motor, y mañana todavía
 * no hay checadas de nadie: pedir «el mes completo» un día 29 devolvería dos
 * faltas de los días 30 y 31, que es acusar a alguien de algo que no ha pasado.
 */
const hastaHoy = (r: Rango): Rango => {
  const hoy = todayLocal()
  return r.to > hoy ? { from: r.from, to: hoy } : r
}

/**
 * Dos formas distintas de acotar, y la diferencia importa.
 *
 * «Hoy» y «últimos 7 días» son días naturales hacia atrás: responden a «cómo ha
 * ido últimamente». Las QUINCENAS son cortes de calendario —del 1 al 15 y del
 * 16 a fin de mes— porque son los que se cierran en nómina, y ahí el rango
 * tiene que coincidir exactamente con el periodo que se paga.
 *
 * La segunda quincena termina el último día del mes sea cual sea: 28, 29, 30
 * o 31. Eso lo resuelve el calendario, no una cuenta a mano.
 */
const rango = computed<Rango>(() => {
  const hoy = todayLocal()

  if (periodo.value === 'libre') {
    // Al revés se pediría un rango vacío y la pantalla diría «no hay días»
    // cuando lo que hay es un par de campos cruzados.
    return libreDesde.value <= libreHasta.value
      ? { from: libreDesde.value, to: libreHasta.value }
      : { from: libreHasta.value, to: libreDesde.value }
  }

  if (periodo.value === 'quincena') return hastaHoy(quincenaDe(hoy))
  if (periodo.value === 'quincena-anterior') return quincenaAnterior(hoy)
  if (periodo.value === 'primera') return hastaHoy(rangoDelMes(mes.value, 'primera'))
  if (periodo.value === 'segunda') return hastaHoy(rangoDelMes(mes.value, 'segunda'))
  if (periodo.value === 'mes') return hastaHoy(rangoDelMes(mes.value, 'mes'))

  // «Hoy» y «últimos 7 días» solo existen en el mes en curso.
  const atras = periodo.value === 'dia' ? 0 : 6
  const desde = new Date(Date.parse(`${hoy}T00:00:00Z`) - atras * 86_400_000)
    .toISOString()
    .slice(0, 10)
  return { from: desde, to: hoy }
})

/**
 * Al cambiar de mes, el corte elegido puede dejar de existir —«hoy» no está en
 * julio— y entonces se cae al mes completo, que siempre aplica.
 *
 * Y el rango libre se muda al mes nuevo: dejarlo donde estaba haría que las
 * flechas no cambiaran nada, que es la peor clase de control — uno que se
 * pulsa, se mueve y no hace nada.
 */
function irAlMes(destino: string): void {
  if (destino > mesActual) return
  mes.value = destino

  if (!periodos.value.some((p) => p.value === periodo.value)) periodo.value = 'mes'

  const delMes = hastaHoy(rangoDelMes(destino, 'mes'))
  libreDesde.value = delMes.from
  libreHasta.value = delMes.to
}

/** Cómo se pidió el periodo. Solo se imprime en el expediente exportado. */
const etiquetaDelPeriodo = computed(() => {
  if (periodo.value === 'libre') return `Del ${rango.value.from} al ${rango.value.to}`
  const nombre = periodos.value.find((p) => p.value === periodo.value)?.label ?? 'Mes completo'
  return esMesActual.value ? nombre : `${nombre} · ${mesEnPalabras(mes.value)}`
})

const attendance = useAsync((signal) => attendanceApi.derived(id.value, rango.value, signal))

/**
 * Los descansos SIN checadas no se listan.
 *
 * Un sábado vacío no informa de nada y empuja fuera de la pantalla los días que
 * sí importan. Los descansos CON checadas sí se quedan: ahí sí hay algo que
 * mirar, porque alguien trabajó un día que su turno da por libre.
 */
const jornadas = computed(() =>
  (attendance.data.value?.data ?? []).filter((j) => !(j.status === 'REST' && j.punchCount === 0)),
)

const descansosOcultos = computed(
  () =>
    (attendance.data.value?.data ?? []).filter((j) => j.status === 'REST' && j.punchCount === 0)
      .length,
)
const totales = computed(() => attendance.data.value?.totals ?? null)

/**
 * Los porcentajes vienen del SERVIDOR, no se calculan aquí.
 *
 * «Puntualidad» puede significar tres cosas según qué se ponga de
 * denominador, así que la definición vive en un solo sitio. Aquí solo se
 * pinta — incluido el caso en que no hay denominador y llega nulo.
 */
const pct = (v: number | null): string => (v === null ? '—' : `${v}%`)

/** Verde por encima del 90, ámbar del 70 al 90, rojo por debajo. */
function tono(v: number | null): string {
  if (v === null) return 'text-dimmed'
  if (v >= 90) return 'text-success'
  if (v >= 70) return 'text-warning'
  return 'text-error'
}

/** «8h 12m». Nadie lee 492 minutos de corrido. */
function hhmm(minutos: number): string {
  if (!minutos) return '—'
  const h = Math.floor(minutos / 60)
  const m = minutos % 60
  if (h === 0) return `${m} min`
  return m === 0 ? `${h} h` : `${h} h ${m} min`
}

/*
 * SE OBSERVA EL RANGO, NO EL CORTE.
 *
 * Ahora el rango depende del mes y de los dos campos del rango libre, no solo
 * del corte. Vigilando `periodo` a secas, pulsar una flecha dejaba la pantalla
 * con los datos del mes anterior y sin nada que avisara.
 */
watch(rango, () => void attendance.run())

const editOpen = ref(false)
const assignOpen = ref(false)
const actionError = ref<Error | null>(null)

/**
 * Dar de baja, reactivar y cancelar una justificación cambian datos de un solo
 * clic, así que pasan por confirmación como todo lo demás en el sistema.
 */
const confirming = ref<{
  title: string
  message: string
  warning?: string
  confirmLabel: string
  action: () => Promise<void>
} | null>(null)

// Alta de movimiento y de justificación.
const aviso = useAviso()
const eventType = ref<EmploymentEventType>('SUSPENDED')
const eventDate = ref(todayLocal())
const eventNotes = ref('')
const savingEvent = ref(false)

const exceptionTypeId = ref('')
const exceptionFrom = ref('')
const exceptionTo = ref('')
const exceptionDoc = ref('')
const savingException = ref(false)

const person = computed(() => employee.data.value)
const fullName = computed(() =>
  person.value
    ? [person.value.firstName, person.value.lastName, person.value.secondLastName]
        .filter(Boolean)
        .join(' ')
    : '',
)

/**
 * DÓNDE TRABAJA, que es lo que habilita checar desde el teléfono.
 *
 * Va junto a las adscripciones porque ES la adscripción: el interruptor está en
 * «Cambiar», a un palmo del distintivo. Antes ocupaba una tarjeta entera para
 * decir «esta persona checa en el reloj» —cuatro renglones para el caso normal,
 * que es casi todo el mundo—. Ahora se lee en una palabra y la explicación
 * aparece al pasar el ratón, para quien la necesite.
 */
const esRemota = computed(() => person.value?.current?.workMode === 'REMOTE')

/**
 * UN ICONO POR MOTIVO, en la línea de tiempo de las adscripciones.
 *
 * No es adorno: en una lista de seis renglones casi iguales —misma base, mismo
 * puesto, fechas distintas— el icono es lo único que deja ver de un vistazo qué
 * fue cada cambio. Una promoción y una cobertura temporal se leen distinto.
 */
const ICONO_DEL_MOTIVO: Record<AssignmentReason, string> = {
  HIRED: 'i-lucide-user-plus',
  TRANSFERRED: 'i-lucide-arrow-right-left',
  SHIFT_CHANGE: 'i-lucide-clock',
  PROMOTED: 'i-lucide-trending-up',
  TEMPORARY_COVER: 'i-lucide-umbrella',
  SEASONAL: 'i-lucide-calendar-range',
  REHIRED: 'i-lucide-rotate-ccw',
  OTHER: 'i-lucide-circle',
}

/**
 * LAS ADSCRIPCIONES COMO LÍNEA DE TIEMPO, de la más vieja a la de hoy.
 *
 * ══ POR QUÉ ASÍ Y NO UNA LISTA ══
 *
 * Una adscripción no es un dato suelto: es un tramo de la historia de esa
 * persona en la empresa —dónde estuvo, con qué puesto y desde cuándo—, y lo que
 * se pregunta al abrirla es «¿por dónde ha pasado?». Una lista de renglones
 * obliga a leer las fechas de cada uno para reconstruir el orden; una línea lo
 * enseña.
 *
 * DE LA MÁS VIEJA ABAJO NO: arriba. Se lee como se cuenta una carrera —entró
 * aquí, luego pasó allá, hoy está en esto— y la vigente queda al final, que es
 * donde el ojo se detiene.
 */
const lineaDeAdscripciones = computed(() =>
  [...(person.value?.assignments ?? [])]
    .sort((a, b) => a.validFrom.localeCompare(b.validFrom))
    .map((a) => ({
      value: a.id,
      /* Los datos crudos viajan con el elemento: la plantilla los pinta a mano. */
      adscripcion: a,
      icon: ICONO_DEL_MOTIVO[a.reason as AssignmentReason] ?? 'i-lucide-circle',
      vigente: a.validTo === null,
    })),
)

/** La que sigue abierta: es la que la línea pinta encendida. */
const adscripcionVigente = computed(() => lineaDeAdscripciones.value.find((p) => p.vigente)?.value)

const currentShift = computed(() => {
  const policyId = person.value?.currentAssignment?.shiftPolicyId
  const policy = (shifts.data.value ?? []).find((s) => s.id === policyId)
  return policy ? { policy, summary: summarizeShift(policy) } : null
})

const installationName = (installationId: string): string =>
  (installations.data.value ?? []).find((i) => i.id === installationId)?.code ?? '—'

/**
 * El puesto de una adscripción PASADA se busca en el catálogo completo, activos
 * incluidos: si se retiró el puesto, la historia sigue diciendo cuál era.
 */
const positionName = (positionId: string | null): string => {
  if (!positionId) return 'Sin puesto'
  return (positions.data.value ?? []).find((p) => p.id === positionId)?.name ?? 'Puesto retirado'
}

const chosenType = computed(
  () => (exceptionTypes.data.value ?? []).find((t) => t.id === exceptionTypeId.value) ?? null,
)

const eventItems = EMPLOYMENT_EVENTS.map((e) => ({
  label: EMPLOYMENT_EVENT_LABEL[e],
  value: e,
}))

const typeItems = computed(() =>
  (exceptionTypes.data.value ?? []).map((t) => ({ label: t.name, value: t.id })),
)

const hora = new Intl.DateTimeFormat('es-MX', { timeStyle: 'short' })
const clock = (iso: string | null): string => (iso ? hora.format(new Date(iso)) : '—')

const diaLargo = new Intl.DateTimeFormat('es-MX', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
})
/**
 * «lun 24 ago». Se parte la fecha a mano en vez de `new Date(iso)`: una fecha
 * suelta se interpreta como UTC y en México retrocede un día, así que el lunes
 * saldría como domingo.
 */
function diaCorto(fecha: string): string {
  const [y, m, d] = fecha.split('-').map(Number)
  return diaLargo.format(new Date(y ?? 0, (m ?? 1) - 1, d ?? 1))
}

// ── Vida laboral ─────────────────────────────────────────────────────────

/**
 * El trabajo de más se parte en dos: lo que nadie ha evaluado y lo que RRHH ya
 * evaluó y no autorizó. Enseñarlos juntos deja sin saber qué falta por revisar.
 */
const extraPendiente = computed(() =>
  jornadas.value
    .filter((j) => !j.overtimeRejected)
    .reduce((suma, j) => suma + j.unapprovedOvertimeMinutes, 0),
)
const extraRechazado = computed(() =>
  jornadas.value
    .filter((j) => j.overtimeRejected)
    .reduce((suma, j) => suma + j.unapprovedOvertimeMinutes, 0),
)

const vidaLaboral = computed(() => resumirVidaLaboral(events.data.value ?? []))

/** Los avisos, por evento, para colgarlos de la fila que los provoca. */
const avisosPorEvento = computed(() => {
  const mapa = new Map<string, string>()
  for (const i of vidaLaboral.value.inconsistencias) mapa.set(i.eventId, i.aviso)
  return mapa
})

/**
 * El color de cada movimiento. Un alta y una baja no se leen igual, y en una
 * lista de cinco renglones el color es lo único que se lee de un vistazo.
 */
const COLOR_DE_EVENTO: Record<string, string> = {
  HIRED: 'bg-success',
  REINSTATED: 'bg-success',
  TERMINATED: 'bg-error',
  RESIGNED: 'bg-warning',
  SUSPENDED: 'bg-muted',
}

// ── Vacaciones y permisos ────────────────────────────────────────────────

const ESTADO_DE_INCIDENCIA: Record<
  string,
  { label: string; color: 'info' | 'neutral' | 'success' }
> = {
  'en-curso': { label: 'En curso', color: 'info' },
  proxima: { label: 'Próxima', color: 'success' },
  terminada: { label: 'Terminada', color: 'neutral' },
}

/** Ordenadas: primero lo que está pasando, luego lo que viene, luego lo viejo. */
const ORDEN_DE_ESTADO: Record<string, number> = {
  'en-curso': 0,
  proxima: 1,
  terminada: 2,
}

const incidencias = computed(() =>
  [...(exceptions.data.value ?? [])]
    .map((x) => ({ ...x, estado: estadoDeIncidencia(x) }))
    .sort(
      (a, b) =>
        (ORDEN_DE_ESTADO[a.estado] ?? 9) - (ORDEN_DE_ESTADO[b.estado] ?? 9) ||
        b.startDate.localeCompare(a.startDate),
    ),
)

/*
 * LAS DOS TARJETAS DE ABAJO SON LO MISMO: UN HISTORIAL Y UN ALTA.
 *
 * Antes iban apiladas —lista entera y debajo el formulario—, así que la
 * tarjeta crecía con cada movimiento y el formulario se hundía hasta necesitar
 * un desplazamiento para llegar a él. En pestañas, las dos cosas empiezan
 * siempre en el mismo sitio y la tarjeta mide igual con dos registros que con
 * treinta.
 *
 * SE ABRE EN EL HISTORIAL, no en el alta: entrar a un expediente es casi
 * siempre venir a MIRAR, y quien viene a capturar sabe lo que busca.
 *
 * ══ POR QUÉ LOS RÓTULOS VAN EN LA CABECERA Y EL PANEL ABAJO ══
 *
 * `UTabs` pinta las dos cosas juntas, y juntas se comían una franja entera del
 * cuerpo: el título arriba, los rótulos debajo, y el contenido empezando en el
 * tercer renglón. Los rótulos son un mando, no contenido, y su sitio es la
 * esquina de la tarjeta, enfrente del título.
 *
 * Así que el componente se queda con la LISTA —`:content="false"`— y los dos
 * paneles se pintan a mano en el cuerpo, gobernados por el mismo `v-model`.
 *
 * Y con `v-show`, no con `v-if`, por lo mismo que antes llevaba
 * `unmountOnHide` en falso: cambiar de pestaña para comprobar una fecha y
 * volver no puede borrar lo que ya se escribió en el formulario.
 */
const pestañaDeVidaLaboral = ref('historial')
const pestañaDeIncidencias = ref('historial')

const pestañasDeVidaLaboral = computed<TabsItem[]>(() => [
  {
    value: 'historial',
    label: 'Historial',
    icon: 'i-lucide-history',
    slot: 'historial' as const,
    // El número dice si hay algo que mirar sin tener que abrir la pestaña.
    ...((events.data.value ?? []).length > 0 ? { badge: (events.data.value ?? []).length } : {}),
  },
  ...(canWrite.value
    ? [
        {
          value: 'registrar',
          label: 'Registrar',
          icon: 'i-lucide-plus',
          slot: 'registrar' as const,
        },
      ]
    : []),
])

const pestañasDeIncidencias = computed<TabsItem[]>(() => [
  {
    value: 'historial',
    label: 'Historial',
    icon: 'i-lucide-history',
    slot: 'historial' as const,
    ...(incidencias.value.length > 0 ? { badge: incidencias.value.length } : {}),
  },
  ...(canWrite.value
    ? [
        {
          value: 'registrar',
          label: 'Registrar',
          icon: 'i-lucide-plus',
          slot: 'registrar' as const,
        },
      ]
    : []),
])

const añoEnCurso = Number(todayLocal().slice(0, 4))

/** Cuánto lleva tomado de cada tipo este año. Es la pregunta de RRHH. */
const saldoDelAño = computed(() => diasPorTipoEnElAño(exceptions.data.value ?? [], añoEnCurso))

async function reload(): Promise<void> {
  await Promise.all([employee.run(), events.run(), exceptions.run()])
  // La bitácora va después: hasta tener el expediente no se sabe en qué reloj
  // está, y sin reloj no hay órdenes que mirar.
  if (enElReloj.value) await ordenes.run()
}

/**
 * Que quedó algo pendiente en el reloj.
 *
 * Se enciende al cambiar el estado y se apaga al encolar la orden. Vive en una
 * bandera y no se deduce del expediente porque Astra NO sabe cómo está el
 * equipo sin preguntárselo con sus credenciales: darlo por pendiente siempre
 * sería un aviso permanente, que es un aviso que nadie lee.
 *
 * Y no manda a otra pantalla: reabre el mismo diálogo en su segundo paso. Ir a
 * Equipos → Padrón del reloj obligaba a buscar a esa persona entre cien
 * números para hacer lo que ya se sabía que había que hacer.
 */
const enElReloj = computed(() => person.value?.enrollments?.[0] ?? null)

/**
 * LO QUE YA SE LE PIDIÓ AL RELOJ SOBRE ESTA PERSONA.
 *
 * Astra no sabe cómo está el equipo sin preguntárselo con sus credenciales,
 * pero sí sabe qué le mandó y qué contestó: eso está en la bitácora de órdenes.
 * Es la diferencia entre insistir con un cartel que nadie puede quitar y decir
 * «esto ya se mandó y el reloj lo aplicó a las 12:49».
 */
const ordenes = useAsync((signal) => padronApi.commands(enElReloj.value?.deviceId ?? '', signal))

/** La última orden que se le mandó a ESTA persona, sea del estado que sea. */
const ultimaOrden = computed(() => {
  const ext = enElReloj.value?.externalUserId
  if (!ext) return null
  return (ordenes.data.value ?? []).find((o) => o.externalUserId === ext) ?? null
})

/**
 * Qué necesita el reloj hoy: `alta` si la persona está activa, `cierre` si no.
 * Un `retiro` aplicado también deja la puerta cerrada —ya no está en el equipo—
 * así que cuenta como cumplido.
 */
const loQueTocaEnElReloj = computed<'alta' | 'cierre'>(() =>
  person.value?.isActive ? 'alta' : 'cierre',
)

/**
 * EN QUÉ SE HA QUEDADO ATRÁS EL RELOJ.
 *
 * No basta con mirar si la persona está de alta o de baja: al equipo también le
 * viajan el nombre, la vigencia y el sexo. Corregir un apellido, capturar el
 * sexo o cambiarle la adscripción deja al reloj con un dato viejo, y hasta hoy
 * nadie avisaba: el aviso solo miraba el estado.
 *
 * Se compara contra LO QUE SE MANDÓ en la última orden —que la bitácora guarda
 * campo por campo—, no contra lo que el equipo tiene: preguntárselo a él pide
 * sus credenciales, y esto tiene que poder decirse nada más abrir la ficha.
 *
 * Devuelve los motivos en palabras, porque «hay que empujar» sin decir qué
 * cambió obliga a comparar dos pantallas para descubrirlo.
 */
const desfaseConElReloj = computed<string[]>(() => {
  const p = person.value
  const enviado = ultimaOrden.value?.enviado
  if (!p || !enviado) return []

  const motivos: string[] = []

  if (enPlano(enviado.name) !== enPlano(fullName.value)) {
    motivos.push(`el nombre (allá dice «${enviado.name}»)`)
  }

  if (enviado.enabled !== null && enviado.enabled !== p.isActive) {
    motivos.push(p.isActive ? 'está de baja en el reloj' : 'sigue activo en el reloj')
  }

  // El sexo solo se reclama cuando Astra lo tiene: si aquí está sin capturar,
  // el reloj no puede saberlo y no hay nada que corregir.
  if (p.sex !== null && enviado.sex !== p.sex) {
    motivos.push('el sexo')
  }

  /*
   * La vigencia se compara POR DÍA. La hora la pone el propio empujón —el
   * principio o el final de la jornada— y compararla entera sacaría a todo el
   * mundo por divergente sin que nadie hubiera cambiado nada.
   */
  const dia = (valor: string | null | undefined): string => (valor ?? '').slice(0, 10)

  /*
   * ══ CONTRA QUÉ SE COMPARA, Y POR QUÉ NO ES LA ADSCRIPCIÓN VIGENTE ══
   *
   * LA FECHA DE ALTA DEL RELOJ ES LA DE LA PRIMERA ADSCRIPCIÓN, Y NO SE MUEVE.
   * Lo que el equipo guarda ahí es DESDE CUÁNDO vale esa credencial, y eso es
   * desde que la persona entró — no desde su último cambio de puesto.
   *
   * Esto se comparaba contra `currentAssignment`, la VIGENTE. Así que cambiarle
   * la adscripción a alguien nacía una adscripción con la fecha de hoy, dejaba
   * de coincidir con lo que el reloj tiene —que es lo correcto— y la pantalla
   * pedía empujar el registro entero para arreglar algo que no estaba roto.
   * Cada cambio de puesto pedía un empujón que no hacía falta.
   *
   * El servidor ya lo hacía bien: su consulta manda `min(valid_from)`. Esta
   * comparación se había quedado atrás, y una regla escrita en dos sitios
   * termina así. Si algún día cambia allá, tiene que cambiar aquí.
   *
   * EL FIN SÍ SALE DE LA ÚLTIMA, también igual que el servidor: es la que se
   * cierra cuando alguien se va, y es todo el bloqueo que tiene el aparato.
   */
  const porFecha = [...p.assignments].sort((a, b) => a.validFrom.localeCompare(b.validFrom))
  const primera = porFecha[0]
  const ultima = porFecha[porFecha.length - 1]

  if (primera && dia(enviado.validFrom) !== dia(primera.validFrom)) {
    motivos.push('la fecha de alta')
  }
  if (p.isActive && ultima && dia(enviado.validTo) !== dia(ultima.validTo)) {
    motivos.push('la fecha de fin')
  }

  return motivos
})

const ordenAlDia = computed(() => {
  const o = ultimaOrden.value
  if (!o || o.status === 'cancelled' || o.status === 'failed') return false
  if (desfaseConElReloj.value.length > 0) return false
  if (o.intencion === 'retiro') return loQueTocaEnElReloj.value === 'cierre'
  return o.intencion === loQueTocaEnElReloj.value
})

/**
 * El aviso, con sus cuatro caras.
 *
 * `pendiente` — no se ha mandado nada, o lo último pedía lo contrario de lo que
 *   hace falta ahora. Es el caso de la baja recién dada.
 * `desfasado` — se mandó, se aplicó, y desde entonces cambió algo que al reloj
 *   le importa: el nombre, la vigencia, el sexo. Dice QUÉ cambió.
 * `enCola`    — ya se pidió y el agente aún no la ha aplicado. Se dice, para
 *   que nadie vuelva a mandarla creyendo que se perdió.
 * `falló`     — el reloj la rechazó. Esto sí hay que mirarlo.
 */
const avisoDelReloj = computed<'pendiente' | 'desfasado' | 'enCola' | 'falló' | null>(() => {
  if (!canPush.value || !enElReloj.value || !person.value) return null

  const o = ultimaOrden.value
  if (o && o.status === 'failed' && o.intencion === loQueTocaEnElReloj.value) return 'falló'

  // Una orden en cola YA lleva los datos de ahora: no hay nada que reclamar
  // aunque se acabe de editar el nombre.
  if (o && (o.status === 'pending' || o.status === 'sent')) return 'enCola'

  if (desfaseConElReloj.value.length > 0) return 'desfasado'
  if (ordenAlDia.value) return null

  // A quien está de baja se le avisa siempre; a quien está activo, solo recién
  // reactivado: un activo que entra es lo normal y un cartel fijo no dice nada.
  return !person.value.isActive || reciénCambiado.value ? 'pendiente' : null
})

/** Se acaba de reactivar en esta pantalla y aún no se ha ido al reloj. */
const reciénCambiado = ref(false)

/**
 * Baja y reactivación NO pasan por el confirm genérico: llevan detrás el paso
 * del reloj —credenciales del equipo y qué hacer con esa persona—, y eso es una
 * pantalla, no un «¿seguro?».
 */
function askToggleActive(): void {
  if (!person.value) return
  soloElReloj.value = false
  estadoOpen.value = true
}

function askRemoveException(exceptionId: string, name: string): void {
  confirming.value = {
    title: 'Cancelar justificación',
    message: `Se va a borrar «${name}». Úsalo solo si se capturó por error: si la persona sí faltó, la justificación es la constancia de por qué.`,
    confirmLabel: 'Cancelar justificación',
    action: async () => {
      await employeesApi.removeException(exceptionId)
      aviso.borrado('Justificación', name)
    },
  }
}

async function addEvent(): Promise<void> {
  if (savingEvent.value) return
  savingEvent.value = true
  actionError.value = null
  try {
    await employeesApi.addEvent(id.value, {
      eventType: eventType.value,
      effectiveDate: eventDate.value,
      notes: eventNotes.value,
    })
    eventNotes.value = ''
    aviso.creado('Movimiento', `${EMPLOYMENT_EVENT_LABEL[eventType.value]} · ${eventDate.value}`)
    await events.run()
  } catch (cause) {
    actionError.value = cause instanceof Error ? cause : new Error(String(cause))
  } finally {
    savingEvent.value = false
  }
}

async function addException(): Promise<void> {
  if (savingException.value) return
  savingException.value = true
  actionError.value = null
  try {
    const hecha = await employeesApi.addException({
      employeeId: id.value,
      exceptionTypeId: exceptionTypeId.value,
      startDate: exceptionFrom.value,
      endDate: exceptionTo.value,
      documentRef: exceptionDoc.value,
    })
    /*
     * Se dice A CUÁNTOS se avisó, y no un «se notificó a la dirección» fijo.
     * Cero es un resultado posible —esa razón social no tiene a nadie con rol
     * de dirección— y prometer un correo que no salió es peor que no prometer
     * nada: quien lo lea daría por enterado a alguien que nunca se enteró.
     */
    aviso.hecho(
      'Justificación registrada',
      hecha.avisados === 0
        ? 'No salió ningún correo: esta razón social no tiene a nadie con rol de dirección'
        : hecha.avisados === 1
          ? 'Se avisó por correo a la dirección de la razón social'
          : `Se avisó por correo a ${hecha.avisados} personas de la dirección`,
    )
    exceptionFrom.value = ''
    exceptionTo.value = ''
    exceptionDoc.value = ''
    await exceptions.run()
  } catch (cause) {
    actionError.value = cause instanceof Error ? cause : new Error(String(cause))
  } finally {
    savingException.value = false
  }
}

void shifts.run()
void installations.run()
void exceptionTypes.run()
void departments.run()
void positions.run()
watch(id, () => void Promise.all([reload(), attendance.run()]), {
  immediate: true,
})
</script>

<template>
  <div class="space-y-6">
    <div class="flex flex-wrap items-start gap-3">
      <UButton :to="{ name: 'employees' }" icon="i-lucide-arrow-left" square />

      <div class="min-w-0">
        <div class="flex flex-wrap items-center gap-2">
          <h1 class="text-highlighted text-xl font-semibold">{{ fullName || '…' }}</h1>
          <span class="text-dimmed font-mono text-sm">{{ person?.employeeCode }}</span>
          <UBadge v-if="person && !person.isActive" label="Dado de baja" color="neutral" />
        </div>
        <!--
          Puesto y departamento de HOY, junto al horario: son las tres cosas que
          se preguntan al abrir un expediente. Salen de la adscripción vigente,
          no del expediente, porque la gente cambia de las tres.
        -->
        <p v-if="person?.currentAssignment" class="text-muted mt-0.5 text-sm">
          {{ positionName(person.currentAssignment.positionId) }}
          <template v-if="person.currentAssignment.departmentName">
            · {{ person.currentAssignment.departmentName }}
          </template>
        </p>
        <p v-if="currentShift" class="text-muted mt-0.5 text-sm">
          {{ currentShift.summary.schedule }} ·
          <span v-if="currentShift.summary.graceInMinutes !== null">
            retardo pasados {{ currentShift.summary.graceInMinutes }} min
          </span>
        </p>
        <!-- Sin turno el motor no puede calcular nada: se dice, no se calla. -->
        <p v-else-if="employee.loaded.value" class="text-warning mt-0.5 text-sm">
          Sin turno asignado: no se le puede calcular asistencia.
        </p>
        <!--
          CURP Y NACIMIENTO AQUÍ, y no en una tarjeta propia.

          Ocupaban media pantalla —una tarjeta con título y dos renglones— para
          dos datos que nadie viene a consultar: se miran de reojo, para
          confirmar que es esa persona y no su tocayo. Junto al número de
          empleado es donde se buscan, porque es donde está el resto de «quién
          es». La tarjeta que los guardaba desapareció.
        -->
        <p v-if="person" class="text-dimmed mt-1 flex flex-wrap items-center gap-x-3 text-xs">
          <span v-if="person.curp" class="font-mono">{{ person.curp }}</span>
          <span v-if="person.birthDate">
            <UIcon name="i-lucide-cake" class="size-3 align-[-2px]" />
            {{ person.birthDate }}
          </span>
          <!--
            Los dos de WhatsApp aparecen solo si esa función está encendida: un
            dato que hoy no se puede capturar en ninguna pantalla solo puede
            decir «—», y un «—» permanente no informa, preocupa.
          -->
          <template v-if="WHATSAPP_ACTIVO">
            <span v-if="person.whatsappNumber" class="font-mono">
              <UIcon name="i-lucide-message-circle" class="size-3 align-[-2px]" />
              {{ person.whatsappNumber }}
              <template v-if="!person.whatsappOptIn">· sin consentir avisos</template>
            </span>
          </template>
        </p>
      </div>

      <div v-if="canWrite && person" class="ml-auto flex gap-2">
        <UButton icon="i-lucide-pencil" label="Editar" @click="editOpen = true" />
        <UButton
          :icon="person.isActive ? 'i-lucide-user-minus' : 'i-lucide-user-check'"
          :label="person.isActive ? 'Dar de baja' : 'Reactivar'"
          @click="askToggleActive"
        />
        <!--
          Borrar va APARTE de la baja y solo para quien administra la razón
          social: dar de baja es trabajo de RRHH, destruir la evidencia de una
          nómina es otra cosa. Y solo se ofrece sobre alguien YA dado de baja:
          borrar a alguien en activo es casi siempre un error de la persona que
          pulsa, no una decisión.
        -->
        <UButton
          v-if="canPurge && !person.isActive"
          icon="i-lucide-trash-2"
          label="Borrar"
          color="error"
          @click="borrarOpen = true"
        />
      </div>
    </div>

    <ApiErrorAlert :error="employee.error.value ?? actionError" />

    <!--
      El reloj es otro aparato: la baja en Astra no le llega sola. El aviso mira
      la BITÁCORA de órdenes, así que sabe distinguir «no se ha mandado» de «ya
      se mandó y el reloj lo aplicó», y deja de insistir cuando está hecho.
    -->
    <UAlert
      v-if="avisoDelReloj && enElReloj && person"
      :icon="
        avisoDelReloj === 'enCola'
          ? 'i-lucide-hourglass'
          : avisoDelReloj === 'falló'
            ? 'i-lucide-circle-x'
            : avisoDelReloj === 'desfasado'
              ? 'i-lucide-refresh-cw'
              : 'i-lucide-alarm-clock'
      "
      :color="avisoDelReloj === 'enCola' ? 'info' : avisoDelReloj === 'falló' ? 'error' : 'warning'"
      :title="
        avisoDelReloj === 'enCola'
          ? 'La orden está en cola'
          : avisoDelReloj === 'falló'
            ? 'El reloj rechazó la orden'
            : avisoDelReloj === 'desfasado'
              ? 'El reloj se quedó con datos viejos'
              : person.isActive
                ? 'Falta devolverle el acceso en el reloj'
                : 'Falta cerrarle el acceso en el reloj'
      "
      :description="
        avisoDelReloj === 'enCola'
          ? `Ya se pidió. El agente la aplicará en su siguiente ciclo; si el reloj está apagado, espera. No hace falta volver a mandarla.`
          : avisoDelReloj === 'falló'
            ? `${ultimaOrden?.lastError ?? 'Sin detalle del equipo.'} Vuelve a mandarla; si sigue fallando, míralo en el padrón.`
            : avisoDelReloj === 'desfasado'
              ? `Cambió ${desfaseConElReloj.join(', ')} desde el último empujón. En ${enElReloj.deviceLabel} sigue lo de antes hasta que se le mande la orden.`
              : `Está enrolado en ${enElReloj.deviceLabel} con el número ${enElReloj.externalUserId}. El equipo no se entera de este cambio hasta que se le mande la orden.`
      "
    >
      <template v-if="avisoDelReloj !== 'enCola'" #actions>
        <UButton
          label="Hacerlo ahora"
          icon="i-lucide-arrow-right"
          @click="
            () => {
              soloElReloj = true
              estadoOpen = true
            }
          "
        />
        <!--
          El padrón completo sigue a un clic: es donde se ve TODO el equipo, y a
          veces lo que se quiere es eso y no una sola persona.
        -->
        <UButton
          :to="{
            name: 'padron',
            params: { deviceId: enElReloj.deviceId },
            query: { destacar: enElReloj.externalUserId },
          }"
          label="Ver el padrón completo"
        />
        <!--
          «Ahora no» calla el aviso de un activo recién reactivado. Al que está
          de baja no se le calla: sigue enrolado y eso no deja de ser cierto
          porque alguien cierre un cartel.
        -->
        <!--
          «Ahora no» solo calla el aviso de un activo recién reactivado. Ni al
          que está de baja ni a un desfase real: eso no deja de ser cierto
          porque alguien cierre un cartel.
        -->
        <UButton
          v-if="person.isActive && avisoDelReloj === 'pendiente'"
          label="Ahora no"
          @click="reciénCambiado = false"
        />
      </template>
    </UAlert>

    <EmployeeStatusModal
      v-if="estadoOpen && person"
      v-model:open="estadoOpen"
      v-model:solo-el-reloj="soloElReloj"
      :employee-id="person.id"
      :full-name="fullName"
      :is-active="person.isActive"
      :enrollments="person.enrollments ?? []"
      @changed="
        () => {
          reciénCambiado = true
          void reload()
        }
      "
      @pushed="void ordenes.run()"
    />

    <EnrolarEnRelojModal
      v-if="person"
      v-model:open="enrolarOpen"
      :persona="person"
      @enrolado="void reload()"
    />

    <DeleteEmployeeModal
      v-if="borrarOpen && person"
      v-model:open="borrarOpen"
      :employee-id="person.id"
      :employee-code="person.employeeCode"
      :full-name="fullName"
      @deleted="router.push({ name: 'employees' })"
    />

    <!--
      LAS ADSCRIPCIONES, A TODO LO ANCHO Y COMO LÍNEA DE TIEMPO.

      Ocupaban media fila junto a una tarjeta de dos datos, y es al revés: esto
      es la historia de esa persona en la empresa —por dónde ha pasado y desde
      cuándo— y es lo primero que se mira después de saber quién es. Va sola, con
      todo el ancho, y en orden.
    -->
    <UCard v-if="person">
      <template #header>
        <div class="flex flex-wrap items-center gap-2">
          <h2 class="font-medium">Adscripciones · {{ person.assignments.length }}</h2>
          <!--
            DÓNDE TRABAJA, en una palabra y con la explicación escondida.

            El distintivo es un botón para que también se llegue con el teclado:
            un globo que solo abre al pasar el ratón no existe para quien no usa
            ratón.
          -->
          <UTooltip :delay-duration="150">
            <UBadge
              as="button"
              type="button"
              :label="esRemota ? 'A distancia' : 'En sitio'"
              :color="esRemota ? 'success' : 'neutral'"
              size="sm"
              class="cursor-help"
            />
            <template #content>
              <div class="max-w-xs space-y-1.5 text-xs">
                <p v-if="esRemota">
                  Checa desde su teléfono, desde casa o donde esté. Abajo se dan de alta los
                  aparatos con los que puede hacerlo.
                </p>
                <p v-else>
                  Checa en el reloj de su instalación. Para que pueda hacerlo desde su teléfono
                  —desde casa o donde esté— cámbiale la adscripción a «A distancia» con el botón
                  <strong>Cambiar</strong>.
                </p>
                <p class="text-muted">
                  Checar a distancia no usa geocerca: quien trabaja desde casa no está dentro de
                  ninguna. Lo que respalda cada checada es el acuse que le llega a su correo.
                </p>
              </div>
            </template>
          </UTooltip>
          <UButton
            v-if="canWrite"
            icon="i-lucide-replace"
            label="Cambiar"
            size="xs"
            class="ml-auto"
            @click="assignOpen = true"
          />
        </div>
      </template>

      <p v-if="person.assignments.length === 0" class="text-dimmed text-sm">
        Sin adscripciones. Hay que asignarle base y turno.
      </p>

      <!--
        `defaultValue` marca la vigente: lo anterior queda como recorrido y ella
        encendida. Es lo que hace que la línea se lea sin tener que comparar
        fechas.
      -->
      <UTimeline
        v-else
        :items="lineaDeAdscripciones"
        :default-value="adscripcionVigente"
        size="sm"
        color="primary"
      >
        <template #title="{ item }">
          <div class="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <span class="font-medium">
              {{ installationName(item.adscripcion.installationId) }}
            </span>
            <span class="text-muted text-sm">
              {{ positionName(item.adscripcion.positionId) }}
            </span>
            <!--
              El departamento sale del servidor ya resuelto, no del catálogo
              cargado en pantalla: una adscripción vieja puede apuntar a uno que
              después se desactivó, y la historia tiene que seguir diciendo
              dónde estaba esa persona.
            -->
            <span v-if="item.adscripcion.departmentName" class="text-muted text-sm">
              · {{ item.adscripcion.departmentName }}
            </span>
            <UBadge v-if="item.vigente" label="Vigente" color="primary" size="sm" />
          </div>
        </template>
        <template #description="{ item }">
          <span class="text-dimmed text-xs">
            {{
              ASSIGNMENT_REASON_LABEL[item.adscripcion.reason as AssignmentReason] ??
              item.adscripcion.reason
            }}
            ·
            {{ item.adscripcion.validFrom }} →
            {{ item.adscripcion.validTo ?? 'hoy' }}
          </span>
        </template>
      </UTimeline>
    </UCard>

    <!--
      CÓMO CHECA ESTA PERSONA, todo junto y en su propia fila.

      Estaban repartidas entre las demás tarjetas, y son las tres caras de UNA
      sola pregunta —¿con qué registra su jornada?—: el reloj de la nave, la
      credencial de la puerta y, si trabaja a distancia, su equipo. Separadas,
      había que recorrer el expediente entero para saber si alguien puede fichar.
    -->
    <div v-if="person" class="grid gap-6 lg:grid-cols-2">
      <!--
        Justo DEBAJO de las adscripciones, y no en otra pestaña: lo que habilita
        checar desde el teléfono es la adscripción, así que el estado y su causa
        se leen seguidos.

        SOLO SI CHECA A DISTANCIA. Para quien checa en el reloj esta tarjeta no
        tenía nada que ofrecer: era un párrafo explicando por qué está vacía. Eso
        vive ahora en el globo del distintivo de arriba.
      -->
      <TelefonosRemotos v-if="esRemota" :persona="person" :puede-revocar="canWrite" />

      <!--
        LA CREDENCIAL DE LA PUERTA, para todo el mundo y no solo para quien
        checa a distancia: quien trabaja en la nave es justamente quien pasa por
        el cartel de la contingencia, que es lo que esta credencial protege.
      -->
      <CredencialDeChecado
        v-if="puedeVerAcceso"
        :persona="person"
        :puede-dar-acceso="puedeDarAcceso"
      />

      <!--
        SIN RELOJ. Solo cuando de verdad no tiene número en ninguno: quien ya
        está enrolado tiene arriba su propio aviso, con la bitácora de órdenes.
        A quien trabaja a distancia se le ofrece igual —puede pisar la nave
        cualquier día, y entonces la puerta es la puerta—, pero sin urgencia.
      -->
      <UCard v-if="canPush && !enElReloj">
        <template #header>
          <div class="flex flex-wrap items-center gap-2">
            <h2 class="font-medium">El reloj</h2>
            <UBadge label="Sin número" color="warning" size="sm" />
          </div>
        </template>
        <div class="space-y-3">
          <p class="text-muted text-sm">
            No está dado de alta en ningún reloj, así que hoy no puede pasar por la puerta ni checar
            en la nave.
            <template v-if="esRemota">
              Trabaja a distancia, así que puede que no haga falta — pero el día que pise la nave,
              sí.
            </template>
          </p>
          <UButton
            label="Darlo de alta en el reloj"
            icon="i-lucide-id-card"
            @click="enrolarOpen = true"
          />
        </div>
      </UCard>
    </div>

    <!--
      Y LO QUE ES SU EXPEDIENTE: lo que ha trabajado y lo que ha pedido. Dos
      tarjetas que se leen juntas —una dice cuánto lleva y la otra cuánto se ha
      ausentado— y por eso comparten fila.
    -->
    <div v-if="person" class="grid gap-6 lg:grid-cols-2">
      <!-- Vida laboral -->
      <UCard>
        <template #header>
          <!--
            `flex-nowrap` y el título con `min-w-0`: en dos columnas la cabecera
            no da para título, resumen y pestañas en un renglón, y con `wrap` las
            que se caían al segundo eran las pestañas — que es justo lo que no
            puede pasar, porque su sitio es la esquina. Ahora lo que se parte es
            el resumen, que se lee igual de bien en dos líneas.
          -->
          <div class="flex flex-nowrap items-start justify-between gap-x-4">
            <div class="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1">
              <h2 class="font-medium">Vida laboral</h2>
              <!--
              La antigüedad es lo que se pregunta de esta tarjeta —para
              vacaciones, para finiquito, para una prima— y hasta ahora había
              que restarla mentalmente contra la fecha del alta.
            -->
              <span v-if="vidaLaboral.antiguedadEnDias !== null" class="text-muted text-sm">
                {{ antiguedadEnPalabras(vidaLaboral.antiguedadEnDias) }} de antigüedad
                <span class="text-dimmed text-xs">
                  · desde el {{ diaCorto(vidaLaboral.altaVigente!) }}
                </span>
              </span>
              <span v-else-if="vidaLaboral.bajaVigente" class="text-error text-sm">
                De baja desde el {{ diaCorto(vidaLaboral.bajaVigente) }}
              </span>
            </div>

            <!--
              Solo la LISTA de pestañas: el panel se pinta abajo. El `-my-1`
              recupera el alto que el rótulo añade a la cabecera, para que la
              tarjeta no crezca por llevar el mando aquí.
            -->
            <UTabs
              v-model="pestañaDeVidaLaboral"
              :items="pestañasDeVidaLaboral"
              :content="false"
              size="sm"
              :ui="{ list: 'w-auto shrink-0 flex-nowrap border-b-0 -my-1' }"
              class="w-auto shrink-0"
            />
          </div>
        </template>

        <div v-show="pestañaDeVidaLaboral === 'historial'">
          <!--
              Una línea de tiempo, no una lista: los movimientos de una persona
              son una secuencia, y el hilo con sus puntos deja ver de un vistazo
              cuántas veces entró y salió. Se pinta de lo más reciente a lo más
              antiguo, que es como llega y como se lee.
            -->
          <ol v-if="(events.data.value ?? []).length > 0" class="space-y-0">
            <li
              v-for="(e, i) in events.data.value ?? []"
              :key="e.id"
              class="relative flex gap-3 pb-4 pl-1"
            >
              <!-- El hilo no se dibuja bajo el último punto: quedaría colgando. -->
              <span
                v-if="i < (events.data.value ?? []).length - 1"
                class="bg-accented absolute top-3 bottom-0 left-[7px] w-px"
                aria-hidden="true"
              />
              <span
                class="mt-1.5 size-[15px] shrink-0 ring-4"
                :class="[COLOR_DE_EVENTO[e.eventType] ?? 'bg-muted', 'ring-default']"
                aria-hidden="true"
              />

              <div class="min-w-0 flex-1">
                <div class="flex flex-wrap items-baseline gap-x-2">
                  <span class="text-highlighted text-sm font-medium">
                    {{ EMPLOYMENT_EVENT_LABEL[e.eventType as EmploymentEventType] ?? e.eventType }}
                  </span>
                  <span class="text-muted text-xs capitalize">
                    {{ diaCorto(e.effectiveDate) }} de {{ e.effectiveDate.slice(0, 4) }}
                  </span>
                </div>
                <p v-if="e.notes" class="text-muted mt-0.5 text-sm">{{ e.notes }}</p>
                <!--
                Lo que no cuadra se dice EN la fila que lo provoca, no en un
                aviso suelto arriba: así se sabe cuál de los cinco movimientos
                hay que revisar.
              -->
                <p
                  v-if="avisosPorEvento.get(e.id)"
                  class="text-warning mt-1 flex items-start gap-1 text-xs"
                >
                  <UIcon name="i-lucide-triangle-alert" class="mt-0.5 size-3.5 shrink-0" />
                  {{ avisosPorEvento.get(e.id) }}
                </p>
              </div>
            </li>
          </ol>
          <p v-else class="text-dimmed text-sm">
            Sin movimientos registrados. Ni siquiera el alta: conviene capturarla, porque de ella
            sale la antigüedad.
          </p>
        </div>

        <!--
            Los campos con su rótulo y en rejilla, no en una hilera que se parte
            por donde alcance: con tres controles seguidos, el ancho de la
            pantalla decidía cuáles quedaban juntos y cuál caía solo con el
            botón al lado. Y una fecha sin rótulo encima solo dice «yyyy-mm-dd».
          -->
        <div v-show="pestañaDeVidaLaboral === 'registrar'">
          <form class="space-y-4" @submit.prevent="addEvent">
            <div class="grid gap-3 sm:grid-cols-2">
              <UFormField label="Movimiento">
                <USelectMenu
                  v-model="eventType"
                  :items="eventItems"
                  value-key="value"
                  class="w-full"
                />
              </UFormField>
              <UFormField label="Fecha en que surte efecto">
                <UInput v-model="eventDate" type="date" class="w-full" />
              </UFormField>
              <UFormField label="Nota" hint="Opcional" class="sm:col-span-2">
                <UInput v-model="eventNotes" placeholder="Por qué, si hace falta" class="w-full" />
              </UFormField>
            </div>

            <div class="flex justify-end">
              <UButton
                type="submit"
                icon="i-lucide-plus"
                label="Registrar movimiento"
                :loading="savingEvent"
              />
            </div>
          </form>
        </div>
      </UCard>

      <!-- Vacaciones y permisos -->
      <UCard>
        <template #header>
          <div class="flex flex-nowrap items-start justify-between gap-x-4">
            <div class="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1">
              <h2 class="font-medium">Vacaciones y permisos</h2>
              <!--
                Cuánto lleva tomado este año, por tipo. Es lo que se viene a
                buscar —«¿cuántos días de vacaciones le quedan?»— y antes había
                que sumarlo a mano leyendo los rangos uno por uno.
              -->
              <span v-if="saldoDelAño.length > 0" class="text-muted text-sm">
                <template v-for="(t, i) in saldoDelAño" :key="t.nombre">
                  <span v-if="i > 0" class="text-dimmed"> · </span>
                  {{ t.dias }} {{ t.dias === 1 ? 'día' : 'días' }} de
                  {{ t.nombre.toLowerCase() }}
                </template>
                <span class="text-dimmed text-xs"> en {{ añoEnCurso }}</span>
              </span>
            </div>

            <UTabs
              v-model="pestañaDeIncidencias"
              :items="pestañasDeIncidencias"
              :content="false"
              size="sm"
              :ui="{ list: 'w-auto shrink-0 flex-nowrap border-b-0 -my-1' }"
              class="w-auto shrink-0"
            />
          </div>
        </template>

        <div v-show="pestañaDeIncidencias === 'historial'">
          <ul v-if="incidencias.length > 0" class="space-y-2">
            <!--
                Todas las filas con el MISMO borde. La que está en curso se
                distinguía además con un borde azul, y eso la convertía en la
                única fila perfilada de la pantalla: un recuadro de color que
                pesaba más que lo que decía. Ya lleva su etiqueta «En curso», que
                es donde se mira.
              -->
            <li
              v-for="x in incidencias"
              :key="x.id"
              class="border-default bg-(--astra-superficie) border px-3 py-2"
            >
              <div class="flex flex-wrap items-center gap-2">
                <UBadge
                  :label="ESTADO_DE_INCIDENCIA[x.estado]?.label ?? x.estado"
                  :color="ESTADO_DE_INCIDENCIA[x.estado]?.color ?? 'neutral'"
                  size="sm"
                />
                <span class="text-highlighted text-sm font-medium">{{ x.exceptionName }}</span>
                <UBadge
                  :label="x.isPaid ? 'Con goce' : 'Sin goce'"
                  :color="x.isPaid ? 'success' : 'neutral'"
                  size="sm"
                />

                <UButton
                  v-if="canWrite"
                  icon="i-lucide-x"
                  size="xs"
                  class="ml-auto"
                  :aria-label="`Cancelar ${x.exceptionName}`"
                  @click="askRemoveException(x.id, x.exceptionName)"
                />
              </div>

              <div class="text-muted mt-1 flex flex-wrap items-center gap-x-3 text-xs">
                <!--
                Un permiso de unas horas NO es un día: se dice con su horario.
                El motor lo trata así —descuenta solo esas horas de la jornada
                esperada— y la pantalla tiene que contar lo mismo.
              -->
                <span v-if="x.startTime && x.endTime" class="capitalize">
                  {{ diaCorto(x.startDate) }} · {{ horaCorta(x.startTime) }} a
                  {{ horaCorta(x.endTime) }}
                </span>
                <template v-else>
                  <span class="capitalize">
                    {{ diaCorto(x.startDate) }}
                    <template v-if="x.endDate !== x.startDate">
                      → {{ diaCorto(x.endDate) }}
                    </template>
                  </span>
                  <span class="text-dimmed">
                    {{ duracionEnDias(x.startDate, x.endDate) }}
                    {{ duracionEnDias(x.startDate, x.endDate) === 1 ? 'día' : 'días' }}
                  </span>
                </template>

                <span v-if="x.documentRef" class="text-dimmed">
                  <UIcon name="i-lucide-paperclip" class="inline size-3" />
                  {{ x.documentRef }}
                </span>
              </div>
            </li>
          </ul>
          <p v-else class="text-dimmed text-sm">Sin justificaciones registradas.</p>
        </div>

        <div v-show="pestañaDeIncidencias === 'registrar'">
          <form class="space-y-4" @submit.prevent="addException">
            <div class="grid gap-3 sm:grid-cols-2">
              <!--
                  El tipo ocupa el ancho entero y va primero porque MANDA sobre
                  lo demás: de él salen el goce, si cuenta como jornada y si
                  hace falta folio — y ese cuarto campo aparece solo si lo pide.
                -->
              <UFormField label="Tipo" class="sm:col-span-2">
                <USelectMenu
                  v-model="exceptionTypeId"
                  :items="typeItems"
                  value-key="value"
                  placeholder="Vacaciones, permiso, incapacidad…"
                  searchable
                  class="w-full"
                />
              </UFormField>
              <UFormField label="Desde">
                <UInput v-model="exceptionFrom" type="date" class="w-full" />
              </UFormField>
              <UFormField label="Hasta" hint="Incluido">
                <UInput v-model="exceptionTo" type="date" class="w-full" />
              </UFormField>
              <UFormField
                v-if="chosenType?.requiresDocument"
                label="Folio del justificante"
                class="sm:col-span-2"
              >
                <UInput
                  v-model="exceptionDoc"
                  placeholder="El folio del documento"
                  class="w-full"
                />
              </UFormField>
            </div>

            <!-- Pagada y "cuenta como trabajada" son cosas distintas. -->
            <p v-if="chosenType" class="text-muted text-xs">
              {{ chosenType.isPaid ? 'Se paga' : 'Sin goce de sueldo' }} ·
              {{
                chosenType.countsAsWorked
                  ? 'cuenta como jornada trabajada'
                  : 'no cuenta como jornada'
              }}
              <template v-if="chosenType.requiresDocument"> · exige justificante</template>
            </p>

            <!--
                El aviso a la izquierda y el botón a la derecha, en la misma
                línea: lo que va a pasar al pulsar se lee justo antes de pulsar.
                No hay aprobación en el sistema —nunca la hubo, y el motor aplica
                la justificación desde que se guarda—, así que lo único que puede
                esperar quien la captura es que la dirección se entere.
              -->
            <div class="border-default flex flex-wrap items-center justify-end gap-3 border-t pt-3">
              <p class="text-dimmed min-w-48 flex-1 text-xs">
                Se aplica en cuanto se guarda; no hay nada que aprobar. Al registrarla se avisa por
                correo a la dirección de esta razón social.
              </p>
              <UButton
                type="submit"
                icon="i-lucide-plus"
                label="Registrar justificación"
                :loading="savingException"
                :disabled="exceptionTypeId === '' || exceptionFrom === '' || exceptionTo === ''"
              />
            </div>
          </form>
        </div>
      </UCard>
    </div>

    <!-- Asistencia -->
    <UCard v-if="person">
      <template #header>
        <div class="flex flex-wrap items-center gap-2">
          <h2 class="font-medium">Asistencia</h2>
          <!--
            EL MES SOBRE EL QUE UNO SE PARA. Las flechas son la navegación:
            antes el expediente solo alcanzaba el mes en curso, porque los cinco
            periodos se contaban hacia atrás desde hoy. La de avanzar se apaga
            en el mes actual —el futuro no tiene checadas— en vez de esconderse,
            para que se vea que ahí termina el recorrido.

            Mismo control, mismas palabras y mismo ancho que en Asistencia: es
            la misma pregunta hecha en dos pantallas, y quien la aprende en una
            no debería tener que volver a aprenderla.
          -->
          <div class="border-default flex items-center gap-0.5 border">
            <UButton
              icon="i-lucide-chevron-left"
              square
              size="sm"
              aria-label="Mes anterior"
              @click="irAlMes(moverMes(mes, -1))"
            />
            <span class="text-highlighted w-36 text-center text-sm font-medium capitalize">
              {{ mesEnPalabras(mes) }}
            </span>
            <UButton
              icon="i-lucide-chevron-right"
              square
              size="sm"
              aria-label="Mes siguiente"
              :disabled="esMesActual"
              @click="irAlMes(moverMes(mes, 1))"
            />
          </div>

          <USelectMenu v-model="periodo" :items="periodos" value-key="value" class="w-48" />

          <!--
            Los dos campos solo cuando hacen falta. Tenerlos siempre a la vista
            haría creer que mandan ellos, y casi nunca mandan: el corte normal
            es un mes o una quincena.
          -->
          <template v-if="periodo === 'libre'">
            <UInput v-model="libreDesde" type="date" :max="todayLocal()" class="w-36" />
            <UInput v-model="libreHasta" type="date" :max="todayLocal()" class="w-36" />
          </template>

          <span v-if="attendance.data.value" class="text-dimmed text-xs">
            {{ diaCorto(attendance.data.value.from) }} →
            {{ diaCorto(attendance.data.value.to) }}
          </span>
          <!--
            SE LLEVA EL PERIODO. Sin las fechas, el enlace abría Marcajes en su
            propio rango y había que volver a acotarlo a mano para mirar el mes
            que se estaba mirando aquí. La tabla de arriba dice «5 marcajes» de
            un día; esto es donde se ven los cinco, uno por uno, con su hora, su
            método de verificación y su equipo.
          -->
          <UButton
            :to="{
              name: 'punches',
              query: { employeeId: person.id, from: rango.from, to: rango.to },
            }"
            label="Ver los marcajes"
            size="xs"
            class="ml-auto"
          />
          <!--
            El expediente en papel: mismas cifras que esta pantalla, con sus
            gráficas, sus incidencias y renglón de firma. Se exporta el PERIODO
            que está elegido arriba.
          -->
          <ReportExportMenu
            :path="`/reports/employees/${person.id}`"
            :query="{ from: rango.from, to: rango.to, periodo: etiquetaDelPeriodo }"
            label="Expediente"
          />
        </div>
      </template>

      <ApiErrorAlert :error="attendance.error.value" />

      <!--
        Los porcentajes primero: es lo que se compara entre meses y entre
        personas. Debajo va cada cifra con su denominador a la vista — un «10 %»
        sin saber sobre cuántos días es un número que no se puede discutir.
      -->
      <dl v-if="totales" class="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div class="border-default bg-(--astra-superficie) border p-4">
          <dt class="text-dimmed text-xs">Asistencia</dt>
          <dd class="mt-1 text-2xl font-medium" :class="tono(totales.attendanceRate)">
            {{ pct(totales.attendanceRate) }}
          </dd>
          <dd class="text-dimmed text-xs">
            se presentó {{ totales.attendedDays }} de {{ totales.workDays }} días laborables
          </dd>
        </div>
        <div class="border-default bg-(--astra-superficie) border p-4">
          <dt class="text-dimmed text-xs">Puntualidad</dt>
          <dd class="mt-1 text-2xl font-medium" :class="tono(totales.punctualityRate)">
            {{ pct(totales.punctualityRate) }}
          </dd>
          <dd class="text-dimmed text-xs">
            {{ totales.onTimeDays }} a tiempo de {{ totales.measurableDays }} medibles ·
            {{ totales.lateDays }} con retardo
          </dd>
        </div>
        <div class="border-default bg-(--astra-superficie) border p-4">
          <dt class="text-dimmed text-xs">Horas cumplidas</dt>
          <dd class="mt-1 text-2xl font-medium" :class="tono(totales.hoursRate)">
            {{ pct(totales.hoursRate) }}
          </dd>
          <dd class="text-dimmed text-xs">
            {{ hhmm(totales.workedMinutes) }} de {{ hhmm(totales.scheduledMinutes) }}
          </dd>
        </div>
      </dl>

      <div v-if="jornadas.length" class="border-default mb-4 border-b pb-4">
        <EmployeeDayTimeline
          :days="[...jornadas].reverse()"
          :corregible="puedeCorregir"
          @corregir="(d) => (corrigiendo = d)"
        />
      </div>

      <CorregirDiaModal
        v-if="corrigiendo"
        :open="true"
        :employee-id="id"
        :employee-name="fullName"
        :dia="corrigiendo"
        @update:open="
          (value: boolean) => {
            if (!value) corrigiendo = null
          }
        "
        @saved="attendance.run()"
      />

      <!--
        El resumen antes que el detalle: la pregunta que trae a alguien aquí es
        «¿cuánto trabajó y cuántas veces llegó tarde?», no el día a día.
      -->
      <dl
        v-if="totales"
        class="border-default mb-4 grid grid-cols-2 gap-x-4 gap-y-1 border-b pb-4 text-sm sm:grid-cols-4"
      >
        <div>
          <dt class="text-dimmed text-xs">Trabajado</dt>
          <dd class="text-highlighted font-medium">
            {{ hhmm(totales.workedMinutes) }}
            <span class="text-dimmed font-normal"> de {{ hhmm(totales.scheduledMinutes) }} </span>
          </dd>
        </div>
        <div>
          <dt class="text-dimmed text-xs">Días con retardo</dt>
          <dd :class="totales.lateDays ? 'text-warning font-medium' : ''">
            {{ totales.lateDays }}
            <span v-if="totales.lateMinutes" class="text-dimmed text-xs">
              · {{ hhmm(totales.lateMinutes) }} en total
            </span>
          </dd>
        </div>
        <div>
          <dt class="text-dimmed text-xs">Faltas</dt>
          <dd :class="totales.absentDays ? 'text-error font-medium' : ''">
            {{ totales.absentDays }}
          </dd>
        </div>
        <!--
          El extra se parte en dos porque son cosas distintas: lo que ya está
          autorizado se paga, y lo que no, no. Sumarlos convertiría «me quedé un
          rato» en una obligación que nadie acordó.
        -->
        <div>
          <dt class="text-dimmed text-xs">Tiempo extra</dt>
          <dd>
            {{ hhmm(totales.overtimeMinutes) }}
            <!--
              El total no distingue por sí solo entre lo pendiente y lo ya
              rechazado, así que se cuenta a partir de los días: son dos cifras
              distintas y una de ellas es trabajo que RRHH todavía debe mirar.
            -->
            <span v-if="extraPendiente" class="text-warning text-xs">
              · {{ hhmm(extraPendiente) }} sin autorizar
            </span>
            <span v-if="extraRechazado" class="text-dimmed block text-xs">
              {{ hhmm(extraRechazado) }} no autorizadas por RRHH
            </span>
            <!--
              Lo trabajado fuera de la sede va incluido en el número grande,
              pero se dice: son horas sin checada que las respalde, y quien las
              revisa tiene que poder distinguirlas de las que midió el reloj.
            -->
            <span v-if="totales.remoteMinutes" class="text-info block text-xs">
              {{ hhmm(totales.remoteMinutes) }} fuera de sede
            </span>
          </dd>
        </div>
      </dl>

      <UTable
        :data="jornadas"
        :columns="[
          { accessorKey: 'workDate', header: 'Día' },
          { accessorKey: 'status', header: 'Estado' },
          { id: 'esperado', header: 'Horario' },
          { id: 'jornada', header: 'Primera / última' },
          { id: 'trabajado', header: 'Trabajado' },
          { accessorKey: 'lateMinutes', header: 'Retardo' },
          { id: 'extra', header: 'Extra' },
        ]"
        :loading="attendance.pending.value"
        empty="No hay días en este periodo."
      >
        <template #workDate-cell="{ row }">
          <span class="capitalize">{{ diaCorto(row.original.workDate) }}</span>
        </template>

        <template #status-cell="{ row }">
          <!--
            Con NOMBRE cuando lo hay: «16 de septiembre» dice más que «Festivo»,
            y «Permiso por defunción» más que «Permiso». La etiqueta genérica
            queda para los días que no tienen nombre propio.
          -->
          <UBadge
            :label="
              row.original.exceptionName ??
              row.original.holidayName ??
              attendanceStatusLook(row.original.status).label
            "
            :color="attendanceStatusLook(row.original.status).color"
          />
        </template>

        <template #esperado-cell="{ row }">
          <span v-if="row.original.expectedStart" class="text-muted text-xs">
            {{ clock(row.original.expectedStart) }} → {{ clock(row.original.expectedEnd) }}
          </span>
          <span v-else class="text-dimmed text-xs">sin horario</span>
        </template>

        <!--
          «Primera» y «última», NO «entrada» y «salida»: el equipo manda el tipo
          como UNKNOWN y decidir cuál es cuál sería inventar (regla 1).
        -->
        <template #jornada-cell="{ row }">
          <span v-if="row.original.firstPunch">
            {{ clock(row.original.firstPunch) }} → {{ clock(row.original.lastPunch) }}
            <span v-if="row.original.punchCount > 2" class="text-dimmed text-xs">
              ({{ row.original.punchCount }} marcajes)
            </span>
          </span>
          <span v-else class="text-dimmed">—</span>
        </template>

        <template #trabajado-cell="{ row }">
          {{ hhmm(row.original.workedMinutes) }}
          <span v-if="row.original.breakMinutes" class="text-dimmed text-xs">
            · {{ row.original.breakMinutes }} min sin contar
          </span>
          <span v-if="row.original.remoteMinutes" class="text-info block text-xs">
            + {{ hhmm(row.original.remoteMinutes) }} fuera de sede
          </span>
        </template>

        <template #lateMinutes-cell="{ row }">
          <span v-if="row.original.lateMinutes > 0" class="text-warning">
            {{ row.original.lateMinutes }} min
          </span>
          <span v-else-if="row.original.earlyArrivalMinutes > 0" class="text-dimmed text-xs">
            {{ row.original.earlyArrivalMinutes }} min antes
          </span>
          <span v-else class="text-dimmed">—</span>
        </template>

        <template #extra-cell="{ row }">
          <span v-if="row.original.overtimeMinutes > 0" class="text-success">
            {{ hhmm(row.original.overtimeMinutes) }}
            <span v-if="row.original.remoteMinutes" class="text-info block text-xs">
              de casa: {{ hhmm(row.original.remoteMinutes) }}
            </span>
          </span>
          <!--
            «Sin autorizar» y «no autorizado» NO son lo mismo, y llamarlos igual
            dejaba sin saber qué falta por revisar: el primero es que nadie lo
            ha mirado; el segundo, que RRHH lo miró y dijo que no. El rechazado
            va en gris —ya está resuelto, no reclama nada— y el pendiente en
            ámbar, que es lo que sigue esperando una firma.
          -->
          <span
            v-else-if="row.original.unapprovedOvertimeMinutes > 0"
            :class="row.original.overtimeRejected ? 'text-dimmed' : 'text-warning'"
            :title="
              row.original.overtimeRejected
                ? (row.original.overtimeRejectionNote ??
                  'Recursos Humanos lo evaluó y no lo autorizó.')
                : 'Trabajado de más que todavía no ha evaluado nadie.'
            "
          >
            {{ hhmm(row.original.unapprovedOvertimeMinutes) }}
            {{ row.original.overtimeRejected ? 'no autorizadas' : 'sin autorizar' }}
          </span>
          <span v-else class="text-dimmed">—</span>
        </template>

        <!-- Lo que hay que mirar a mano, debajo de su día y no en un montón. -->
        <template #expanded="{ row }">
          <!--
            El motivo del rechazo va PRIMERO y en su color: es la respuesta a
            «por qué no me pagaron esas horas», que es la pregunta con la que
            alguien abre esta fila.
          -->
          <p v-if="row.original.overtimeRejectionNote" class="text-warning text-xs">
            No autorizado: {{ row.original.overtimeRejectionNote }}
          </p>
          <p v-for="a in row.original.anomalies" :key="a" class="text-muted text-xs">
            {{ a }}
          </p>
        </template>
      </UTable>

      <p v-if="descansosOcultos" class="text-dimmed mt-3 text-xs">
        {{ descansosOcultos }}
        {{
          descansosOcultos === 1 ? 'día de descanso sin checadas' : 'días de descanso sin checadas'
        }}, no se listan.
      </p>

      <div v-if="jornadas.some((j) => j.anomalies.length)" class="mt-3 space-y-1">
        <p
          v-for="j in jornadas.filter((x) => x.anomalies.length)"
          :key="j.workDate"
          class="text-muted text-xs"
        >
          <span class="font-mono">{{ j.workDate.slice(5) }}</span>
          · {{ j.anomalies.join(' ') }}
        </p>
      </div>
    </UCard>

    <!-- Marcajes -->

    <EmployeeEditModal v-if="person" v-model:open="editOpen" :employee="person" @saved="reload" />

    <AssignmentModal
      v-if="person"
      v-model:open="assignOpen"
      :employee="person"
      :installations="installations.data.value ?? []"
      :shifts="shifts.data.value ?? []"
      :departments="departments.data.value ?? []"
      :positions="positions.data.value ?? []"
      @saved="reload"
    />

    <ConfirmDialog
      v-if="confirming"
      :open="true"
      :title="confirming.title"
      :message="confirming.message"
      :warning="confirming.warning"
      :confirm-label="confirming.confirmLabel"
      :action="confirming.action"
      @update:open="
        (value: boolean) => {
          if (!value) confirming = null
        }
      "
      @confirmed="
        () => {
          confirming = null
          void reload()
        }
      "
    />
  </div>
</template>
