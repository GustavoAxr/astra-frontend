<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useAsync } from '@/shared/composables/useAsync'
import ApiErrorAlert from '@/shared/ui/ApiErrorAlert.vue'
import { useAviso } from '@/shared/ui/aviso'
import { orgApi } from '@/modules/org/api'
import type { ShiftPolicy } from '@/modules/employees/types'
import { shiftsApi, toForm, type ShiftSegmentForm } from '../api'

/**
 * Alta y cambio de un turno con su ciclo completo.
 *
 * POR QUÉ SE CAPTURA INICIO Y FIN Y NO INICIO Y DURACIÓN
 * La base guarda inicio + duración, y hace bien: así «20:00 + 540 min» da las
 * 05:00 del día siguiente sin necesitar una bandera de «cruza la medianoche».
 * Pero nadie piensa su horario en minutos. Aquí se pide «de 20:00 a 05:00» y la
 * conversión se hace al guardar, que es donde debe estar la incomodidad.
 */
const props = defineProps<{
  /** `null` = alta. Con turno = edición. */
  policy: ShiftPolicy | null
  /** Razón social preseleccionada por el filtro de la pantalla. */
  legalEntityId: string | null
}>()
const emit = defineEmits<{ saved: [] }>()
const aviso = useAviso()

const open = defineModel<boolean>('open', { default: false })

interface BloqueForm {
  name: string
  start: string
  end: string
  breakMinutes: number
  breakAutoDeduct: boolean
  breakIsPaid: boolean
}
interface DiaForm {
  rest: boolean
  blocks: BloqueForm[]
}

const bloqueNuevo = (): BloqueForm => ({
  name: '',
  start: '09:00',
  end: '18:00',
  breakMinutes: 0,
  breakAutoDeduct: false,
  // Pagado por omisión: es lo que hace el backend si no se manda, y así el
  // formulario no cambia en silencio el sentido de un turno que ya existía.
  breakIsPaid: true,
})

const name = ref('')
const entityId = ref('')
const scheduleMode = ref('FIXED')
const cycleType = ref('WEEKLY')
const cycleLengthDays = ref(7)
const journeyType = ref('AUTO')
const targetHours = ref(40)
const roundingMinutes = ref(0)
const roundingMode = ref('NEAREST')
/**
 * A partir de cuántos minutos empieza a contar el tiempo extra.
 *
 * Veinte y no cero: con cero, apagar el equipo cinco minutos tarde genera
 * tiempo extra todos los días, y si además el turno exige autorización, eso son
 * cuarenta permisos que nadie va a firmar. El valor es del TURNO y se edita
 * aquí abajo; veinte es solo el punto de partida (ver la migración 020).
 */
const UMBRAL_POR_OMISION = 20

const minOvertimeMinutes = ref(UMBRAL_POR_OMISION)
const overtimeRequiresApproval = ref(false)
const workdayAnchor = ref('SEGMENT_START')
const graceIn = ref(10)
const graceOut = ref(10)
const earlyIn = ref(0)
const dias = ref<DiaForm[]>([])
const submitting = ref(false)
const error = ref<Error | null>(null)

const entities = useAsync((signal) => orgApi.legalEntities(false, signal))

const MODOS = [
  { label: 'Horario fijo', value: 'FIXED' },
  { label: 'Flexible · cumple horas, la hora da igual', value: 'FLEXIBLE' },
  { label: 'Abierto · sin horario', value: 'OPEN' },
]
const CICLOS = [
  { label: 'Semanal · siempre 7 días', value: 'WEEKLY' },
  { label: 'Rotativo · el largo que haga falta', value: 'ROTATING' },
]
const JORNADAS = [
  { label: 'La deduce el sistema', value: 'AUTO' },
  { label: 'Diurna', value: 'DAY' },
  { label: 'Nocturna', value: 'NIGHT' },
  { label: 'Mixta', value: 'MIXED' },
]
const REDONDEOS = [
  { label: 'Al más cercano', value: 'NEAREST' },
  { label: 'Siempre hacia arriba', value: 'UP' },
  { label: 'Siempre hacia abajo', value: 'DOWN' },
]
const ANCLAS = [
  { label: 'Al día en que empezó el bloque', value: 'SEGMENT_START' },
  { label: 'Partir la jornada por la medianoche', value: 'CALENDAR_DAY' },
]

