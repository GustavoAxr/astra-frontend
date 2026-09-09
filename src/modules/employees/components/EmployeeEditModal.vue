<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useAviso } from '@/shared/ui/aviso'
import ApiErrorAlert from '@/shared/ui/ApiErrorAlert.vue'
import { employeesApi } from '../api'
import { E164, aE164 } from '../telefono'
import { NINGUNO, sinNinguno } from '@/shared/ui/select-none'
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
  'email',
] as const

const firstName = ref('')
const lastName = ref('')
const secondLastName = ref('')
const curp = ref('')
const rfc = ref('')
const nss = ref('')
const birthDate = ref('')
const aviso = useAviso()

const whatsappNumber = ref('')
const email = ref('')

/**
 * El sexo se puede capturar aquí porque los expedientes que ya existían no lo
 * traen: se creó con la migración 025 y quedó nulo en los 42. Mientras esté
 * vacío, el reloj enseña «Desconocido» en su ficha.
 *
 * `NINGUNO` y no cadena vacía: ver `select-none.ts`.
 */
const sexo = ref(NINGUNO)

/** El número tal como se va a guardar: E.164, y se enseña antes de guardarlo. */
const telefonoNormalizado = computed(() => aE164(whatsappNumber.value))
const telefonoValido = computed(() => E164.test(telefonoNormalizado.value))
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
    email.value = e.email ?? ''
    sexo.value = e.sex ?? NINGUNO
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
  diff('email', email.value.trim(), e.email)
  diff('sex', sinNinguno(sexo.value), e.sex)

  try {
    /*
     * Sin cambios no se avisa de nada: un «actualizado» tras abrir y cerrar sin
     * tocar nada le enseña a la gente a ignorar los avisos.
     */
    if (Object.keys(changes).length > 0) {
      await employeesApi.update(e.id, changes)
      aviso.actualizado(`${firstName.value} ${lastName.value}`)
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
          <UFormField label="Sexo" help="Va al reloj: sin esto su ficha dice «Desconocido».">
            <USelectMenu
              v-model="sexo"
              :items="[
                { label: 'Sin capturar', value: NINGUNO },
                { label: 'Hombre', value: 'H' },
                { label: 'Mujer', value: 'M' },
              ]"
              value-key="value"
              class="w-full"
            />
          </UFormField>
          <!--
            EL CORREO NO LLEGA AL RELOJ, y por eso cambiarlo no pide conciliar.
            El aparato guarda de cada persona su número, su nombre, su vigencia
            y su permiso de puerta; el padrón compara exactamente esos cinco
            campos —`nombre`, `vigencia`, `inicio`, `bloqueo`, `permiso`— y
            ninguno es este. Se puede corregir un correo sin tocar la puerta de
            nadie.
          -->
          <UFormField
            label="Correo"
            :help="
              email.trim() === ''
                ? 'Sin correo no se le puede mandar su alta ni darle acceso a Astra.'
                : undefined
            "
          >
            <UInput v-model="email" type="email" placeholder="nombre@empresa.mx" class="w-full" />
          </UFormField>
          <UFormField label="WhatsApp">
            <UInput v-model="whatsappNumber" placeholder="938 111 0001" class="w-full font-mono" />
            <template #help>
              <!-- Igual que en el alta: se convierte a E.164 y se enseña. -->
              <span v-if="whatsappNumber.trim() === ''">
                Diez dígitos basta: se le pone el +52 solo.
              </span>
              <span v-else-if="telefonoValido" class="text-success">
                Se guardará como <span class="font-mono">{{ telefonoNormalizado }}</span>
              </span>
              <span v-else class="text-warning">No parece un número completo.</span>
            </template>
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
