<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAsync } from '@/shared/composables/useAsync'
import ApiErrorAlert from '@/shared/ui/ApiErrorAlert.vue'
import ReportExportMenu from '@/modules/reports/components/ReportExportMenu.vue'
import { quincenaAnterior, quincenaDe, todayLocal } from '@/shared/date'
import ConfirmDialog from '@/shared/ui/ConfirmDialog.vue'
import { useAuthStore } from '@/modules/auth/store'
import { orgApi } from '@/modules/org/api'
import { attendanceApi } from '@/modules/attendance/api'
import { padronApi } from '@/modules/padron/api'
import { enPlano } from '@/shared/text'
import EmployeeDayTimeline from '@/modules/attendance/components/EmployeeDayTimeline.vue'
import { attendanceStatusLook } from '@/modules/attendance/types'
import { useAviso } from '@/shared/ui/aviso'
import { employeesApi } from '../api'
import { summarizeShift } from '../shift-summary'
import EmployeeEditModal from '../components/EmployeeEditModal.vue'
import DeleteEmployeeModal from '../components/DeleteEmployeeModal.vue'
import EmployeeStatusModal from '../components/EmployeeStatusModal.vue'
import AssignmentModal from '../components/AssignmentModal.vue'
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

/**
 * Borrar definitivamente es de quien administra la razón social, no de RRHH.
 * Espejo de los `@Roles` del backend; oculta, no protege.
 */
const canPurge = computed(() => auth.can('purgeEmployee'))
/** Escribir en un equipo es de RRHH y del administrador. Regla 6: oculta, no protege. */
const canPush = computed(() => auth.can('assignEmployee'))

const borrarOpen = ref(false)
const estadoOpen = ref(false)
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
 * El periodo que se está mirando. Se guarda el nombre, no las fechas: «este
 * mes» tiene que seguir significando este mes mañana, no el rango que se
 * calculó al abrir la pantalla.
 */
type Periodo = 'dia' | 'semana' | 'mes' | 'quincena' | 'quincena-anterior'

const periodo = ref<Periodo>('semana')

const PERIODOS = [
  { label: 'Hoy', value: 'dia' },
  { label: 'Semana', value: 'semana' },
  { label: 'Quincena', value: 'quincena' },
  { label: 'Quincena anterior', value: 'quincena-anterior' },
  { label: 'Mes', value: 'mes' },
]

/**
 * Dos formas distintas de acotar, y la diferencia importa.
 *
 * «Hoy», «semana» y «mes» son días naturales hacia atrás: responden a «cómo ha
 * ido últimamente». Las QUINCENAS son cortes de calendario —del 1 al 15 y del
 * 16 a fin de mes— porque son los que se cierran en nómina, y ahí el rango
 * tiene que coincidir exactamente con el periodo que se paga.
 *
 * La segunda quincena termina el último día del mes sea cual sea: 28, 29, 30
 * o 31. Eso lo resuelve `quincenaDe`, que se lo pregunta al calendario.
 */
const rango = computed(() => {
  const hoy = todayLocal()

  if (periodo.value === 'quincena') return quincenaDe(hoy)
  if (periodo.value === 'quincena-anterior') return quincenaAnterior(hoy)

  const atras = periodo.value === 'dia' ? 0 : periodo.value === 'semana' ? 6 : 29
  const desde = new Date(Date.parse(`${hoy}T00:00:00Z`) - atras * 86_400_000)
    .toISOString()
    .slice(0, 10)
  return { from: desde, to: hoy }
})

/** Cómo se pidió el periodo. Solo se imprime en el expediente exportado. */
const etiquetaDelPeriodo = computed(
  () => PERIODOS.find((p) => p.value === periodo.value)?.label ?? 'Rango libre',
)

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

watch(periodo, () => void attendance.run())

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

const añoEnCurso = Number(todayLocal().slice(0, 4))

/** Cuánto lleva tomado de cada tipo este año. Es la pregunta de RRHH. */
const saldoDelAño = computed(() => diasPorTipoEnElAño(exceptions.data.value ?? [], añoEnCurso))

/**
 * Ninguna incidencia se aprueba desde la aplicación —no hay ruta para ello— y
 * el motor las aplica igual. Decirlo es la diferencia entre un dato y una
 * trampa: alguien podría creer que un permiso sin aprobar no descuenta falta.
 */
