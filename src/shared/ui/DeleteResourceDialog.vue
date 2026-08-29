<script setup lang="ts">
import { ref, watch } from 'vue'
import ApiErrorAlert from '@/shared/ui/ApiErrorAlert.vue'
import type { Dependencies } from '@/modules/org/types'

/**
 * Borrado en dos tiempos: primero se pregunta qué cuelga del recurso, y solo
 * después se ofrece borrar.
 *
 * Dos listas que significan cosas distintas:
 * · `bloqueos` impiden el borrado. El botón queda **deshabilitado y a la
 *   vista**, con el motivo: esconderlo dejaría a la persona sin saber por qué
 *   no puede.
 * · `arrastra` no impide nada y se lo lleva por delante. Por eso se enumera en
 *   la confirmación: es lo que se va a perder sin haberlo pedido.
 *
 * Y borrar **no** desactiva. Si el servidor dice que no, se pinta su mensaje;
 * no se convierte la petición en otra cosa a espaldas de quien la hizo.
 */
const props = defineProps<{
  title: string
  resourceName: string
  /** Cómo llamar al recurso en los textos: «razón social», «base»… */
  resourceKind: string
  loadDependencies: () => Promise<Dependencies>
  remove: () => Promise<void>
}>()
const emit = defineEmits<{ deleted: [] }>()

const open = defineModel<boolean>('open', { default: false })

const dependencies = ref<Dependencies | null>(null)
const loading = ref(false)
const deleting = ref(false)
const error = ref<Error | null>(null)

const summarize = (items: { que: string; cuantos: number }[]): string =>
  items.map((item) => `${item.cuantos} ${item.que}`).join(', ')

/*
 * `immediate` es obligatorio aquí y no un detalle: el diálogo se monta con
 * `v-if` cuando `open` YA vale true, así que un watcher normal vigilaría un
 * cambio que ocurrió antes de que el componente existiera. Sin esto, las
 * dependencias no se piden nunca y el botón de borrar se queda deshabilitado
 * para siempre, sin decir por qué.
 */
watch(
  open,
  async (isOpen) => {
    if (!isOpen) {
      dependencies.value = null
      error.value = null
      return
    }

    loading.value = true
    error.value = null
    try {
      dependencies.value = await props.loadDependencies()
    } catch (cause) {
      error.value = cause instanceof Error ? cause : new Error(String(cause))
    } finally {
      loading.value = false
    }
  },
  { immediate: true },
)

async function confirm(): Promise<void> {
  if (deleting.value) return
  deleting.value = true
  error.value = null

  try {
    await props.remove()
    open.value = false
    emit('deleted')
  } catch (cause) {
    error.value = cause instanceof Error ? cause : new Error(String(cause))
  } finally {
    deleting.value = false
  }
}
</script>

<template>
  <UModal v-model:open="open" :title="title">
    <template #body>
      <div class="space-y-4">
        <p class="text-muted text-sm">
          <span class="text-highlighted font-medium">{{ resourceName }}</span>
        </p>

        <p v-if="loading" class="text-muted text-sm">Revisando qué depende de esto…</p>

        <template v-else-if="dependencies">
          <!-- Impide borrar: se dice qué y cuánto, no solo que no se puede. -->
          <UAlert
            v-if="!dependencies.puedeBorrarse"
            icon="i-lucide-ban"
            color="error"
            title="No se puede borrar todavía"
          >
            <template #description>
              <p>Hay cosas colgando de esta {{ resourceKind }}:</p>
              <ul class="mt-1 list-disc pl-4">
                <li v-for="block in dependencies.bloqueos" :key="block.que">
                  {{ block.cuantos }} {{ block.que }}
                </li>
              </ul>
              <p class="mt-2">
                Quítalas primero, o desactiva la {{ resourceKind }} si lo que quieres es conservar
                su historia.
              </p>
            </template>
          </UAlert>

          <template v-else>
            <UAlert
              v-if="dependencies.arrastra.length > 0"
              icon="i-lucide-triangle-alert"
              color="warning"
              title="Esto se va a borrar también"
            >
              <template #description>
                <ul class="list-disc pl-4">
                  <li v-for="drag in dependencies.arrastra" :key="drag.que">
                    {{ drag.cuantos }} {{ drag.que }}
                  </li>
                </ul>
              </template>
            </UAlert>

            <p class="text-muted text-sm">
              Esta acción no se puede deshacer.
              <template v-if="dependencies.arrastra.length === 0">
                No hay nada más colgando.
              </template>
            </p>
          </template>
        </template>

        <ApiErrorAlert :error="error" />

        <div class="flex justify-end gap-2 pt-2">
          <UButton label="Cancelar" @click="open = false" />
          <UButton
            label="Borrar"
            icon="i-lucide-trash-2"
            color="error"
            :loading="deleting"
            :disabled="loading || dependencies?.puedeBorrarse !== true"
            :title="
              dependencies?.puedeBorrarse === false
                ? `Bloqueado por: ${summarize(dependencies.bloqueos)}`
                : undefined
            "
            @click="confirm"
          />
        </div>
      </div>
    </template>
  </UModal>
</template>
