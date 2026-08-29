<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useAsync } from '@/shared/composables/useAsync'
import { quincenaAnterior, quincenaDe, todayLocal } from '@/shared/date'
import ApiErrorAlert from '@/shared/ui/ApiErrorAlert.vue'
import EmptyState from '@/shared/ui/EmptyState.vue'
import PageHeader from '@/shared/ui/PageHeader.vue'
import { useLegalEntityFilter } from '@/modules/org/store'
import { attendanceApi } from '../api'
import type { AttendanceDayList } from '../types'
import DayStatusChart from '../components/DayStatusChart.vue'
import ReportExportMenu from '@/modules/reports/components/ReportExportMenu.vue'

const { selectedId } = storeToRefs(useLegalEntityFilter())

type Periodo = 'dia' | 'semana' | 'quincena' | 'quincena-anterior' | 'mes'

const periodo = ref<Periodo>('quincena')

const PERIODOS = [
  { label: 'Hoy', value: 'dia' },
  { label: 'Semana', value: 'semana' },
  { label: 'Quincena', value: 'quincena' },
  { label: 'Quincena anterior', value: 'quincena-anterior' },
  { label: 'Mes', value: 'mes' },
]

/**
 * Las quincenas son cortes de CALENDARIO —del 1 al 15 y del 16 a fin de mes—
 * porque son los que se cierran en nómina. «Hoy», «semana» y «mes» son días
 * naturales hacia atrás: responden a «cómo ha ido últimamente», que es otra
 * pregunta. Mezclar las dos formas es como salen cierres que no cuadran.
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

/** Cómo se pidió el periodo. Va a la hoja de parámetros del reporte. */
const etiquetaDelPeriodo = computed(
  () => PERIODOS.find((p) => p.value === periodo.value)?.label ?? 'Rango libre',
)

/**
 * El día abierto abajo. Se guarda la FECHA, no el índice de la barra: al
 * cambiar de periodo los índices se mueven y se estaría mirando otro día sin
 * enterarse.
 */
const diaAbierto = ref<string>(todayLocal())

const detalleDia = useAsync((signal) =>
  attendanceApi.day(
    { date: diaAbierto.value, legalEntityId: selectedId.value ?? undefined },
    signal,
  ),
)

const filasDia = computed(() => detalleDia.data.value?.data ?? [])

/**
 * Sin turno arriba del todo NO: son los que no se pueden calcular y taparían a
 * quien sí necesita revisión. Primero lo que hay que mirar —faltas, luego
 * incompletos, luego retardos— y al final lo que salió bien.
 */
const ORDEN: Record<string, number> = {
  ABSENT: 0,
  INCOMPLETE: 1,
  LATE: 2,
  ON_TIME: 3,
  REST: 4,
  NO_SCHEDULE: 5,
}

const filasOrdenadas = computed(() =>
  [...filasDia.value].sort(
    (a, b) =>
      (ORDEN[a.status] ?? 9) - (ORDEN[b.status] ?? 9) ||
      b.lateMinutes - a.lateMinutes ||
      a.employeeCode.localeCompare(b.employeeCode),
  ),
)

/**
 * FILTROS. Se aplican en el navegador, no pidiéndoselos al servidor.
 *
 * `GET /attendance/day` ya entrega la plantilla ENTERA de esa fecha y
 * `/attendance/summary` la entera del periodo: son decenas de filas, no miles.
 * Filtrar aquí es inmediato, no gasta una llamada por tecla y —lo que importa—
 * los totales de arriba siguen siendo los del día completo, calculados por el
 * mismo motor. Un total que cambiara al escribir en un buscador dejaría de ser
 * el total del día y sería otra cosa sin nombre.
 */
const busqueda = ref('')

/** Vacío = todos. Un conjunto, no un valor: se pueden mirar faltas Y retardos. */
const estados = ref(new Set<string>())

