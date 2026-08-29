<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import ApiErrorAlert from '@/shared/ui/ApiErrorAlert.vue'
import { todayLocal } from '@/shared/date'
import { useAsync } from '@/shared/composables/useAsync'
import { orgApi } from '@/modules/org/api'
import { NINGUNO, sinNinguno } from '@/shared/ui/select-none'
import type { LegalEntity } from '@/modules/org/types'
import { employeesApi } from '../api'
import { summarizeShift } from '../shift-summary'
import { ASSIGNMENT_REASONS, ASSIGNMENT_REASON_LABEL, type AssignmentReason } from '../types'

const props = defineProps<{ legalEntities: LegalEntity[] }>()
const emit = defineEmits<{ saved: [] }>()

const open = defineModel<boolean>('open', { default: false })

const PERSON_FIELDS = [
  'legalEntityId',
  'firstName',
  'lastName',
  'secondLastName',
  'curp',
  'rfc',
  'nss',
  'birthDate',
  'whatsappNumber',
] as const

const ASSIGNMENT_FIELDS = [
  'installationId',
  'shiftPolicyId',
  'departmentId',
  'positionId',
  'validFrom',
  'cycleStartDate',
  'reason',
] as const

const hoy = todayLocal()

const legalEntityId = ref('')
const firstName = ref('')
const lastName = ref('')
const secondLastName = ref('')
const curp = ref('')
const rfc = ref('')
const nss = ref('')
const birthDate = ref('')
const whatsappNumber = ref('')

const installationId = ref('')
const shiftPolicyId = ref('')
const departmentId = ref(NINGUNO)
const positionId = ref(NINGUNO)
const validFrom = ref(hoy)
const reason = ref<AssignmentReason>('HIRED')

const submitting = ref(false)
const error = ref<Error | null>(null)

const installations = useAsync((signal) => orgApi.installations({}, signal))
const shifts = useAsync((signal) => employeesApi.shiftPolicies(legalEntityId.value, signal))
const departments = useAsync((signal) => employeesApi.departments(signal))
const positions = useAsync((signal) => orgApi.positions(legalEntityId.value, signal))

const entityItems = computed(() =>
  props.legalEntities.map((e) => ({ label: e.businessName, value: e.id })),
)

/** Solo las bases de la empresa elegida: adscribir a otra sería un error mudo. */
const installationItems = computed(() =>
  (installations.data.value ?? [])
    .filter((i) => i.legalEntityId === legalEntityId.value)
    .map((i) => ({ label: `${i.code} · ${i.name}`, value: i.id })),
)

const shiftItems = computed(() =>
  (shifts.data.value ?? []).map((s) => ({
    label: `${s.code} · ${s.name}`,
    value: s.id,
  })),
)

const departmentItems = computed(() => [
  { label: 'Sin departamento', value: NINGUNO },
  ...(departments.data.value ?? [])
    .filter((d) => d.legalEntityId === legalEntityId.value)
    .map((d) => ({ label: `${d.code} · ${d.name}`, value: d.id })),
])

// Del catálogo y solo los activos de esa empresa: con texto libre «Operador» y
// «operador» eran dos puestos distintos.
const positionItems = computed(() => [
  { label: 'Sin puesto', value: NINGUNO },
  ...(positions.data.value ?? [])
    .filter((p) => p.legalEntityId === legalEntityId.value && p.isActive)
    .map((p) => ({ label: `${p.code} · ${p.name}`, value: p.id })),
])

const reasonItems = ASSIGNMENT_REASONS.map((r) => ({
  label: ASSIGNMENT_REASON_LABEL[r],
  value: r,
}))

/** El horario elegido, en palabras: es la respuesta a «¿a qué hora entra?». */
const chosenShift = computed(() => {
  const policy = (shifts.data.value ?? []).find((s) => s.id === shiftPolicyId.value)
  return policy ? { policy, summary: summarizeShift(policy) } : null
})

const valid = computed(
  () =>
    legalEntityId.value !== '' &&
    firstName.value.trim() !== '' &&
    lastName.value.trim() !== '' &&
    installationId.value !== '' &&
    shiftPolicyId.value !== '' &&
    validFrom.value !== '',
)

watch(open, (isOpen) => {
  if (!isOpen) return
  legalEntityId.value = props.legalEntities[0]?.id ?? ''
  firstName.value = ''
  lastName.value = ''
  secondLastName.value = ''
  curp.value = ''
  rfc.value = ''
  nss.value = ''
  birthDate.value = ''
  whatsappNumber.value = ''
  installationId.value = ''
  shiftPolicyId.value = ''
  departmentId.value = NINGUNO
  positionId.value = NINGUNO
  validFrom.value = hoy
  reason.value = 'HIRED'
  error.value = null
  void installations.run()
  void departments.run()
  if (legalEntityId.value !== '') void positions.run()
})

// Cambiar de empresa invalida base, turno, departamento y puesto: son suyos.
watch(legalEntityId, (id) => {
  installationId.value = ''
  shiftPolicyId.value = ''
  departmentId.value = NINGUNO
  positionId.value = NINGUNO
  if (id !== '') {
    void shifts.run()
    void positions.run()
  }
})

/**
 * Dos llamadas, en orden: primero la persona, después su adscripción.
 *
 * Si la segunda falla, el empleado queda dado de alta pero SIN turno, y el
 * motor lo marcaría sin horario. Por eso el error lo dice con esas palabras en
 * vez de un «no se pudo guardar» que dejaría a alguien pensando que no se creó.
 */
