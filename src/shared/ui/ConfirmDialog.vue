<script setup lang="ts">
import { ref } from 'vue'
import ApiErrorAlert from '@/shared/ui/ApiErrorAlert.vue'

/**
 * Confirmación para cualquier acción que cambie datos de un solo clic.
 *
 * El borrado tiene su propio diálogo, porque antes hay que preguntar qué
 * cuelga del recurso. Este es para lo demás: desactivar, reactivar y lo que
 * venga. Un botón que muta al primer clic no da ocasión de arrepentirse.
 */
const props = defineProps<{
  title: string
  message: string
  /** Lo que hay que saber antes de aceptar, si es que hay algo. */
  warning?: string
  confirmLabel: string
  confirmIcon?: string
  confirmColor?: 'primary' | 'error' | 'warning' | 'neutral'
  action: () => Promise<void>
}>()
const emit = defineEmits<{ confirmed: [] }>()

const open = defineModel<boolean>('open', { default: false })
const working = ref(false)
const error = ref<Error | null>(null)

async function confirm(): Promise<void> {
  if (working.value) return
  working.value = true
  error.value = null

  try {
    await props.action()
    open.value = false
    emit('confirmed')
  } catch (cause) {
    // El diálogo se queda abierto con el error: cerrarlo escondería el motivo.
    error.value = cause instanceof Error ? cause : new Error(String(cause))
  } finally {
    working.value = false
  }
}
</script>

<template>
  <UModal v-model:open="open" :title="title">
    <template #body>
      <div class="space-y-4">
        <p class="text-muted text-sm">{{ message }}</p>

        <UAlert
          v-if="warning"
          icon="i-lucide-triangle-alert"
          color="warning"
          :description="warning"
        />

        <ApiErrorAlert :error="error" />

        <div class="flex justify-end gap-2 pt-2">
          <UButton label="Cancelar" :disabled="working" @click="open = false" />
          <UButton
            :label="confirmLabel"
            :icon="confirmIcon"
            :color="confirmColor ?? 'primary'"
            :loading="working"
            @click="confirm"
          />
        </div>
      </div>
    </template>
  </UModal>
</template>