/*
 * La cadena vacía no puede ser el valor de una opción —el Combobox de Reka UI
 * la tiene reservada para «nada seleccionado»—, así que los dos casos que no
 * son un código de turno llevan centinela. Ver `@/shared/ui/select-none`.
 */
const TODOS_LOS_TURNOS = '--todos--'
const SIN_TURNO = '--sin-turno--'
const turno = ref<string>(TODOS_LOS_TURNOS)

/** Sin acentos y en minúsculas: «Ángel» se encuentra tecleando «angel». */
const plano = (texto: string): string =>
  texto
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()

/**
 * Los turnos que REALMENTE aparecen ese día, no el catálogo entero: ofrecer un
 * turno que no tiene nadie solo sirve para vaciar la tabla sin explicar por qué.
 */
const turnoItems = computed(() => {
  const vistos = new Map<string, string>()
  let hayHuerfanos = false
  for (const fila of filasDia.value) {
    if (!fila.shiftCode) {
      hayHuerfanos = true
      continue
    }
    if (!vistos.has(fila.shiftCode)) {
      vistos.set(fila.shiftCode, fila.shiftName ?? fila.shiftCode)
    }
  }
  const items = [...vistos.entries()]
    .sort((a, b) => a[0].localeCompare(b[0], 'es'))
    .map(([code, name]) => ({ label: `${code} · ${name}`, value: code }))
  return [
    { label: 'Todos los turnos', value: TODOS_LOS_TURNOS },
    ...items,
    // Sin adscripción vigente ese día: es una respuesta legítima a «quién falta
    // por asignar», así que se puede filtrar por ella.
    ...(hayHuerfanos ? [{ label: 'Sin turno', value: SIN_TURNO }] : []),
  ]
})

const filasFiltradas = computed(() => {
  const q = plano(busqueda.value.trim())
  return filasOrdenadas.value.filter((fila) => {
    if (estados.value.size > 0 && !estados.value.has(fila.status)) return false
    if (turno.value !== TODOS_LOS_TURNOS && (fila.shiftCode ?? SIN_TURNO) !== turno.value) {
      return false
    }
    return !q || plano(`${fila.employeeCode} ${fila.employeeName}`).includes(q)
  })
})

const filtrandoDia = computed(
  () => busqueda.value.trim() !== '' || estados.value.size > 0 || turno.value !== TODOS_LOS_TURNOS,
)

function alternarEstado(estado: string): void {
  const copia = new Set(estados.value)
  if (copia.has(estado)) copia.delete(estado)
  else copia.add(estado)
  estados.value = copia
}

function limpiarDia(): void {
  busqueda.value = ''
  estados.value = new Set()
  turno.value = TODOS_LOS_TURNOS
}

/**
 * Al cambiar de día, un turno que ese día no existe dejaría la tabla vacía sin
 * que nada en pantalla lo explicara. El estado y la búsqueda sí se conservan:
 * «enséñame las faltas» sigue queriendo decir lo mismo el martes.
 */
watch(turnoItems, (items) => {
  if (!items.some((i) => i.value === turno.value)) turno.value = TODOS_LOS_TURNOS
})

/**
 * Las etiquetas del día. Son a la vez el recuento —que siempre es el del día
 * COMPLETO, venga o no filtrado— y el filtro por estado.
 */
const CHIPS: {
  estado: string
  texto: string
  clase: string
  total: (t: AttendanceDayList['totals']) => number
}[] = [
  { estado: 'ON_TIME', texto: 'a tiempo', clase: 'text-success', total: (t) => t.onTime },
  { estado: 'LATE', texto: 'con retardo', clase: 'text-warning', total: (t) => t.late },
  { estado: 'ABSENT', texto: 'faltas', clase: 'text-error', total: (t) => t.absent },
  { estado: 'INCOMPLETE', texto: 'incompletos', clase: 'text-info', total: (t) => t.incomplete },
  { estado: 'REST', texto: 'de descanso', clase: 'text-muted', total: (t) => t.rest },
  { estado: 'HOLIDAY', texto: 'en festivo', clase: 'text-info', total: (t) => t.holiday },
  { estado: 'OFFSITE', texto: 'fuera de sede', clase: 'text-success', total: (t) => t.offsite },
  { estado: 'NO_SCHEDULE', texto: 'sin turno', clase: 'text-muted', total: (t) => t.noSchedule },
]

