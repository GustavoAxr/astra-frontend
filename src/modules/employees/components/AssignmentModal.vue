<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import ApiErrorAlert from '@/shared/ui/ApiErrorAlert.vue'
import { useAviso } from '@/shared/ui/aviso'
import { todayLocal } from '@/shared/date'
import { conNinguno, NINGUNO, sinNinguno } from '@/shared/ui/select-none'
import type { Installation } from '@/modules/org/types'
import { employeesApi } from '../api'
import { summarizeShift } from '../shift-summary'
import {
  ASSIGNMENT_REASONS,
  ASSIGNMENT_REASON_LABEL,
  type AssignmentReason,
  type Department,
  type EmployeeDetail,
  type Position,
  type ShiftPolicy,
} from '../types'

const props = defineProps<{
  employee: EmployeeDetail
  installations: Installation[]
  shifts: ShiftPolicy[]
  departments: Department[]
  positions: Position[]
}>()
const emit = defineEmits<{ saved: [] }>()
const aviso = useAviso()

const open = defineModel<boolean>('open', { default: false })

const FIELDS = [
  'installationId',
  'shiftPolicyId',
  'departmentId',
  'positionId',
  'validFrom',
  'cycleStartDate',
  'reason',
] as const

const installationId = ref('')
const shiftPolicyId = ref('')
const departmentId = ref(NINGUNO)
const positionId = ref(NINGUNO)
const validFrom = ref(todayLocal())
const reason = ref<AssignmentReason>('SHIFT_CHANGE')
const submitting = ref(false)
const error = ref<Error | null>(null)

const actual = computed(() => props.employee.currentAssignment)

/**
 * Solo bases de SU razón social. El backend rechaza lo contrario —«un cambio de
 * patrón exige baja y alta, no una transferencia»— y ofrecerlo aquí sería
 * enseñar una puerta que no abre.
 */
const installationItems = computed(() =>
  props.installations
    .filter((i) => i.legalEntityId === props.employee.legalEntityId)
    .map((i) => ({ label: `${i.code} · ${i.name}`, value: i.id })),
)

const shiftItems = computed(() =>
  props.shifts
    .filter((s) => s.legalEntityId === props.employee.legalEntityId)
    .map((s) => ({ label: `${s.code} · ${s.name}`, value: s.id })),
)

const departmentItems = computed(() => [
  { label: 'Sin departamento', value: NINGUNO },
  ...props.departments
    .filter((d) => d.legalEntityId === props.employee.legalEntityId)
    .map((d) => ({ label: `${d.code} · ${d.name}`, value: d.id })),
])

// Solo los ACTIVOS de su razón social: ofrecer uno retirado sería invitar a
// volver a usarlo justo cuando se decidió dejar de usarlo.
const positionItems = computed(() => [
  { label: 'Sin puesto', value: NINGUNO },
  ...props.positions
    .filter((p) => p.legalEntityId === props.employee.legalEntityId && p.isActive)
    .map((p) => ({ label: `${p.code} · ${p.name}`, value: p.id })),
])

/*
 * Un desplegable con una sola opción —«Sin puesto»— no explica por qué está
 * así. Cuando el catálogo de esa empresa está vacío se dice, y se dice dónde se
 * llena: si no, parece que el campo está roto.
 *
 * Se comparan con 1 y no con 0 porque la primera entrada es siempre «Sin…».
 */
const sinDepartamentos = computed(() => departmentItems.value.length === 1)
const sinPuestos = computed(() => positionItems.value.length === 1)

const reasonItems = ASSIGNMENT_REASONS
  // `HIRED` es de la primera adscripción; aquí ya hay historia.
  .filter((r) => r !== 'HIRED')
  .map((r) => ({ label: ASSIGNMENT_REASON_LABEL[r], value: r }))

const chosenShift = computed(() => {
  const policy = props.shifts.find((s) => s.id === shiftPolicyId.value)
  return policy ? { policy, summary: summarizeShift(policy) } : null
})

const valid = computed(
  () => installationId.value !== '' && shiftPolicyId.value !== '' && validFrom.value !== '',
)

