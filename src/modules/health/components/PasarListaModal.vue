<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { ApiError } from '@/shared/api/errors'
import { nombreCompleto } from '@/shared/text'
import { useAviso } from '@/shared/ui/aviso'
import { employeesApi } from '@/modules/employees/api'
import type { Employee } from '@/modules/employees/types'
import { healthApi } from '../api'

/**
 * PASAR LISTA CUANDO EL RELOJ ESTÁ MUERTO.
 *
 * Es la red de abajo de la contingencia: quien no trae teléfono, lo trae
 * descargado, o está donde no llega la red. En una planta eso no es una
 * minoría, y sin esta vía la contingencia deja fuera justo a la parte de la
 * plantilla que menos teléfono tiene.
 *
 * VIVE EN LA PANTALLA DE SALUD DE RELOJES, y no en una suya: es la respuesta a
 * lo que se acaba de leer ahí —«este reloj no responde»—. Una pantalla aparte
 * obligaría a saber que existe antes de necesitarla.
 */
const props = defineProps<{ installationId: string; installationName: string }>()
const emit = defineEmits<{ close: [] }>()

const aviso = useAviso()
const abierto = ref(true)

const gente = ref<Employee[]>([])
const elegidos = ref<Set<string>>(new Set())
const busqueda = ref('')
const cargando = ref(true)
const enviando = ref(false)
const error = ref<string | null>(null)

const visibles = computed(() => {
  const q = busqueda.value.trim().toLowerCase()
  if (q === '') return gente.value
  return gente.value.filter((e) =>
    `${e.employeeCode} ${nombreCompleto(e)}`.toLowerCase().includes(q),
  )
})

function alternar(id: string): void {
  const nuevo = new Set(elegidos.value)
  if (nuevo.has(id)) nuevo.delete(id)
  else nuevo.add(id)
  elegidos.value = nuevo
}

onMounted(async () => {
  try {
    // Solo los de ESA base: pasar lista en una nave no puede registrar a quien
    // trabaja en otra, y una lista de toda la empresa lo haría fácil por error.
    const p = await employeesApi.list({
      limit: 100,
      onlyActive: true,
      installationId: props.installationId,
    })
    gente.value = p.data
  } catch (e) {
    error.value = e instanceof ApiError ? e.message : 'No pude traer la plantilla'
  } finally {
    cargando.value = false
  }
})

async function pasarLista(): Promise<void> {
  enviando.value = true
  error.value = null
  try {
    const r = await healthApi.pasarLista(props.installationId, [...elegidos.value])
    aviso.hecho(
      `${r.registradas} ${r.registradas === 1 ? 'persona registrada' : 'personas registradas'}`,
      r.repetidas > 0
        ? `${r.repetidas} ya estaban registradas a esta hora y se dejaron como estaban.`
        : 'Queda firmado con tu nombre y con menos confianza que una checada propia.',
    )
    emit('close')
  } catch (e) {
    aviso.fallo(e, 'pasar lista')
  } finally {
    enviando.value = false
  }
}
</script>

<template>
  <UModal
    v-model:open="abierto"
    title="Pasar lista"
    :description="installationName"
    @update:open="(abierta: boolean) => !abierta && emit('close')"
  >
    <template #body>
      <div class="space-y-4">
        <p class="text-muted text-sm">
          Para quien no puede checar con su teléfono. Queda registrado con tu nombre y con menos
          confianza que una checada propia, porque la persona no tocó nada.
        </p>

        <UInput
          v-model="busqueda"
          icon="i-lucide-search"
          placeholder="Buscar por nombre o clave"
          class="w-full"
        />

        <p v-if="cargando" class="text-muted text-sm">Cargando plantilla…</p>

        <p v-else-if="gente.length === 0" class="text-dimmed text-sm">
          No hay nadie asignado a esta base.
        </p>

        <div v-else class="border-default max-h-80 overflow-y-auto rounded-lg border">
          <button
            v-for="persona in visibles"
            :key="persona.id"
            type="button"
            class="border-default hover:bg-elevated/50 flex w-full items-center gap-3 border-t px-3 py-2 text-left first:border-t-0"
            @click="alternar(persona.id)"
          >
            <UIcon
              :name="elegidos.has(persona.id) ? 'i-lucide-square-check' : 'i-lucide-square'"
              :class="elegidos.has(persona.id) ? 'text-primary size-5' : 'text-dimmed size-5'"
            />
            <span class="text-dimmed w-28 shrink-0 font-mono text-xs">
              {{ persona.employeeCode }}
            </span>
            <span class="text-default truncate text-sm">{{ nombreCompleto(persona) }}</span>
          </button>
        </div>

        <UAlert v-if="error" color="error" icon="i-lucide-circle-alert" :description="error" />

        <div class="flex justify-end gap-2">
          <UButton label="Cancelar" @click="emit('close')" />
          <UButton
            :label="`Registrar ${elegidos.size}`"
            icon="i-lucide-clipboard-check"
            :disabled="elegidos.size === 0 || enviando"
            :loading="enviando"
            @click="pasarLista"
          />
        </div>
      </div>
    </template>
  </UModal>
</template>