/**
 * «Incidencia» son cuatro estados, no uno: vacaciones, incapacidad, permiso y
 * suspensión. La etiqueta los junta porque en la tira de un día lo que importa
 * es «hoy no se le esperaba y está justificado»; cuál de las cuatro es sale en
 * la fila de cada persona.
 */
const ESTADOS_DE_INCIDENCIA = ['VACATION', 'INCAPACITY', 'PERMISSION', 'SUSPENDED']

function alternarIncidencias(): void {
  const copia = new Set(estados.value)
  const encendidas = ESTADOS_DE_INCIDENCIA.every((e) => copia.has(e))
  for (const e of ESTADOS_DE_INCIDENCIA) {
    if (encendidas) copia.delete(e)
    else copia.add(e)
  }
  estados.value = copia
}

const incidenciasEncendidas = computed(() =>
  ESTADOS_DE_INCIDENCIA.every((e) => estados.value.has(e)),
)

const hora = new Intl.DateTimeFormat('es-MX', { timeStyle: 'short' })
const reloj = (iso: string | null): string => (iso ? hora.format(new Date(iso)) : '—')

const ESTADO: Record<
  string,
  { label: string; color: 'success' | 'warning' | 'error' | 'info' | 'neutral' }
> = {
  ON_TIME: { label: 'A tiempo', color: 'success' },
  LATE: { label: 'Retardo', color: 'warning' },
  ABSENT: { label: 'Falta', color: 'error' },
  INCOMPLETE: { label: 'Incompleto', color: 'info' },
  REST: { label: 'Descanso', color: 'neutral' },
  NO_SCHEDULE: { label: 'Sin turno', color: 'neutral' },
  // Los que trae la migración 019. Un día cubierto por una incidencia NUNCA
  // es falta, y aquí se pinta con su nombre en vez de con un rojo que acusa.
  HOLIDAY: { label: 'Festivo', color: 'info' },
  VACATION: { label: 'Vacaciones', color: 'info' },
  INCAPACITY: { label: 'Incapacidad', color: 'info' },
  PERMISSION: { label: 'Permiso', color: 'info' },
  SUSPENDED: { label: 'Suspensión', color: 'neutral' },
  OFFSITE: { label: 'Fuera de sede', color: 'success' },
}

const resumen = useAsync((signal) =>
  attendanceApi.summary({ ...rango.value, legalEntityId: selectedId.value ?? undefined }, signal),
)

const datos = computed(() => resumen.data.value)
const dias = computed(() => datos.value?.byDay ?? [])

/**
 * Ordenada por retardos, que es la pregunta que trae a alguien aquí. Quien no
 * tiene ninguno queda al final, no fuera: seguir viendo a toda la plantilla
 * evita creer que la lista son «los problemáticos» y nadie más existe.
 */
const personas = computed(() =>
  [...(datos.value?.byEmployee ?? [])].sort(
    (a, b) =>
      b.lateDays - a.lateDays || b.absentDays - a.absentDays || b.lateMinutes - a.lateMinutes,
  ),
)

/**
 * La misma búsqueda de arriba alcanza a las dos tablas: «por persona» y «por
 * clave» significan lo mismo en un día que en el periodo, y dos cajas de texto
 * distintas para la misma pregunta solo obligan a teclear dos veces.
 */
const personasFiltradas = computed(() => {
  const q = plano(busqueda.value.trim())
  if (!q) return personas.value
  return personas.value.filter((p) => plano(`${p.employeeCode} ${p.employeeName}`).includes(q))
})

/**
 * Horas del periodo trabajadas fuera de la sede. El resumen las trae por día,
 * así que se suman aquí en vez de pedirle otro total al servidor.
 */