watch(
  open,
  (isOpen) => {
    if (!isOpen) return
    // Se parte de lo vigente: casi siempre cambia una sola cosa.
    installationId.value = actual.value?.installationId ?? ''
    shiftPolicyId.value = actual.value?.shiftPolicyId ?? ''
    departmentId.value = conNinguno(actual.value?.departmentId)
    positionId.value = conNinguno(actual.value?.positionId)
    validFrom.value = todayLocal()
    reason.value = 'SHIFT_CHANGE'
    error.value = null
  },
  { immediate: true },
)

async function submit(): Promise<void> {
  if (!valid.value || submitting.value) return
  submitting.value = true
  error.value = null

  try {
    await employeesApi.assign(props.employee.id, {
      installationId: installationId.value,
      shiftPolicyId: shiftPolicyId.value,
      departmentId: sinNinguno(departmentId.value),
      positionId: sinNinguno(positionId.value),
      validFrom: validFrom.value,
      cycleStartDate: validFrom.value,
      reason: reason.value,
    })
    // La fecha va en el aviso porque una adscripción NO entra hoy por fuerza:
    // se puede fechar adelante, y eso es justo lo que se olvida al guardarla.
    aviso.hecho('Adscripción guardada', `Vigente desde el ${validFrom.value}`)
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
    title="Cambiar adscripción"
    description="Se abre una vigencia nueva y se cierra la anterior el día previo. Lo de antes se conserva."
  >
    <template #body>
      <form class="space-y-4" @submit.prevent="submit">
        <div class="grid gap-3 sm:grid-cols-2">
          <UFormField label="Base" required>
            <USelectMenu
              v-model="installationId"
              :items="installationItems"
              value-key="value"
              class="w-full"
            />
          </UFormField>

          <UFormField label="Turno" required>
            <USelectMenu
              v-model="shiftPolicyId"
              :items="shiftItems"
              value-key="value"
              searchable
              class="w-full"
            />
          </UFormField>

          <!--
            La ayuda va como PROPIEDAD y no como `<template #help>`: los dos
            únicos campos que la llevaban por slot eran los dos que dejaron de
            responder, y un texto no necesita un slot. Se pierde el enlace a la
            pantalla del catálogo; se dice con palabras dónde está.
          -->
          <UFormField
            label="Departamento"
            :help="
              sinDepartamentos
                ? 'Esta razón social no tiene departamentos: se crean en Organización › Departamentos. Es opcional.'
                : undefined
            "
          >
            <USelectMenu
              v-model="departmentId"
              :items="departmentItems"
              value-key="value"
              class="w-full"
            />
          </UFormField>

          <!--
            Del catálogo, no escrito a mano: con texto libre «Operador» y
            «operador» eran dos puestos distintos y el concentrado por puesto
            salía partido en dos renglones.
          -->
          <UFormField
            label="Puesto"
            :help="
              sinPuestos
                ? 'Esta razón social no tiene puestos: se crean en Organización › Puestos. Es opcional.'
                : undefined
            "
          >
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

          <UFormField label="Motivo" required>
            <USelectMenu
              v-model="reason"
              :items="reasonItems"
              value-key="value"
              class="w-full"
            />
          </UFormField>
        </div>

        <div v-if="chosenShift" class="bg-elevated/50 rounded-lg p-3 text-sm">
          <p class="text-highlighted font-medium">{{ chosenShift.summary.schedule }}</p>
          <p class="text-muted mt-0.5 text-xs">
            Ciclo de {{ chosenShift.policy.cycleLengthDays }} días ·
            {{ chosenShift.summary.workDays }} de trabajo · {{ chosenShift.summary.restDays }} de
            descanso
            <template v-if="chosenShift.summary.graceInMinutes !== null">
              · retardo pasados {{ chosenShift.summary.graceInMinutes }} min
            </template>
          </p>
        </div>

        <ApiErrorAlert :error="error" :fields="FIELDS" />

        <div class="flex justify-end gap-2">
          <UButton label="Cancelar" @click="open = false" />
          <UButton
            type="submit"
            label="Aplicar cambio"
            icon="i-lucide-check"
            :loading="submitting"
            :disabled="!valid"
          />
        </div>
      </form>
    </template>
  </UModal>
</template>
