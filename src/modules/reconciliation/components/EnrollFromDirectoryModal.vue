<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import ApiErrorAlert from '@/shared/ui/ApiErrorAlert.vue'
import { todayLocal } from '@/shared/date'
import { NINGUNO, sinNinguno } from '@/shared/ui/select-none'
import { orgApi } from '@/modules/org/api'
import { useAsync } from '@/shared/composables/useAsync'
import { employeesApi } from '@/modules/employees/api'
import { summarizeShift } from '@/modules/employees/shift-summary'
import { useAviso } from '@/shared/ui/aviso'
import { splitName } from '../split-name'
import { reconciliationApi } from '../api'
import type { ReconcilePending } from '../types'

const props = defineProps<{
  deviceId: string
  legalEntityId: string
  installationId: string
  /** Usuarios del reloj que todavía no corresponden a nadie. */
  pending: ReconcilePending[]
}>()
const emit = defineEmits<{ done: [] }>()
const aviso = useAviso()

const open = defineModel<boolean>('open', { default: false })

interface Fila {
  externalUserId: string
  deviceName: string | null
  selected: boolean
  code: string
  firstName: string
  lastName: string
  secondLastName: string
  /** Resultado de esta fila una vez procesada. */
  outcome: 'pendiente' | 'creado' | 'error'
  detail: string
}

/*
 * El prefijo YA NO se escribe. La clave se arma con `EMP-` y el número con el
 * que la persona está enrolada en el reloj, que es lo que hace legible la
 * correspondencia entre el expediente y el aparato. Dejarlo escribir invitaba
 * a poner «BIO» un día y «EMP» otro, y a partir de ahí la correspondencia
 * había que buscarla a mano.
 */
const PREFIJO_CLAVE = 'EMP'
const shiftPolicyId = ref('')
const positionId = ref(NINGUNO)
const validFrom = ref(todayLocal())
const rows = ref<Fila[]>([])

const working = ref(false)
const error = ref<Error | null>(null)
const summary = ref<{
  created: number
  failed: number
  enrolled: number
  trayResolved: number
} | null>(null)

const shifts = useAsync((signal) => employeesApi.shiftPolicies(props.legalEntityId, signal))
const installations = useAsync((signal) => orgApi.installations({}, signal))
const positions = useAsync((signal) => orgApi.positions(props.legalEntityId, signal))

// Del catálogo, y solo los activos de esa empresa. Se aplica a TODOS los que se
// den de alta en esta pasada, que es lo que dice la etiqueta.
const positionItems = computed(() => [
  { label: 'Sin puesto', value: NINGUNO },
  ...(positions.data.value ?? [])
    .filter((p) => p.isActive)
    .map((p) => ({ label: `${p.code} · ${p.name}`, value: p.id })),
])

const shiftItems = computed(() =>
  (shifts.data.value ?? []).map((s) => ({ label: `${s.code} · ${s.name}`, value: s.id })),
)

const chosenShift = computed(() => {
  const policy = (shifts.data.value ?? []).find((s) => s.id === shiftPolicyId.value)
  return policy ? summarizeShift(policy) : null
})

const installationName = computed(
  () =>
    (installations.data.value ?? []).find((i) => i.id === props.installationId)?.code ??
    'la base del reloj',
)

const selected = computed(() => rows.value.filter((r) => r.selected))
const canRun = computed(
  () =>
    !working.value &&
    shiftPolicyId.value !== '' &&
    selected.value.length > 0 &&
    selected.value.every(
      (r) => r.code.trim() !== '' && r.firstName.trim() !== '' && r.lastName.trim() !== '',
    ),
)

watch(
  open,
  (isOpen) => {
    if (!isOpen) return
    void shifts.run()
    void installations.run()
    void positions.run()
    summary.value = null
    error.value = null
    // La clave del reloj se conserva TAL CUAL, con sus ceros: es la llave con la
    // que el equipo identifica a cada quien, y perderlos rompería el emparejado.
    rows.value = props.pending.map((p) => {
      const nombre = splitName(p.deviceName)
      return {
        externalUserId: p.externalUserId,
        deviceName: p.deviceName,
        selected: p.deviceName !== null && p.deviceName.trim() !== '',
        code: `${PREFIJO_CLAVE}-${p.externalUserId}`,
        ...nombre,
        outcome: 'pendiente' as const,
        detail: '',
      }
    })
  },
  { immediate: true },
)