async function submit(): Promise<void> {
  if (!valid.value || submitting.value) return
  submitting.value = true
  error.value = null

  try {
    const empleado = await employeesApi.create({
      legalEntityId: legalEntityId.value,
      firstName: firstName.value,
      lastName: lastName.value,
      secondLastName: secondLastName.value,
      curp: curp.value,
      rfc: rfc.value,
      nss: nss.value,
      birthDate: birthDate.value,
      whatsappNumber: whatsappNumber.value,
    })

    try {
      await employeesApi.assign(empleado.id, {
        installationId: installationId.value,
        shiftPolicyId: shiftPolicyId.value,
        departmentId: sinNinguno(departmentId.value),
        positionId: sinNinguno(positionId.value),
        validFrom: validFrom.value,
        cycleStartDate: validFrom.value,
        reason: reason.value,
      })
    } catch (cause) {
      const detalle = cause instanceof Error ? cause.message : String(cause)
      throw new Error(
        `${firstName.value} quedó dado de alta, pero NO se le pudo asignar turno: ${detalle} ` +
          'Asígnaselo desde su ficha; mientras tanto no se le puede calcular asistencia.',
      )
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
    title="Nuevo empleado"
    description="Los datos de la persona y su primera adscripción: dónde trabaja y con qué turno."
    :ui="{ content: 'max-w-3xl' }"
  >
    <template #body>
      <form class="space-y-5" @submit.prevent="submit">
        <section class="space-y-3">
          <p class="text-muted text-xs font-medium tracking-wide uppercase">La persona</p>

          <div class="grid gap-3 sm:grid-cols-2">
            <UFormField label="Razón social" required>
              <USelectMenu
                v-model="legalEntityId"
                :items="entityItems"
                value-key="value"
                class="w-full"
              />
            </UFormField>

            <!--
              La clave la pone el servidor: `EMP-00000045`. Ocho dígitos y esa
              serie porque es el número con el que la persona queda enrolada en
              el reloj; otro formato rompería la conciliación con el equipo.
            -->

            <UFormField label="Nombre" required>
              <UInput v-model="firstName" class="w-full" />
            </UFormField>

            <UFormField label="Apellido paterno" required>
              <UInput v-model="lastName" class="w-full" />
            </UFormField>

            <UFormField label="Apellido materno">
              <UInput v-model="secondLastName" class="w-full" />
            </UFormField>

            <UFormField label="Fecha de nacimiento">
              <UInput v-model="birthDate" type="date" class="w-full" />
            </UFormField>

            <UFormField label="CURP">
              <UInput v-model="curp" class="w-full font-mono uppercase" />
            </UFormField>

            <UFormField label="RFC">
              <UInput v-model="rfc" class="w-full font-mono uppercase" />
            </UFormField>

            <UFormField label="NSS">
              <UInput v-model="nss" class="w-full font-mono" />
            </UFormField>

            <UFormField label="WhatsApp" hint="Para avisos y contingencia">
              <UInput v-model="whatsappNumber" placeholder="+52938..." class="w-full font-mono" />
            </UFormField>
          </div>
        </section>

        <section class="space-y-3">
          <p class="text-muted text-xs font-medium tracking-wide uppercase">
            Adscripción · dónde y con qué horario
          </p>

          <div class="grid gap-3 sm:grid-cols-2">
            <UFormField label="Base" required>
              <USelectMenu
                v-model="installationId"
                :items="installationItems"
                value-key="value"
                placeholder="¿Dónde trabaja?"
                class="w-full"
              />
            </UFormField>

            <UFormField label="Turno" required>
              <USelectMenu
                v-model="shiftPolicyId"
                :items="shiftItems"
                value-key="value"
                :loading="shifts.pending.value"
                placeholder="¿Qué horario?"
                searchable
                class="w-full"
              />
            </UFormField>

            <!--
              Un desplegable con una sola opción no explica por qué está así.
              La ayuda va como PROPIEDAD, no por slot: ver AssignmentModal.
            -->
            <UFormField
              label="Departamento"
              :help="
                departmentItems.length === 1
                  ? 'Esta razón social no tiene departamentos. Es opcional.'
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

            <UFormField
              label="Puesto"
              :help="
                positionItems.length === 1
                  ? 'Esta razón social no tiene puestos. Es opcional.'
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

          <!--
            El horario elegido, en palabras. Es la respuesta directa a «¿cómo sé
            que llegó tarde?»: la tolerancia de entrada es la que define eso.
          -->
          <div v-if="chosenShift" class="bg-elevated/50 rounded-lg p-3 text-sm">
            <p class="text-highlighted font-medium">{{ chosenShift.summary.schedule }}</p>
            <p class="text-muted mt-0.5 text-xs">
              Ciclo de {{ chosenShift.policy.cycleLengthDays }} días ·
              {{ chosenShift.summary.workDays }} de trabajo · {{ chosenShift.summary.restDays }} de
              descanso
              <template v-if="chosenShift.summary.graceInMinutes !== null">
                · se considera retardo pasados
                {{ chosenShift.summary.graceInMinutes }} min
              </template>
            </p>
          </div>
        </section>

        <ApiErrorAlert :error="error" :fields="[...PERSON_FIELDS, ...ASSIGNMENT_FIELDS]" />

        <div class="flex justify-end gap-2">
          <UButton label="Cancelar" @click="open = false" />
          <UButton
            type="submit"
            label="Dar de alta"
            icon="i-lucide-check"
            :loading="submitting"
            :disabled="!valid"
          />
        </div>
      </form>
    </template>
  </UModal>
</template>