const entityItems = computed(() =>
  (entities.data.value ?? []).map((e) => ({ label: e.businessName, value: e.id })),
)

const editando = computed(() => props.policy !== null)
const conHorario = computed(() => scheduleMode.value === 'FIXED')

// ── Minutos ⇄ HH:MM ───────────────────────────────────────────────────────
const aMinutos = (hhmm: string): number => {
  const [h, m] = hhmm.split(':').map(Number)
  return (h ?? 0) * 60 + (m ?? 0)
}
const aHora = (min: number): string => {
  const t = ((min % 1440) + 1440) % 1440
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`
}
/** Un bloque que termina antes de empezar cruzó la medianoche; no es un error. */
const duracion = (b: BloqueForm): number => (aMinutos(b.end) - aMinutos(b.start) + 1440) % 1440
const cruzaMedianoche = (b: BloqueForm): boolean => aMinutos(b.end) <= aMinutos(b.start)

const formatoHoras = (min: number): string => {
  const h = Math.floor(min / 60)
  const m = min % 60
  if (h === 0) return `${m} min`
  return m === 0 ? `${h} h` : `${h} h ${m} min`
}

/**
 * Los minutos de trabajo del ciclo.
 *
 * EL DESCANSO SE RESTA SOLO SI SE DESCUENTA. Antes se restaba siempre, y por eso
 * este formulario decía «40 h de trabajo en total» mientras el motor calculaba
 * 45: la comida estaba declarada pero marcada para NO descontarse, así que
 * contaba como trabajada. Nueve horas de jornada esperada contra ocho en
 * pantalla es la clase de diferencia que aparece en un recibo de nómina.
 */
const minutosDeTrabajo = (b: BloqueForm): number =>
  duracion(b) - (b.breakAutoDeduct ? b.breakMinutes : 0)

const totalCiclo = computed(() =>
  dias.value.reduce(
    (suma, d) => (d.rest ? suma : suma + d.blocks.reduce((s, b) => s + minutosDeTrabajo(b), 0)),
    0,
  ),
)

// ── Carga del formulario ──────────────────────────────────────────────────
function ajustarDias(largo: number): void {
  const actuales = dias.value
  dias.value = Array.from({ length: largo }, (_, i) => actuales[i] ?? { rest: true, blocks: [] })
}

watch(
  open,
  (abierto) => {
    if (!abierto) return
    error.value = null
    void entities.run()

    if (!props.policy) {
      name.value = ''
      entityId.value = props.legalEntityId ?? ''
      scheduleMode.value = 'FIXED'
      cycleType.value = 'WEEKLY'
      cycleLengthDays.value = 7
      journeyType.value = 'AUTO'
      targetHours.value = 40
      roundingMinutes.value = 0
      roundingMode.value = 'NEAREST'
      minOvertimeMinutes.value = UMBRAL_POR_OMISION
      overtimeRequiresApproval.value = false
      workdayAnchor.value = 'SEGMENT_START'
      graceIn.value = 10
      graceOut.value = 10
      earlyIn.value = 0
      // Cinco de trabajo y dos de descanso: lo que más se parece a lo que la
      // mayoría va a capturar. Se cambia en dos clics.
      dias.value = Array.from({ length: 7 }, (_, i) =>
        i < 5 ? { rest: false, blocks: [bloqueNuevo()] } : { rest: true, blocks: [] },
      )
      return
    }

    const f = toForm(props.policy)
    name.value = f.name
    entityId.value = props.policy.legalEntityId
    scheduleMode.value = f.scheduleMode
    cycleType.value = f.cycleType
    cycleLengthDays.value = f.cycleLengthDays
    journeyType.value = f.journeyType
    targetHours.value = Math.round((f.targetMinutesPerCycle ?? 2400) / 60)
    roundingMinutes.value = f.roundingMinutes
    roundingMode.value = f.roundingMode
    minOvertimeMinutes.value = f.minOvertimeMinutes
    overtimeRequiresApproval.value = f.overtimeRequiresApproval
    workdayAnchor.value = f.workdayAnchor

    const primero = f.segments.find((s) => !s.isRestDay)
    graceIn.value = primero?.graceInMinutes ?? 10
    graceOut.value = primero?.graceOutMinutes ?? 10
    earlyIn.value = primero?.earlyInToleranceMinutes ?? 0

    dias.value = Array.from({ length: f.cycleLengthDays }, (_, i) => {
      const delDia = f.segments
        .filter((s) => s.cycleDay === i + 1)
        .sort((a, b) => a.sequence - b.sequence)
      const trabajo = delDia.filter((s) => !s.isRestDay)
      if (trabajo.length === 0) return { rest: true, blocks: [] }
      return {
        rest: false,
        blocks: trabajo.map((s) => ({
          name: s.segmentName ?? '',
          start: s.startTime ?? '09:00',
          end: aHora(aMinutos(s.startTime ?? '09:00') + (s.durationMinutes ?? 0)),
          breakMinutes: s.breakMinutes ?? 0,
          breakIsPaid: s.breakIsPaid ?? true,
          breakAutoDeduct: s.breakAutoDeduct ?? false,
        })),
      }
    })
  },
  { immediate: true },
)

// Un ciclo semanal dura siete días y el servidor lo rechaza si no. Se ajusta
// aquí para no hacerle descubrir la regla con un error.
watch(cycleType, (tipo) => {
  if (tipo === 'WEEKLY') cycleLengthDays.value = 7
})
watch(cycleLengthDays, (largo) => ajustarDias(largo))

function alternarDescanso(dia: DiaForm): void {
  dia.rest = !dia.rest
  if (!dia.rest && dia.blocks.length === 0) dia.blocks.push(bloqueNuevo())
}

/** Copiar el primer día de trabajo al resto ahorra capturar siete veces lo mismo. */
function copiarAlResto(indice: number): void {
  const molde = dias.value[indice]
  if (!molde || molde.rest) return
  dias.value = dias.value.map((d, i) =>
    i === indice || d.rest ? d : { rest: false, blocks: molde.blocks.map((b) => ({ ...b })) },
  )
}

// ── Validación ────────────────────────────────────────────────────────────
const problemas = computed(() => {
  const lista: string[] = []
  if (name.value.trim() === '') lista.push('Falta el nombre.')
  if (entityId.value === '') lista.push('Falta la razón social.')

  /*
   * Que TODO el ciclo sea descanso es absurdo en cualquier modo, no solo con
   * horario fijo: sin un día hábil no hay nada que cumplir ni nada que medir.
   */
  if (dias.value.every((d) => d.rest)) {
    lista.push('Todos los días son de descanso: así no hay nada que cumplir.')
  }

  if (scheduleMode.value === 'FLEXIBLE' && targetHours.value <= 0) {
    lista.push('Un turno flexible necesita las horas que hay que cumplir en el ciclo.')
  }

  if (conHorario.value) {
    dias.value.forEach((d, i) => {
      if (d.rest) return
      d.blocks.forEach((b, j) => {
        const donde = `Día ${i + 1}, bloque ${j + 1}`
        if (duracion(b) === 0) lista.push(`${donde}: empieza y termina a la misma hora.`)
        else if (b.breakMinutes >= duracion(b)) {
          lista.push(`${donde}: el descanso dura tanto o más que el bloque.`)
        }
      })
    })
  }
  return lista
})

const valid = computed(() => problemas.value.length === 0)

function armarSegmentos(): ShiftSegmentForm[] {
  const salida: ShiftSegmentForm[] = []
  dias.value.forEach((d, i) => {
    const cycleDay = i + 1
    /*
     * SOLO SE MANDA UN DESCANSO SI ALGUIEN LO MARCÓ.
     *
     * Antes, cualquier modo que no fuera horario fijo escribía los siete días
     * como descanso —era la única forma de pasar el `ArrayMinSize(1)` del
     * servidor—. El motor de cálculo se lo creía: una plantilla de tiempo
     * completo flexible quedaba con siete días libres y JAMÁS generaba una
     * falta. La pantalla que decía «Descanso» siete veces no era el fallo, era
     * el síntoma.
     *
     * Un turno flexible sin descansos declarados se manda SIN segmentos, que
     * es lo que de verdad significa: no hay horario que declarar.
     */
    if (d.rest) {
      salida.push({ cycleDay, sequence: 1, isRestDay: true })
      return
    }
    // Sin horario fijo no hay bloques que emitir: lo que obliga son las horas
    // del ciclo, y esas viven en el turno, no en el día.
    if (!conHorario.value) return
    d.blocks.forEach((b, j) => {
      salida.push({
        cycleDay,
        sequence: j + 1,
        isRestDay: false,
        segmentName: b.name.trim() || undefined,
        startTime: b.start,
        durationMinutes: duracion(b),
        graceInMinutes: graceIn.value,
        graceOutMinutes: graceOut.value,
        earlyInToleranceMinutes: earlyIn.value,
        breakMinutes: b.breakMinutes,
        breakAutoDeduct: b.breakAutoDeduct,
        // Se manda SIEMPRE. Omitirlo hacía que el backend lo pusiera en
        // «pagado» por omisión, así que editar un turno con la comida sin goce
        // se la volvía pagada sin que nadie lo pidiera ni lo viera.
        breakIsPaid: b.breakIsPaid,
      })
    })
  })
  return salida
}

async function submit(): Promise<void> {
  if (!valid.value || submitting.value) return
  submitting.value = true
  error.value = null

  const form = {
    name: name.value,
    scheduleMode: scheduleMode.value,
    cycleType: cycleType.value,
    cycleLengthDays: cycleLengthDays.value,
    journeyType: journeyType.value,
    targetMinutesPerCycle: targetHours.value * 60,
    roundingMinutes: roundingMinutes.value,
    roundingMode: roundingMode.value,
    minOvertimeMinutes: minOvertimeMinutes.value,
    overtimeRequiresApproval: overtimeRequiresApproval.value,
    workdayAnchor: workdayAnchor.value,
    segments: armarSegmentos(),
  }

  try {
    // La rama mira `editando`, no `props.policy`: al duplicar un turno la
    // propiedad también viene llena —es el molde— y guardar habría reescrito
    // el original. Ese fallo ya ocurrió una vez con las bases.
    if (editando.value && props.policy) {
      await shiftsApi.update(props.policy.id, form)
      aviso.actualizado(form.name)
    } else {
      await shiftsApi.create(entityId.value, form)
      aviso.creado('Turno', form.name)
    }
    open.value = false
    emit('saved')
  } catch (cause) {
    error.value = cause instanceof Error ? cause : new Error(String(cause))
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <UModal
    v-model:open="open"
    :title="editando ? 'Editar turno' : 'Nuevo turno'"
    description="El horario contra el que se mide la asistencia. Sin bloques con hora no hay retardo posible."
    :ui="{ content: 'max-w-4xl' }"
  >
    <template #body>
      <form class="space-y-5" @submit.prevent="submit">
        <!-- Identidad -->
        <div class="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <!--
            Sin campo de código: lo pone el servidor —`TUR-ADM-01`— al crear.
            Lo que distingue un turno de otro es su NOMBRE, y ese sí se escribe.
          -->
          <UFormField label="Nombre" required class="sm:col-span-3">
            <UInput v-model="name" class="w-full" />
          </UFormField>
        </div>

        <UFormField
          v-if="!editando"
          label="Razón social"
          required
          help="No se puede mover un turno de empresa después: se crea otro."
        >
          <USelectMenu v-model="entityId" :items="entityItems" value-key="value" class="w-full" />
        </UFormField>

        <!-- Forma del ciclo -->
        <div class="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <UFormField label="Tipo de horario">
            <USelectMenu v-model="scheduleMode" :items="MODOS" value-key="value" class="w-full" />
          </UFormField>
          <UFormField label="Ciclo">
            <USelectMenu v-model="cycleType" :items="CICLOS" value-key="value" class="w-full" />
          </UFormField>
          <UFormField
            label="Días del ciclo"
            :help="
              cycleType === 'WEEKLY'
                ? 'Un ciclo semanal siempre dura 7.'
                : 'Un 4x3 dura 7; un 14x14, 28.'
            "
          >
            <UInput
              v-model.number="cycleLengthDays"
              type="number"
              min="1"
              max="366"
              :disabled="cycleType === 'WEEKLY'"
              class="w-full"
            />
          </UFormField>
        </div>

        <UFormField
          v-if="scheduleMode === 'FLEXIBLE'"
          label="Horas a cumplir en el ciclo"
          required
          help="Es lo único contra lo que se puede medir cuando la hora da igual."
        >
          <UInput v-model.number="targetHours" type="number" min="1" class="w-full sm:w-40" />
        </UFormField>

        <!--
          QUÉ DÍAS SE PUEDE TRABAJAR, cuando no hay horario que declarar.

          Sin esto no había forma de decir «los sábados no» en un turno
          flexible, y la pantalla de turnos no podía enseñar entre qué días hay
          que cumplir las horas porque ese dato no existía. Lleva el interruptor
          de descanso y NADA MÁS: pedir horas aquí sería contradecir el propio
          modo.
        -->
        <div v-if="!conHorario" class="space-y-2">
          <h3 class="text-sm font-medium">
            Qué días se puede trabajar
            <span class="text-dimmed font-normal">
              · apaga los que sean de descanso
            </span>
          </h3>

          <div class="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
            <button
              v-for="(dia, i) in dias"
              :key="i"
              type="button"
              class="border-default rounded-lg border p-3 text-left"
              :class="dia.rest ? 'bg-elevated/30 opacity-70' : 'bg-default'"
              @click="dia.rest = !dia.rest"
            >
              <span class="text-dimmed block text-xs tracking-wide uppercase">Día {{ i + 1 }}</span>
              <span class="mt-1 block text-sm">{{ dia.rest ? 'Descanso' : 'Disponible' }}</span>
            </button>
          </div>
        </div>

        <!-- El ciclo, día a día -->
        <div v-if="conHorario" class="space-y-2">
          <div class="flex items-center justify-between">
            <h3 class="text-sm font-medium">
              El ciclo, día a día
              <span class="text-dimmed font-normal">
                · {{ formatoHoras(totalCiclo) }} de trabajo en total
              </span>
            </h3>
          </div>

          <!--
            Los días van NUMERADOS, no nombrados: un 4x3 dura 7 días pero un
            14x14 dura 28, y llamarles «lunes» sería mentir sobre cuándo cae
            cada uno.
          -->
          <div
            v-for="(dia, i) in dias"
            :key="i"
            class="border-default rounded-lg border p-3"
            :class="dia.rest ? 'opacity-70' : ''"
          >
            <div class="flex items-center gap-3">
              <span class="w-16 shrink-0 text-sm font-medium">Día {{ i + 1 }}</span>
              <USwitch
                :model-value="!dia.rest"
                label="Se trabaja"
                @update:model-value="alternarDescanso(dia)"
              />
              <span v-if="dia.rest" class="text-dimmed text-sm">Descanso</span>
              <div v-else class="ml-auto flex gap-1">
                <UButton
                  icon="i-lucide-copy"
                  label="Copiar al resto"
                  size="xs"
                  @click="copiarAlResto(i)"
                />
                <UButton
                  icon="i-lucide-plus"
                  label="Partir jornada"
                  size="xs"
                  @click="dia.blocks.push(bloqueNuevo())"
                />
              </div>
            </div>

            <div v-if="!dia.rest" class="mt-3 space-y-2">
              <div
                v-for="(bloque, j) in dia.blocks"
                :key="j"
                class="grid grid-cols-2 items-end gap-2 sm:grid-cols-6"
              >
                <UFormField :label="j === 0 ? 'Nombre' : ''">
                  <UInput v-model="bloque.name" placeholder="Mañana" class="w-full" />
                </UFormField>
                <UFormField :label="j === 0 ? 'Entra' : ''">
                  <UInput v-model="bloque.start" type="time" class="w-full" />
                </UFormField>
                <UFormField :label="j === 0 ? 'Sale' : ''">
                  <UInput v-model="bloque.end" type="time" class="w-full" />
                </UFormField>
                <UFormField :label="j === 0 ? 'Descanso (min)' : ''">
                  <UInput
                    v-model.number="bloque.breakMinutes"
                    type="number"
                    min="0"
                    class="w-full"
                  />
                </UFormField>
                <div class="text-muted pb-2 text-sm">
                  {{ formatoHoras(minutosDeTrabajo(bloque)) }}
                  <!-- Que termine al día siguiente cambia a qué jornada se imputa. -->
                  <UBadge v-if="cruzaMedianoche(bloque)" label="+1 día" color="warning" />
                </div>
                <div class="flex items-start gap-1 pb-2">
                  <!--
                    Dos interruptores distintos y hay que verlos juntos:
                    DESCONTAR es si el rato se resta de la jornada; PAGAR es si
                    se paga. «Descontar solo» a secas se leía como «descontar
                    solamente» y el otro dato ni siquiera aparecía en pantalla,
                    aunque el formulario lo mandaba —en pagado— cada vez que
                    alguien guardaba.
                  -->
                  <div class="space-y-1">
                    <USwitch
                      v-model="bloque.breakAutoDeduct"
                      :label="bloque.breakAutoDeduct ? 'Se descuenta' : 'Cuenta como trabajo'"
                      :disabled="bloque.breakMinutes === 0"
                    />
                    <USwitch
                      v-model="bloque.breakIsPaid"
                      :label="bloque.breakIsPaid ? 'Se paga' : 'Sin goce'"
                      :disabled="bloque.breakMinutes === 0"
                    />
                  </div>
                  <UButton
                    v-if="dia.blocks.length > 1"
                    icon="i-lucide-x"
                    square
                    size="xs"
                    aria-label="Quitar este bloque"
                    @click="dia.blocks.splice(j, 1)"
                  />
                </div>
              </div>

              <!--
                La combinación imposible se dice en cuanto aparece: un descanso
                que no se descuenta y tampoco se paga son minutos que la persona
                pasa dentro de la jornada y nadie le abona. Casi siempre es que
                se olvidó uno de los dos interruptores.
              -->
              <p
                v-for="(bloque, j) in dia.blocks.filter(
                  (b) => b.breakMinutes > 0 && !b.breakAutoDeduct && !b.breakIsPaid,
                )"
                :key="`aviso-${j}`"
                class="text-warning text-xs"
              >
                «{{ bloque.name || 'Este bloque' }}»: el descanso ni se descuenta ni se paga. O se
                descuenta de la jornada, o se paga como tiempo trabajado.
              </p>
            </div>
          </div>
        </div>

        <p v-else class="text-muted text-sm">
          Este tipo de horario no lleva bloques con hora, así que todos los días del ciclo se
          guardan sin horario.
        </p>

        <!-- Tolerancias y cálculo -->
        <div class="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <UFormField label="Tolerancia de entrada (min)" help="Se aplica a todos los bloques.">
            <UInput v-model.number="graceIn" type="number" min="0" class="w-full" />
          </UFormField>
          <UFormField label="Tolerancia de salida (min)">
            <UInput v-model.number="graceOut" type="number" min="0" class="w-full" />
          </UFormField>
          <UFormField label="Puede entrar antes (min)">
            <UInput v-model.number="earlyIn" type="number" min="0" class="w-full" />
          </UFormField>
          <UFormField label="Redondeo (min)" help="0 = al minuto exacto.">
            <UInput
              v-model.number="roundingMinutes"
              type="number"
              min="0"
              max="60"
              class="w-full"
            />
          </UFormField>
          <UFormField label="Hacia dónde redondea">
            <USelectMenu
              v-model="roundingMode"
              :items="REDONDEOS"
              value-key="value"
              class="w-full"
            />
          </UFormField>
          <UFormField
            label="Extra mínima (min)"
            :help="
              minOvertimeMinutes === 0
                ? 'En cero, quedarse tres minutos genera tiempo extra todos los días.'
                : `El exceso cuenta a partir de ${minOvertimeMinutes} min. Por debajo no genera tiempo extra.`
            "
          >
            <UInput v-model.number="minOvertimeMinutes" type="number" min="0" class="w-full" />
          </UFormField>
          <UFormField label="Clasificación de jornada" class="sm:col-span-2">
            <USelectMenu v-model="journeyType" :items="JORNADAS" value-key="value" class="w-full" />
          </UFormField>
          <UFormField label="A qué día se imputa">
            <USelectMenu v-model="workdayAnchor" :items="ANCLAS" value-key="value" class="w-full" />
          </UFormField>
        </div>

        <USwitch
          v-model="overtimeRequiresApproval"
          label="El tiempo extra necesita autorización previa"
        />

        <!-- Se dice TODO lo que falta a la vez, no lo primero que falló. -->
        <div v-if="problemas.length" class="text-error space-y-0.5 text-sm">
          <p v-for="p in problemas" :key="p">{{ p }}</p>
        </div>

        <ApiErrorAlert :error="error" />

        <div class="flex justify-end gap-2">
          <UButton label="Cancelar" @click="open = false" />
          <UButton
            type="submit"
            icon="i-lucide-check"
            :label="editando ? 'Guardar cambios' : 'Crear turno'"
            :disabled="!valid"
            :loading="submitting"
          />
        </div>
      </form>
    </template>
  </UModal>
</template>