// Cambiar el prefijo renumera solo lo que nadie ha tocado a mano.

function toggleAll(value: boolean): void {
  for (const r of rows.value) {
    if (r.outcome === 'creado') continue
    r.selected = value && r.deviceName !== null
  }
}

/**
 * Crea a cada persona y, al final, empareja de golpe.
 *
 * Se crea UNA POR UNA y no en lote a propósito: si la número 30 falla por una
 * clave repetida, las 29 anteriores ya quedaron y se ve cuál falló. Un lote
 * todo-o-nada obligaría a repetir el trabajo entero por un dato malo.
 */
async function run(): Promise<void> {
  if (!canRun.value) return
  working.value = true
  error.value = null
  summary.value = null

  const mappings: { externalUserId: string; employeeId: string }[] = []
  let created = 0
  let failed = 0

  for (const row of rows.value) {
    if (!row.selected || row.outcome === 'creado') continue

    try {
      const persona = await employeesApi.create({
        legalEntityId: props.legalEntityId,
        employeeCode: row.code,
        firstName: row.firstName,
        lastName: row.lastName,
        secondLastName: row.secondLastName,
        curp: '',
        rfc: '',
        nss: '',
        birthDate: '',
      // Se concilia desde el padrón del reloj, donde no viene el sexo. Se
      // captura después en la ficha; inventarlo por el nombre sería peor.
      sex: '',
        whatsappNumber: '',
        // El reloj no sabe correos: se captura después en el expediente.
        email: '',
      })

      await employeesApi.assign(persona.id, {
        installationId: props.installationId,
        shiftPolicyId: shiftPolicyId.value,
        departmentId: '',
        positionId: sinNinguno(positionId.value),
        validFrom: validFrom.value,
        cycleStartDate: validFrom.value,
        reason: 'HIRED',
      })

      mappings.push({ externalUserId: row.externalUserId, employeeId: persona.id })
      row.outcome = 'creado'
      row.detail = persona.employeeCode
      created += 1
    } catch (cause) {
      row.outcome = 'error'
      row.detail = cause instanceof Error ? cause.message : String(cause)
      failed += 1
    }
  }

  let enrolled = 0
  let trayResolved = 0

  if (mappings.length > 0) {
    try {
      const resultado = await reconciliationApi.apply(props.deviceId, mappings)
      enrolled = resultado.enrolled
      trayResolved = resultado.trayResolved
    } catch (cause) {
      // Las personas SÍ quedaron creadas: decirlo evita que alguien vuelva a
      // darlas de alta y se encuentre con claves repetidas.
      error.value = new Error(
        `Se crearon ${created} personas, pero el emparejado con el reloj falló: ` +
          `${cause instanceof Error ? cause.message : String(cause)} ` +
          'Puedes emparejarlas desde esta misma pantalla sin volver a darlas de alta.',
      )
    }
  }

  summary.value = { created, failed, enrolled, trayResolved }

  /*
   * Un aviso de aviso —no de acierto— cuando algo falló: el modal enseña el
   * detalle fila por fila, pero el resultado global no puede leerse como un
   * «listo» si 3 de 30 no entraron.
   */
  if (failed > 0) {
    aviso.aviso(`${created} altas, ${failed} con problema`, 'El detalle está en la lista.')
  } else if (created > 0) {
    aviso.creado(
      `${created} ${created === 1 ? 'persona' : 'personas'}`,
      `${enrolled} emparejadas con el reloj.`,
    )
  }

  working.value = false
  emit('done')
}
</script>