const remotoDelPeriodo = computed(() =>
  (datos.value?.byDay ?? []).reduce((suma, d) => suma + d.remoteMinutes, 0),
)

/** Cuánta gente no tenía turno ningún día del periodo: explica barras cortas. */
const sinTurno = computed(() => {
  const d = datos.value
  if (!d || d.byDay.length === 0) return 0
  return Math.min(...d.byDay.map((x) => x.noSchedule))
})

function hhmm(minutos: number): string {
  if (!minutos) return '—'
  const h = Math.floor(minutos / 60)
  const m = minutos % 60
  if (h === 0) return `${m} min`
  return m === 0 ? `${h} h` : `${h} h ${m} min`
}

const fecha = new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'short' })
const dia = (iso: string): string => {
  const [y, m, d] = iso.split('-').map(Number)
  return fecha.format(new Date(y ?? 0, (m ?? 1) - 1, d ?? 1))
}

watch([periodo, selectedId], () => void resumen.run(), { immediate: true })
watch([diaAbierto, selectedId], () => void detalleDia.run(), { immediate: true })
</script>

<template>
  <div class="space-y-4">
    <PageHeader
      title="Asistencia"
      description="Cómo va la plantilla en el periodo. Se calcula desde las checadas contra el turno vigente de cada día."
      :count="datos ? `${datos.employees}` : undefined"
    >
      <template #actions>
        <!--
          Alcanza a las dos tablas de abajo. NO toca las cifras de arriba: esas
          son las del periodo entero y tienen que seguir siéndolo.
        -->
        <UInput
          v-model="busqueda"
          placeholder="Nombre o clave"
          icon="i-lucide-search"
          class="w-56"
        />
        <USelectMenu v-model="periodo" :items="PERIODOS" value-key="value" class="w-48" />
        <span v-if="datos" class="text-dimmed text-xs">
          {{ dia(datos.from) }} → {{ dia(datos.to) }}
        </span>
        <!--
          Exporta EL PERIODO Y EL ALCANCE, no lo que la tabla tenga filtrado en
          pantalla. El archivo se pide por parámetros y se puede volver a
          generar igual; si dependiera del buscador de arriba, dos personas
          exportando el mismo mes obtendrían archivos distintos.
        -->
        <ReportExportMenu
          path="/reports/attendance"
          :query="{
            from: rango.from,
            to: rango.to,
            legalEntityId: selectedId ?? undefined,
            periodo: etiquetaDelPeriodo,
          }"
          con-detalle
        />
      </template>
    </PageHeader>

    <ApiErrorAlert :error="resumen.error.value" />

    <div v-if="resumen.pending.value && !resumen.loaded.value" class="text-muted text-sm">
      Calculando…
    </div>

    <EmptyState
      v-else-if="datos && datos.employees === 0"
      icon="i-lucide-users"
      title="No hay nadie en este alcance"
      description="Cambia la razón social del filtro, o da de alta personal."
    />

    <template v-else-if="datos">
      <!-- Lo primero, las cuatro cifras que se preguntan. -->
      <dl class="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div class="border-default bg-elevated/20 rounded-xl border p-4">
          <dt class="text-dimmed text-xs">Trabajado</dt>
          <dd class="text-highlighted mt-1 text-xl font-medium">
            {{ hhmm(datos.totals.workedMinutes) }}
          </dd>
          <dd class="text-dimmed text-xs">de {{ hhmm(datos.totals.scheduledMinutes) }}</dd>
        </div>
        <div class="border-default bg-elevated/20 rounded-xl border p-4">
          <dt class="text-dimmed text-xs">Retardos</dt>
          <dd class="mt-1 text-xl font-medium" :class="datos.totals.lateDays ? 'text-warning' : ''">
            {{ datos.totals.lateDays }}
          </dd>
          <dd class="text-dimmed text-xs">{{ hhmm(datos.totals.lateMinutes) }} acumulados</dd>
        </div>
        <div class="border-default bg-elevated/20 rounded-xl border p-4">
          <dt class="text-dimmed text-xs">Faltas</dt>
          <dd class="mt-1 text-xl font-medium" :class="datos.totals.absentDays ? 'text-error' : ''">
            {{ datos.totals.absentDays }}
          </dd>
          <dd class="text-dimmed text-xs">{{ datos.totals.onTimeDays }} días puntuales</dd>
        </div>
        <div class="border-default bg-elevated/20 rounded-xl border p-4">
          <dt class="text-dimmed text-xs">Tiempo extra</dt>
          <dd class="text-highlighted mt-1 text-xl font-medium">
            {{ hhmm(datos.totals.overtimeMinutes) }}
          </dd>
          <!-- Lo no autorizado se dice aparte: no es lo mismo que se pague. -->
          <dd
            class="text-xs"
            :class="datos.totals.unapprovedOvertimeMinutes ? 'text-warning' : 'text-dimmed'"
          >
            {{ hhmm(datos.totals.unapprovedOvertimeMinutes) }} sin autorizar
          </dd>
          <!--
            Cuántas de esas horas no tienen checada que las respalde. No es un
            reproche: es lo primero que pregunta quien audita el pago.
          -->
          <dd v-if="remotoDelPeriodo" class="text-info text-xs">
            {{ hhmm(remotoDelPeriodo) }} fuera de sede
          </dd>
        </div>
      </dl>

      <UCard>
        <template #header>
          <h2 class="font-medium">Día a día</h2>
        </template>
        <DayStatusChart :days="dias" :selected="diaAbierto" @select="diaAbierto = $event" />
        <p v-if="sinTurno > 0" class="text-muted mt-3 text-xs">
          {{ sinTurno }}
          {{ sinTurno === 1 ? 'persona no tiene' : 'personas no tienen' }} adscripción vigente en
          ningún día del periodo, así que no se les puede calcular nada.
        </p>
      </UCard>

      <!--
        Un día concreto con toda la plantilla: es lo que se necesita para cuadrar
        cuentas diarias. La fecha se elige con el campo o pulsando una barra de
        la gráfica de arriba.
      -->
      <UCard>
        <template #header>
          <div class="flex flex-wrap items-center gap-3">
            <h2 class="font-medium">Un día</h2>
            <UInput v-model="diaAbierto" type="date" class="w-40" />
            <USelectMenu
              v-model="turno"
              :items="turnoItems"
              value-key="value"
              icon="i-lucide-calendar-clock"
              class="w-56"
            />
            <span v-if="detalleDia.data.value" class="text-dimmed text-xs">
              <!--
                Cuántas se están viendo de cuántas hay. Sin el «de N» un filtro
                olvidado parece una plantilla que encogió.
              -->
              <template v-if="filtrandoDia">
                {{ filasFiltradas.length }} de {{ detalleDia.data.value.employees }} personas
              </template>
              <template v-else>{{ detalleDia.data.value.employees }} personas</template>
            </span>
            <UButton
              v-if="filtrandoDia"
              icon="i-lucide-filter-x"
              label="Limpiar filtros"
              size="xs"
              class="ml-auto"
              @click="limpiarDia"
            />
          </div>
        </template>

        <ApiErrorAlert :error="detalleDia.error.value" />

        <!--
          La misma tira de siempre, ahora pulsable: cada etiqueta filtra por su
          estado y se pueden encender varias. Los números NO cambian al filtrar
          —son los del día completo—; lo que cambia es la tabla de abajo.

          Un estado con cero se apaga en vez de esconderse: que no haya faltas
          hoy es justo lo que se quería saber.
        -->
        <div
          v-if="detalleDia.data.value"
          class="text-muted mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm"
        >
          <button
            v-for="chip in CHIPS"
            :key="chip.estado"
            type="button"
            class="rounded-md px-1.5 py-0.5 transition-colors"
            :class="[
              chip.clase,
              chip.total(detalleDia.data.value.totals) === 0
                ? 'cursor-default opacity-40'
                : 'hover:bg-elevated cursor-pointer',
              estados.has(chip.estado) ? 'bg-elevated ring-accented ring-1 ring-inset' : '',
            ]"
            :disabled="chip.total(detalleDia.data.value.totals) === 0"
            :aria-pressed="estados.has(chip.estado)"
            @click="alternarEstado(chip.estado)"
          >
            {{ chip.total(detalleDia.data.value.totals) }} {{ chip.texto }}
          </button>
          <button
            type="button"
            class="rounded-md px-1.5 py-0.5 transition-colors"
            :class="[
              'text-info',
              detalleDia.data.value.totals.incidence === 0
                ? 'cursor-default opacity-40'
                : 'hover:bg-elevated cursor-pointer',
              incidenciasEncendidas ? 'bg-elevated ring-accented ring-1 ring-inset' : '',
            ]"
            :disabled="detalleDia.data.value.totals.incidence === 0"
            :aria-pressed="incidenciasEncendidas"
            @click="alternarIncidencias"
          >
            {{ detalleDia.data.value.totals.incidence }} con incidencia
          </button>
          <span class="text-highlighted ml-auto">
            {{ hhmm(detalleDia.data.value.totals.workedMinutes) }} de
            {{ hhmm(detalleDia.data.value.totals.scheduledMinutes) }}
            <!--
              Fuera de sede va SUMANDO aparte y no dentro del primer número: ese
              es lo que midió el reloj, y meterle horas sin checada lo volvería
              una cifra que no se puede rastrear.
            -->
            <span v-if="detalleDia.data.value.totals.remoteMinutes" class="text-info">
              + {{ hhmm(detalleDia.data.value.totals.remoteMinutes) }} fuera de sede
            </span>
          </span>
        </div>

        <UTable
          :data="filasFiltradas"
          :columns="[
            { accessorKey: 'employeeCode', header: 'Clave' },
            { accessorKey: 'employeeName', header: 'Nombre' },
            { accessorKey: 'status', header: 'Estado' },
            { id: 'turno', header: 'Turno' },
            { id: 'marcajes', header: 'Primera / última' },
            { id: 'trabajado', header: 'Trabajado' },
            { accessorKey: 'lateMinutes', header: 'Retardo' },
          ]"
          :loading="detalleDia.pending.value"
          :empty="
            filtrandoDia ? 'Nadie de este día coincide con el filtro.' : 'No hay nadie en este día.'
          "
        >
          <template #employeeCode-cell="{ row }">
            <span class="font-mono text-xs">{{ row.original.employeeCode }}</span>
          </template>
          <template #employeeName-cell="{ row }">
            <span class="block max-w-[16rem] truncate">{{ row.original.employeeName }}</span>
          </template>
          <!--
            El nombre de la incidencia manda sobre la etiqueta genérica: dice
            «Permiso por defunción», no «Permiso». Y un festivo que además tapa
            unas vacaciones lo dice debajo, sin perder ninguno de los dos.
          -->
          <template #status-cell="{ row }">
            <UBadge
              :label="
                row.original.exceptionName ??
                row.original.holidayName ??
                ESTADO[row.original.status]?.label ??
                row.original.status
              "
              :color="ESTADO[row.original.status]?.color ?? 'neutral'"
            />
            <span
              v-if="row.original.exceptionName && row.original.holidayName"
              class="text-dimmed mt-0.5 block text-xs"
            >
              {{ row.original.holidayName }}
            </span>
          </template>
          <!--
            Con el código delante: es lo que dice el selector de turno de
            arriba, y sin verlo en la fila no hay forma de saber qué se filtró.
          -->
          <template #turno-cell="{ row }">
            <div v-if="row.original.shiftCode || row.original.expectedStart">
              <span v-if="row.original.shiftCode" class="font-mono text-xs">
                {{ row.original.shiftCode }}
              </span>
              <span v-if="row.original.expectedStart" class="text-muted block text-xs">
                {{ reloj(row.original.expectedStart) }} → {{ reloj(row.original.expectedEnd) }}
              </span>
            </div>
            <span v-else class="text-dimmed text-xs">—</span>
          </template>
          <!--
            «Primera» y «última», no «entrada» y «salida»: el equipo manda el
            tipo como UNKNOWN y decidir cuál es cuál sería inventar (regla 1).
          -->
          <template #marcajes-cell="{ row }">
            <span v-if="row.original.firstPunch">
              {{ reloj(row.original.firstPunch) }} → {{ reloj(row.original.lastPunch) }}
              <span v-if="row.original.punchCount > 2" class="text-dimmed text-xs">
                ({{ row.original.punchCount }})
              </span>
            </span>
            <span v-else class="text-dimmed">—</span>
          </template>
          <template #trabajado-cell="{ row }">
            {{ hhmm(row.original.workedMinutes) }}
            <span v-if="row.original.remoteMinutes" class="text-info block text-xs">
              + {{ hhmm(row.original.remoteMinutes) }} fuera de sede
            </span>
          </template>
          <template #lateMinutes-cell="{ row }">
            <span v-if="row.original.lateMinutes" class="text-warning">
              {{ row.original.lateMinutes }} min
            </span>
            <span v-else class="text-dimmed">—</span>
          </template>
        </UTable>
      </UCard>

      <UCard>
        <template #header>
          <div class="flex flex-wrap items-center gap-3">
            <h2 class="font-medium">Todo el periodo, por persona</h2>
            <span v-if="busqueda.trim()" class="text-dimmed text-xs">
              {{ personasFiltradas.length }} de {{ personas.length }} personas
            </span>
          </div>
        </template>
        <UTable
          :data="personasFiltradas"
          :columns="[
            { accessorKey: 'employeeCode', header: 'Clave' },
            { accessorKey: 'employeeName', header: 'Nombre' },
            { id: 'trabajado', header: 'Trabajado' },
            { accessorKey: 'lateDays', header: 'Retardos' },
            { accessorKey: 'absentDays', header: 'Faltas' },
            { id: 'extra', header: 'Extra' },
          ]"
          :loading="resumen.pending.value"
          :empty="
            busqueda.trim() ? 'Nadie coincide con esa búsqueda.' : 'No hay nadie en este periodo.'
          "
        >
          <template #employeeCode-cell="{ row }">
            <span class="font-mono text-xs">{{ row.original.employeeCode }}</span>
          </template>

          <template #employeeName-cell="{ row }">
            <span class="block max-w-[16rem] truncate">{{ row.original.employeeName }}</span>
          </template>

          <template #trabajado-cell="{ row }">
            {{ hhmm(row.original.workedMinutes) }}
            <span class="text-dimmed text-xs"> de {{ hhmm(row.original.scheduledMinutes) }} </span>
          </template>

          <template #lateDays-cell="{ row }">
            <span v-if="row.original.lateDays" class="text-warning">
              {{ row.original.lateDays }}
              <span class="text-dimmed text-xs">· {{ row.original.lateMinutes }} min</span>
            </span>
            <span v-else class="text-dimmed">—</span>
          </template>

          <template #absentDays-cell="{ row }">
            <span v-if="row.original.absentDays" class="text-error">
              {{ row.original.absentDays }}
            </span>
            <span v-else class="text-dimmed">—</span>
          </template>

          <template #extra-cell="{ row }">
            <span v-if="row.original.overtimeMinutes" class="text-success">
              {{ hhmm(row.original.overtimeMinutes) }}
              <span v-if="row.original.remoteMinutes" class="text-info block text-xs">
                {{ hhmm(row.original.remoteMinutes) }} fuera de sede
              </span>
            </span>
            <span v-else-if="row.original.unapprovedOvertimeMinutes" class="text-warning text-xs">
              {{ hhmm(row.original.unapprovedOvertimeMinutes) }} sin autorizar
            </span>
            <span v-else class="text-dimmed">—</span>
          </template>
        </UTable>
      </UCard>
    </template>
  </div>
</template>
