<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import ApiErrorAlert from '@/shared/ui/ApiErrorAlert.vue'
import type { LegalEntity } from '../types'

/**
 * Copiar una entrada del catálogo a otras razones sociales.
 *
 * POR QUÉ NO SE COPIA EL CÓDIGO TAL CUAL
 * El código lleva dentro el trozo de la empresa —`PUE-ADM-01`—, así que
 * copiarlo literal metería un `ADM` dentro del catálogo de Biocarbon. Se
 * recalcula para cada destino, y se enseña ANTES de crear nada: quien lo va a
 * hacer tiene que poder ver qué códigos van a quedar.
 */
const props = defineProps<{
  /** «puesto» o «departamento», para los textos. */
  resourceKind: string
  sourceName: string
  sourceEntityId: string
  entities: LegalEntity[]
  /**
   * El código NO viaja: lo pone el servidor al crear, con el trozo de la
   * empresa destino y su propio consecutivo. Antes se previsualizaba aquí y
   * era una promesa que el navegador no podía cumplir — calculaba contra la
   * lista que tenía cargada, no contra la tabla.
   */
  duplicate: (entityId: string) => Promise<unknown>
}>()
const emit = defineEmits<{ done: [] }>()

const open = defineModel<boolean>('open', { default: false })

const targets = ref<string[]>([])
const working = ref(false)
const error = ref<Error | null>(null)
/** Lo que falló, empresa por empresa. Copiar a tres y fallar en una no es fallar. */
const fallos = ref<string[]>([])
const creados = ref(0)

// La empresa de origen no se ofrece: ya lo tiene, y crearlo otra vez chocaría
// contra el código único.
const destinos = computed(() =>
  props.entities.filter((e) => e.id !== props.sourceEntityId && e.isActive),
)

const previsualizacion = computed(() =>
  targets.value.map((id) => ({
    id,
    nombre: destinos.value.find((e) => e.id === id)?.businessName ?? '—',
  })),
)

watch(
  open,
  async (abierto) => {
    if (!abierto) {
      targets.value = []
      fallos.value = []
      creados.value = 0
      error.value = null
      return
    }
  },
  { immediate: true },
)

async function confirmar(): Promise<void> {
  if (targets.value.length === 0 || working.value) return
  working.value = true
  error.value = null
  fallos.value = []
  creados.value = 0

  /*
   * Una por una y sin cortar al primer fallo: si el catálogo de una empresa ya
   * tiene ese nombre, eso no es razón para no copiarlo a las otras dos. Al
   * final se dice exactamente qué entró y qué no.
   */
  for (const destino of previsualizacion.value) {
    try {
      await props.duplicate(destino.id)
      creados.value++
    } catch (cause) {
      const detalle = cause instanceof Error ? cause.message : String(cause)
      fallos.value.push(`${destino.nombre}: ${detalle}`)
    }
  }

  working.value = false
  emit('done')
  if (fallos.value.length === 0) open.value = false
}
</script>

<template>
  <UModal
    v-model:open="open"
    :title="`Copiar ${resourceKind} a otras razones sociales`"
    :description="`Se creará una copia de «${sourceName}» en cada una, con su propio código.`"
  >
    <template #body>
      <div class="space-y-3">
        <p v-if="!destinos.length" class="text-muted text-sm">
          No hay otras razones sociales activas a las que copiarlo.
        </p>

        <template v-else>
          <UFormField label="Copiar a" required>
            <USelectMenu
              v-model="targets"
              :items="destinos.map((e) => ({ label: e.businessName, value: e.id }))"
              value-key="value"
              multiple
              placeholder="Elige una o varias"
              class="w-full"
            />
          </UFormField>

          <!-- Los códigos, a la vista antes de crear nada. -->
          <div v-if="previsualizacion.length" class="border-default rounded-lg border p-3">
            <p class="text-dimmed mb-2 text-xs">Se creará una copia en:</p>
            <div
              v-for="d in previsualizacion"
              :key="d.id"
              class="flex items-baseline justify-between gap-3 py-0.5 text-sm"
            >
              <span class="truncate">{{ d.nombre }}</span>
              <span class="text-dimmed text-xs">código automático</span>
            </div>
          </div>

          <div v-if="fallos.length" class="space-y-1">
            <p class="text-sm">
              Se crearon {{ creados }} de {{ creados + fallos.length }}. No se pudo en:
            </p>
            <p v-for="f in fallos" :key="f" class="text-error text-sm">{{ f }}</p>
          </div>

          <ApiErrorAlert :error="error" />
        </template>

        <div class="flex justify-end gap-2">
          <UButton :label="fallos.length ? 'Cerrar' : 'Cancelar'" @click="open = false" />
          <UButton
            v-if="destinos.length"
            icon="i-lucide-copy"
            :label="`Copiar a ${targets.length || ''} ${targets.length === 1 ? 'razón social' : 'razones sociales'}`"
            :disabled="targets.length === 0"
            :loading="working"
            @click="confirmar"
          />
        </div>
      </div>
    </template>
  </UModal>
</template>