<template>
  <UModal
    v-model:open="open"
    title="Dar de alta desde el padrón del reloj"
    description="El equipo ya tiene los nombres y los números. Revisa cómo quedaron partidos antes de crearlos."
    :ui="{ content: 'max-w-5xl' }"
  >
    <template #body>
      <div class="space-y-4">
        <div class="grid gap-3 sm:grid-cols-4">
          <UFormField label="Turno" required>
            <USelectMenu
              v-model="shiftPolicyId"
              :items="shiftItems"
              value-key="value"
              placeholder="¿Qué horario?"
              searchable
              class="w-full"
            />
          </UFormField>
          <!-- La clave sale del número del reloj: `EMP-00000034`. No se escribe. -->
          <UFormField label="Puesto" hint="Para todos">
            <USelectMenu
              v-model="positionId"
              :items="positionItems"
              value-key="value"
              class="w-full"
            />
          </UFormField>
          <UFormField label="Vigente desde" required>
            <UInput v-model="validFrom" type="date" class="w-full" />
          </UFormField>
        </div>

        <p class="text-muted text-sm">
          Todos entran en <span class="font-mono">{{ installationName }}</span
          >, que es donde está el reloj.
          <template v-if="chosenShift"> Horario: {{ chosenShift.schedule }}.</template>
        </p>

        <!--
          El nombre viene del equipo en UNA sola cadena: dónde acaba el nombre y
          empiezan los apellidos es una conjetura. Por eso se revisa aquí y no
          después, cuando ya tenga checadas colgando.
        -->
        <div class="flex items-center gap-2">
          <UButton label="Marcar todos" size="xs" @click="toggleAll(true)" />
          <UButton label="Ninguno" size="xs" @click="toggleAll(false)" />
          <span class="text-muted text-sm">{{ selected.length }} de {{ rows.length }}</span>
        </div>

        <div class="border-default max-h-96 overflow-y-auto rounded-lg border">
          <table class="w-full text-sm">
            <thead class="bg-elevated/50 sticky top-0">
              <tr class="text-muted text-left text-xs">
                <th class="w-8 p-2"></th>
                <th class="p-2">En el reloj</th>
                <th class="p-2">Clave</th>
                <th class="p-2">Nombre</th>
                <th class="p-2">Apellido paterno</th>
                <th class="p-2">Apellido materno</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="row in rows"
                :key="row.externalUserId"
                class="border-default border-t"
                :class="row.outcome === 'creado' ? 'opacity-50' : ''"
              >
                <td class="p-2">
                  <UCheckbox
                    v-model="row.selected"
                    :disabled="row.outcome === 'creado' || row.deviceName === null"
                  />
                </td>
                <td class="p-2">
                  <span class="text-dimmed font-mono text-xs">{{ row.externalUserId }}</span>
                  <p v-if="row.deviceName" class="text-muted text-xs">{{ row.deviceName }}</p>
                  <p v-else class="text-dimmed text-xs">Sin nombre en el equipo</p>
                </td>
                <td class="p-2"><UInput v-model="row.code" size="xs" class="w-32 font-mono" /></td>
                <td class="p-2"><UInput v-model="row.firstName" size="xs" class="w-36" /></td>
                <td class="p-2"><UInput v-model="row.lastName" size="xs" class="w-32" /></td>
                <td class="p-2">
                  <UInput v-model="row.secondLastName" size="xs" class="w-32" />
                  <p v-if="row.outcome === 'error'" class="text-error mt-1 text-xs">
                    {{ row.detail }}
                  </p>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <UAlert
          v-if="summary"
          :icon="summary.failed > 0 ? 'i-lucide-triangle-alert' : 'i-lucide-circle-check'"
          :color="summary.failed > 0 ? 'warning' : 'success'"
          :title="`${summary.created} personas dadas de alta`"
        >
          <template #description>
            <p v-if="summary.failed > 0">
              {{ summary.failed }} fallaron: el motivo está en su renglón.
            </p>
            <p>
              {{ summary.enrolled }} quedaron emparejadas con el reloj
              <template v-if="summary.trayResolved > 0">
                y se resolvieron {{ summary.trayResolved }} checadas que estaban sin dueño.
              </template>
            </p>
          </template>
        </UAlert>

        <ApiErrorAlert :error="error" />

        <div class="flex justify-end gap-2">
          <UButton label="Cerrar" @click="open = false" />
          <UButton
            :label="`Dar de alta ${selected.length}`"
            icon="i-lucide-user-plus"
            :loading="working"
            :disabled="!canRun"
            @click="run"
          />
        </div>
      </div>
    </template>
  </UModal>
</template>
