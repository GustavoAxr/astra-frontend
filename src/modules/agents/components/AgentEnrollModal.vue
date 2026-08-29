<script setup lang="ts">
import { ref, watch } from 'vue'
import ApiErrorAlert from '@/shared/ui/ApiErrorAlert.vue'
import type { Installation } from '@/modules/org/types'
import { agentsApi } from '../api'
import type { AgentEnrollment } from '../types'

defineProps<{ installations: Installation[] }>()
const emit = defineEmits<{ enrolled: [] }>()

const open = ref(false)
const installationId = ref('')
const agentCode = ref('')
const submitting = ref(false)
const error = ref<Error | null>(null)

/**
 * El secreto vive en un `ref` mientras el modal está abierto y desaparece al
 * cerrarlo. **No va a `localStorage` ni a la consola**: una credencial
 * recuperable acaba en un correo, en un ticket o en una captura de pantalla.
 */
const enrollment = ref<AgentEnrollment | null>(null)
const copied = ref(false)

async function submit(): Promise<void> {
  if (submitting.value) return
  submitting.value = true
  error.value = null

  try {
    enrollment.value = await agentsApi.enroll({
      installationId: installationId.value,
      agentCode: agentCode.value,
    })
    emit('enrolled')
  } catch (cause) {
    error.value = cause instanceof Error ? cause : new Error(String(cause))
  } finally {
    submitting.value = false
  }
}

async function copy(): Promise<void> {
  if (!enrollment.value) return
  await navigator.clipboard.writeText(enrollment.value.secret)
  copied.value = true
}

watch(open, (isOpen) => {
  if (isOpen) return
  installationId.value = ''
  agentCode.value = ''
  error.value = null
  copied.value = false
  enrollment.value = null
})
</script>

<template>
  <UModal v-model:open="open" title="Dar de alta un agente de sitio">
    <UButton icon="i-lucide-plus" label="Dar de alta" />

    <template #body>
      <!-- Antes de crearlo -->
      <div v-if="!enrollment" class="space-y-4">
        <UFormField label="Instalación">
          <USelectMenu
            v-model="installationId"
            :items="installations.map((i) => ({ label: `${i.code} · ${i.name}`, value: i.id }))"
            value-key="value"
            placeholder="¿Dónde va a correr el agente?"
            class="w-full"
          />
        </UFormField>

        <UFormField label="Código del agente" hint="Mayúsculas, dígitos y guiones">
          <UInput v-model="agentCode" placeholder="AG-BIO-SEDE-02" class="w-full" />
        </UFormField>

        <ApiErrorAlert :error="error" :fields="['installationId', 'agentCode']" />

        <div class="flex justify-end gap-2">
          <UButton label="Cancelar" @click="open = false" />
          <UButton
            label="Dar de alta"
            icon="i-lucide-check"
            :loading="submitting"
            :disabled="installationId === '' || agentCode.trim() === ''"
            @click="submit"
          />
        </div>
      </div>

      <!-- Después: el secreto, una sola vez -->
      <div v-else class="space-y-4">
        <UAlert
          icon="i-lucide-key-round"
          color="warning"
          title="Copia el secreto ahora. No se vuelve a mostrar."
          description="Si se pierde, no hay forma de recuperarlo: se revoca este agente y se da de alta otro."
        />

        <div class="bg-elevated rounded-lg p-3">
          <p class="font-mono text-sm break-all select-all">{{ enrollment.secret }}</p>
        </div>

        <p v-if="enrollment.aviso" class="text-muted text-sm">{{ enrollment.aviso }}</p>

        <div class="flex items-center justify-end gap-2">
          <span v-if="copied" class="text-muted mr-auto text-sm">Copiado al portapapeles.</span>
          <UButton
            :icon="copied ? 'i-lucide-check' : 'i-lucide-copy'"
            :label="copied ? 'Copiado' : 'Copiar'"
            @click="copy"
          />
          <UButton label="Ya lo guardé" @click="open = false" />
        </div>
      </div>
    </template>
  </UModal>
</template>
