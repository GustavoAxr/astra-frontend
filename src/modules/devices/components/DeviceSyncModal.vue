<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import ApiErrorAlert from '@/shared/ui/ApiErrorAlert.vue'
import { devicesApi } from '../api'
import type { Device, SyncOutcome } from '../types'

const props = defineProps<{ device: Device }>()
const emit = defineEmits<{ synced: [] }>()

const open = defineModel<boolean>('open', { default: false })

const username = ref('admin')
const password = ref('')
const working = ref(false)
const error = ref<Error | null>(null)

/** Lo acumulado en esta sesión de lectura, no solo la última llamada. */
const total = ref({ batches: 0, inserted: 0, duplicates: 0, unmatched: 0 })
const last = ref<SyncOutcome | null>(null)

const canRead = computed(() => username.value.trim() !== '' && password.value !== '')
const started = computed(() => last.value !== null)

watch(open, (isOpen) => {
  if (isOpen) return
  // La contraseña del equipo se olvida al cerrar: no vive más que lo necesario.
  password.value = ''
  error.value = null
  last.value = null
  total.value = { batches: 0, inserted: 0, duplicates: 0, unmatched: 0 }
})

async function read(): Promise<void> {
  if (!canRead.value || working.value) return
  working.value = true
  error.value = null

  try {
    const outcome = await devicesApi.sync(props.device.id, {
      username: username.value.trim(),
      password: password.value,
    })

    last.value = outcome
    total.value = {
      batches: total.value.batches + outcome.batches,
      inserted: total.value.inserted + outcome.inserted,
      duplicates: total.value.duplicates + outcome.duplicates,
      unmatched: total.value.unmatched + outcome.unmatched,
    }
    emit('synced')
  } catch (cause) {
    error.value = cause instanceof Error ? cause : new Error(String(cause))
  } finally {
    working.value = false
  }
}
</script>

<template>
  <UModal
    v-model:open="open"
    title="Leer las checadas del reloj"
    :description="device.serialNumber"
  >
    <template #body>
      <div class="space-y-4">
        <div class="grid gap-3 sm:grid-cols-2">
          <UFormField label="Usuario del reloj">
            <UInput v-model="username" autocomplete="off" class="w-full" />
          </UFormField>
          <UFormField label="Contraseña del reloj">
            <UInput v-model="password" type="password" autocomplete="off" class="w-full" />
          </UFormField>
        </div>
        <p class="text-dimmed text-xs">
          Son las credenciales del equipo, no las tuyas. No se guardan.
        </p>

        <!--
          La lectura continúa desde donde quedó la vez anterior: la marca de agua
          vive en el servidor. Por eso se puede cerrar esto y volver mañana.
        -->
        <div v-if="started && last" class="bg-elevated/50 space-y-1 rounded-lg p-3 text-sm">
          <p class="text-highlighted font-medium">
            {{ last.watermarkLabel ?? 'Sin marca todavía' }}
          </p>
          <p class="text-muted">
            {{ total.inserted }} checadas registradas · {{ total.unmatched }} de gente sin enrolar ·
            {{ total.duplicates }} repetidas que ya estaban
          </p>
          <p v-if="last.hasMore" class="text-warning text-xs">
            Quedan más eventos en el equipo. Pulsa otra vez para seguir leyendo.
          </p>
          <p v-else class="text-success text-xs">
            No quedan eventos por leer: el equipo está al día.
          </p>
        </div>

        <!--
          Las checadas de gente que no está enrolada no se pierden: esperan en la
          bandeja hasta que se concilie el padrón. Decirlo evita que alguien
          piense que la lectura falló.
        -->
        <UAlert
          v-if="started && total.unmatched > 0 && total.inserted === 0"
          icon="i-lucide-info"
          color="info"
          title="Todas fueron a la bandeja de sin dueño"
          description="Es lo esperado mientras nadie del padrón esté enrolado. En cuanto concilies el padrón del reloj, esas checadas se resuelven solas."
        >
          <!--
            La bandeja ya no está en el menú. Se llega desde aquí, que es
            cuando importa: mencionar un sitio sin dar cómo llegar a él deja a
            quien lee buscando una pantalla que no encuentra.
          -->
          <template #actions>
            <UButton :to="{ name: 'unmatched-punches' }" label="Ver la bandeja" />
          </template>
        </UAlert>

        <ApiErrorAlert :error="error" :fields="['username', 'password']" />

        <div class="flex justify-end gap-2">
          <UButton label="Cerrar" @click="open = false" />
          <UButton
            :label="
              started && last?.hasMore
                ? 'Seguir leyendo'
                : started
                  ? 'Leer otra vez'
                  : 'Leer checadas'
            "
            icon="i-lucide-download"
            :loading="working"
            :disabled="!canRead"
            @click="read"
          />
        </div>
      </div>
    </template>
  </UModal>
</template>
