<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import ApiErrorAlert from '@/shared/ui/ApiErrorAlert.vue'
import { timezoneItems, timezoneOffset } from '@/shared/ui/timezones'
import { orgApi } from '../api'
import { taxIdError } from '../tax-id'
import type { LegalEntity } from '../types'

const props = defineProps<{
  /** Cuando viene, se edita; cuando no, se da de alta. */
  entity?: LegalEntity | null
}>()
const emit = defineEmits<{ saved: [] }>()

const open = defineModel<boolean>('open', { default: false })

const FIELDS = ['businessName', 'taxId', 'countryCode', 'timezone'] as const

const businessName = ref('')
const taxId = ref('')
const timezone = ref('America/Mexico_City')
const submitting = ref(false)
const error = ref<Error | null>(null)
const touched = ref(false)

const editing = computed(() => props.entity != null)
const zones = timezoneItems()

const localTaxIdError = computed(() => (touched.value ? taxIdError(taxId.value) : undefined))
const valid = computed(
  () => businessName.value.trim() !== '' && taxIdError(taxId.value) === undefined,
)

watch(
  open,
  (isOpen) => {
    if (!isOpen) return
    businessName.value = props.entity?.businessName ?? ''
    taxId.value = props.entity?.taxId ?? ''
    timezone.value = props.entity?.timezone ?? 'America/Mexico_City'
    error.value = null
    touched.value = false
  },
  { immediate: true },
)

async function submit(): Promise<void> {
  touched.value = true
  if (!valid.value || submitting.value) return

  submitting.value = true
  error.value = null

  try {
    if (props.entity) {
      // Solo lo que cambió: un campo de más devuelve 400.
      const changes: Record<string, string> = {}
      if (businessName.value.trim() !== props.entity.businessName) {
        changes.businessName = businessName.value.trim()
      }
      if (taxId.value.trim().toUpperCase() !== props.entity.taxId) {
        changes.taxId = taxId.value.trim()
      }
      if (timezone.value !== props.entity.timezone) changes.timezone = timezone.value

      if (Object.keys(changes).length > 0) await orgApi.updateLegalEntity(props.entity.id, changes)
    } else {
      await orgApi.createLegalEntity({
        businessName: businessName.value,
        taxId: taxId.value,
        countryCode: 'MX',
        timezone: timezone.value,
      })
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
    :title="editing ? 'Editar razón social' : 'Nueva razón social'"
    :description="
      editing
        ? 'Los cambios se aplican a toda la operación de esta empresa.'
        : 'Una empresa del grupo, con su propio RFC y su propio huso horario.'
    "
  >
    <template #body>
      <form class="space-y-4" @submit.prevent="submit">
        <UFormField label="Razón social" required>
          <UInput
            v-model="businessName"
            placeholder="Biocarbon S.A. de C.V."
            class="w-full"
            autofocus
          />
        </UFormField>

        <UFormField label="RFC" required :error="localTaxIdError">
          <UInput
            v-model="taxId"
            placeholder="BIO250101AB1"
            class="w-full font-mono uppercase"
            @blur="touched = true"
          />
          <template #hint>
            <span class="text-dimmed text-xs">12 moral · 13 física</span>
          </template>
        </UFormField>

        <UFormField label="Zona horaria" required>
          <USelectMenu
            v-model="timezone"
            :items="zones"
            value-key="value"
            searchable
            class="w-full"
          />
          <template #help>
            <span class="text-dimmed text-xs">
              Ahora mismo {{ timezoneOffset(timezone) }} · cada base puede tener la suya
            </span>
          </template>
        </UFormField>

        <ApiErrorAlert :error="error" :fields="FIELDS" />

        <div class="flex justify-end gap-2 pt-2">
          <UButton label="Cancelar" @click="open = false" />
          <UButton
            type="submit"
            :label="editing ? 'Guardar cambios' : 'Dar de alta'"
            icon="i-lucide-check"
            :loading="submitting"
          />
        </div>
      </form>
    </template>
  </UModal>
</template>