const sinAprobar = computed(() => incidencias.value.filter((x) => !x.approvedAt).length)

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
const ordenes = useAsync((signal) =>
  padronApi.commands(enElReloj.value?.deviceId ?? '', signal),
)

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
  const vigencia = p.currentAssignment
  if (vigencia && dia(enviado.validFrom) !== dia(vigencia.validFrom)) {
    motivos.push('la fecha de alta')
  }
  if (p.isActive && vigencia && dia(enviado.validTo) !== dia(vigencia.validTo)) {
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
    await employeesApi.addException({
      employeeId: id.value,
      exceptionTypeId: exceptionTypeId.value,
      startDate: exceptionFrom.value,
      endDate: exceptionTo.value,
      documentRef: exceptionDoc.value,
    })
    aviso.creado('Justificación', `Del ${exceptionFrom.value} al ${exceptionTo.value}`)
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
      :color="
        avisoDelReloj === 'enCola' ? 'info' : avisoDelReloj === 'falló' ? 'error' : 'warning'
      "
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

    <DeleteEmployeeModal
      v-if="borrarOpen && person"
      v-model:open="borrarOpen"
      :employee-id="person.id"
      :employee-code="person.employeeCode"
      :full-name="fullName"
      @deleted="router.push({ name: 'employees' })"
    />

    <div v-if="person" class="grid gap-6 lg:grid-cols-2">
      <!-- Datos personales -->
      <UCard>
        <template #header><h2 class="font-medium">Datos</h2></template>
        <dl class="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          <dt class="text-muted">CURP</dt>
          <dd class="font-mono">{{ person.curp ?? '—' }}</dd>
          <dt class="text-muted">Nacimiento</dt>
          <dd>{{ person.birthDate ?? '—' }}</dd>
          <dt class="text-muted">WhatsApp</dt>
          <dd class="font-mono">{{ person.whatsappNumber ?? '—' }}</dd>
          <dt class="text-muted">Consintió avisos</dt>
          <dd>{{ person.whatsappOptIn ? 'Sí' : 'No' }}</dd>
        </dl>
      </UCard>

      <!-- Adscripciones -->
      <UCard>
        <template #header>
          <div class="flex items-center gap-2">
            <h2 class="font-medium">Adscripciones · {{ person.assignments.length }}</h2>
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
        <ul v-else class="space-y-2 text-sm">
          <li
            v-for="a in person.assignments"
            :key="a.id"
            class="border-default flex flex-wrap items-baseline gap-2 border-b pb-2 last:border-0"
          >
            <span class="font-mono text-xs">{{ installationName(a.installationId) }}</span>
            <span>{{ positionName(a.positionId) }}</span>
            <!--
              El departamento sale del servidor ya resuelto, no del catálogo
              cargado en pantalla: una adscripción vieja puede apuntar a uno que
              después se desactivó, y la historia tiene que seguir diciendo
              dónde estaba esa persona.
            -->
            <span v-if="a.departmentName" class="text-muted text-sm">
              · {{ a.departmentName }}
            </span>
            <span class="text-muted text-xs">
              {{ ASSIGNMENT_REASON_LABEL[a.reason as AssignmentReason] ?? a.reason }}
            </span>
            <span class="text-dimmed ml-auto text-xs">
              {{ a.validFrom }} → {{ a.validTo ?? 'vigente' }}
            </span>
          </li>
        </ul>
      </UCard>

      <!-- Vida laboral -->
      <UCard>
        <template #header>
          <div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
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
        </template>

        <!--
          Una línea de tiempo, no una lista: los movimientos de una persona son
          una secuencia, y el hilo con sus puntos deja ver de un vistazo cuántas
          veces entró y salió. Se pinta de lo más reciente a lo más antiguo, que
          es como llega y como se lee.
        -->
        <ol v-if="(events.data.value ?? []).length > 0" class="mb-4 space-y-0">
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
              class="mt-1.5 size-[15px] shrink-0 rounded-full ring-4"
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
        <p v-else class="text-dimmed mb-4 text-sm">
          Sin movimientos registrados. Ni siquiera el alta: conviene capturarla, porque de ella sale
          la antigüedad.
        </p>

        <form v-if="canWrite" class="flex flex-wrap items-end gap-2" @submit.prevent="addEvent">
          <USelectMenu v-model="eventType" :items="eventItems" value-key="value" class="w-44" />
          <UInput v-model="eventDate" type="date" class="w-40" />
          <UInput v-model="eventNotes" placeholder="Nota (opcional)" class="w-48" />
          <UButton type="submit" icon="i-lucide-plus" label="Registrar" :loading="savingEvent" />
        </form>
      </UCard>

      <!-- Vacaciones y permisos -->
      <UCard>
        <template #header>
          <div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
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
        </template>

        <ul v-if="incidencias.length > 0" class="mb-4 space-y-2">
          <li
            v-for="x in incidencias"
            :key="x.id"
            class="border-default bg-elevated/20 rounded-lg border px-3 py-2"
            :class="x.estado === 'en-curso' ? 'border-info/40' : ''"
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

              <!--
                Que esté aprobada o no NO cambia el cálculo —el motor la aplica
                igual— y por eso hay que decirlo: quien lo vea podría suponer
                que un permiso sin aprobar no tapa la falta, y sí la tapa.
              -->
              <span v-if="x.approvedAt" class="text-success ml-auto">
                <UIcon name="i-lucide-check" class="inline size-3" /> Aprobada
              </span>
              <span v-else class="text-warning ml-auto">Sin aprobar</span>
            </div>
          </li>
        </ul>
        <p v-else class="text-dimmed mb-4 text-sm">Sin justificaciones registradas.</p>

        <p v-if="sinAprobar > 0" class="text-dimmed mb-4 text-xs">
          {{ sinAprobar === 1 ? 'Una justificación está' : `${sinAprobar} justificaciones están` }}
          sin aprobar. Se aplican igual en el cálculo de asistencia: hoy no hay en el sistema una
          ruta para aprobarlas.
        </p>

        <form v-if="canWrite" class="space-y-2" @submit.prevent="addException">
          <div class="flex flex-wrap items-end gap-2">
            <USelectMenu
              v-model="exceptionTypeId"
              :items="typeItems"
              value-key="value"
              placeholder="Tipo"
              searchable
              class="w-52"
            />
            <UInput v-model="exceptionFrom" type="date" class="w-40" />
            <UInput v-model="exceptionTo" type="date" class="w-40" />
            <UInput
              v-if="chosenType?.requiresDocument"
              v-model="exceptionDoc"
              placeholder="Folio del justificante"
              class="w-48"
            />
            <UButton
              type="submit"
              icon="i-lucide-plus"
              label="Registrar"
              :loading="savingException"
              :disabled="exceptionTypeId === '' || exceptionFrom === '' || exceptionTo === ''"
            />
          </div>
          <!-- Pagada y "cuenta como trabajada" son cosas distintas. -->
          <p v-if="chosenType" class="text-dimmed text-xs">
            {{ chosenType.isPaid ? 'Se paga' : 'Sin goce de sueldo' }} ·
            {{
              chosenType.countsAsWorked ? 'cuenta como jornada trabajada' : 'no cuenta como jornada'
            }}
            <template v-if="chosenType.requiresDocument"> · exige justificante</template>
          </p>
        </form>
      </UCard>
    </div>

    <!-- Asistencia -->
    <UCard v-if="person">
      <template #header>
        <div class="flex flex-wrap items-center gap-2">
          <h2 class="font-medium">Asistencia</h2>
          <!--
            Días naturales hacia atrás, no semana ni mes del calendario: lo que
            se quiere ver es «cómo ha ido últimamente», no un corte contable.
          -->
          <USelectMenu v-model="periodo" :items="PERIODOS" value-key="value" class="w-32" />
          <span v-if="attendance.data.value" class="text-dimmed text-xs">
            {{ diaCorto(attendance.data.value.from) }} →
            {{ diaCorto(attendance.data.value.to) }}
          </span>
          <UButton
            :to="{ name: 'punches', query: { employeeId: person.id } }"
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
        <div class="border-default bg-elevated/20 rounded-xl border p-4">
          <dt class="text-dimmed text-xs">Asistencia</dt>
          <dd class="mt-1 text-2xl font-medium" :class="tono(totales.attendanceRate)">
            {{ pct(totales.attendanceRate) }}
          </dd>
          <dd class="text-dimmed text-xs">
            se presentó {{ totales.attendedDays }} de {{ totales.workDays }} días laborables
          </dd>
        </div>
        <div class="border-default bg-elevated/20 rounded-xl border p-4">
          <dt class="text-dimmed text-xs">Puntualidad</dt>
          <dd class="mt-1 text-2xl font-medium" :class="tono(totales.punctualityRate)">
            {{ pct(totales.punctualityRate) }}
          </dd>
          <dd class="text-dimmed text-xs">
            {{ totales.onTimeDays }} a tiempo de {{ totales.measurableDays }} medibles ·
            {{ totales.lateDays }} con retardo
          </dd>
        </div>
        <div class="border-default bg-elevated/20 rounded-xl border p-4">
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
        <EmployeeDayTimeline :days="[...jornadas].reverse()" />
      </div>

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
