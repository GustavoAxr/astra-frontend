<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import ApiErrorAlert from '@/shared/ui/ApiErrorAlert.vue'
import { employeesApi } from '../api'
import type { EmployeeDetail, UpdateEmployeeForm } from '../types'

const props = defineProps<{ employee: EmployeeDetail }>()
const emit = defineEmits<{ saved: [] }>()

const open = defineModel<boolean>('open', { default: false })

const FIELDS = [
  'firstName',
  'lastName',
  'secondLastName',
  'curp',
  'rfc',
  'nss',
  'birthDate',
  'whatsappNumber',
] as const

const firstName = ref('')
const lastName = ref('')
const secondLastName = ref('')
const curp = ref('')
const rfc = ref('')
const nss = ref('')
const birthDate = ref('')
const whatsappNumber = ref('')
const submitting = ref(false)
const error = ref<Error | null>(null)

const valid = computed(() => firstName.value.trim() !== '' && lastName.value.trim() !== '')

watch(
  open,
  (isOpen) => {
    if (!isOpen) return
    const e = props.employee
    firstName.value = e.firstName
    lastName.value = e.lastName
    secondLastName.value = e.secondLastName ?? ''
    curp.value = e.curp ?? ''
    // Se rellenan con lo que hay guardado, como los demás. Antes salían
    // siempre vacíos y el expediente parecía no tener RFC ni NSS aunque los
    // tuviera — quien lo abría creía que faltaban y los volvía a capturar.
    rfc.value = e.rfc ?? ''
    nss.value = e.nss ?? ''
    birthDate.value = e.birthDate ?? ''
    whatsappNumber.value = e.whatsappNumber ?? ''
    error.value = null
  },
  { immediate: true },
)

/** Solo lo que cambió: un campo de más devuelve 400. */
async function submit(): Promise<void> {
  if (!valid.value || submitting.value) return
  submitting.value = true
  error.value = null

  const e = props.employee
  const changes: UpdateEmployeeForm = {}
  const diff = (campo: keyof UpdateEmployeeForm, valor: string, antes: string | null) => {
    const limpio = valor.trim()
    if (limpio !== (antes ?? '') && limpio !== '') {
      ;(changes as Record<string, string>)[campo] = limpio
    }
  }

  diff('firstName', firstName.value, e.firstName)
  diff('lastName', lastName.value, e.lastName)
  diff('secondLastName', secondLastName.value, e.secondLastName)
  diff('curp', curp.value, e.curp)
  diff('rfc', rfc.value, e.rfc)
  diff('nss', nss.value, e.nss)
  diff('birthDate', birthDate.value, e.birthDate)
  diff('whatsappNumber', whatsappNumber.value, e.whatsappNumber)

  try {
    if (Object.keys(changes).length > 0) await employeesApi.update(e.id, changes)
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
  <UModal v-model:open="open" title="Editar expediente" :description="employee.employeeCode">
    <template #body>
      <form class="space-y-4" @submit.prevent="submit">
        <div class="grid gap-3 sm:grid-cols-2">
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
          <UFormField label="WhatsApp">
            <UInput v-model="whatsappNumber" class="w-full font-mono" />
          </UFormField>
        </div>

        <!--
          La clave no se edita: es la llave con la que el reloj identifica a la
          persona y con la que se emparejó su padrón. Cambiarla dejaría sus
          checadas huérfanas.
        -->
        <p class="text-dimmed text-xs">
          La clave <span class="font-mono">{{ employee.employeeCode }}</span> no se puede cambiar:
          es con la que el reloj lo identifica.
        </p>

        <ApiErrorAlert :error="error" :fields="FIELDS" />

        <div class="flex justify-end gap-2">
          <UButton label="Cancelar" @click="open = false" />
          <UButton
            type="submit"
            label="Guardar cambios"
            icon="i-lucide-check"
            :loading="submitting"
            :disabled="!valid"
          />
        </div>
      </form>
    </template>
  </UModal>
</template>
