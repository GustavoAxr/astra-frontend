<script setup lang="ts">
import { computed } from 'vue'
import { ApiError, NetworkError } from '@/shared/api/errors'

const props = defineProps<{
  error: Error | null
  /** Campos del formulario, para repartir los `details` que sí les corresponden. */
  fields?: readonly string[]
}>()

const api = computed(() => (props.error instanceof ApiError ? props.error : null))

const title = computed(() => {
  if (props.error === null) return ''
  if (props.error instanceof NetworkError) return 'No se pudo contactar con el servidor'

  const error = api.value
  if (error === null) return 'Algo salió mal'

  // Un 404 se pinta como lo que es: no encontrado. Nunca como falta de permiso
  // — el backend responde 404 también para recursos de otra razón social, así
  // que desde aquí es imposible distinguirlo de un id inexistente.
  if (error.isNotFound) return 'No encontrado'
  if (error.isForbidden) return 'Sin privilegios suficientes'
  if (error.isValidation) return 'Revisa los datos'
  if (error.isServer) return 'El servidor tuvo un problema'
  return 'No se pudo completar'
})

/** Los detalles que no corresponden a ningún campo del formulario. */
const general = computed(() => api.value?.splitDetails(props.fields ?? []).general ?? [])

/**
 * Si el mensaje del servidor dice lo mismo que el título, se enseña uno solo.
 * Un 403 salía como «Sin privilegios suficientes / No tienes los privilegios
 * suficientes», que es la misma frase dos veces.
 */
const showsMessage = computed(() => {
  const message = props.error?.message ?? ''
  return normalize(message) !== normalize(title.value)
})

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9 ]/g, '')
    .split(' ')
    .filter((word) => word.length > 3)
    .join(' ')
}
</script>

<template>
  <UAlert v-if="error" icon="i-lucide-circle-alert" color="error" :title="title">
    <template #description>
      <p v-if="showsMessage">{{ error.message }}</p>

      <ul v-if="general.length > 1" class="mt-1 list-disc pl-4">
        <li v-for="detail in general" :key="detail">{{ detail }}</li>
      </ul>

      <!-- Es lo que permite encontrar esta petición exacta en la bitácora del servidor. -->
      <p v-if="api?.requestId" class="text-dimmed mt-2 font-mono text-xs">
        {{ api.requestId }}
      </p>
    </template>
  </UAlert>
</template>
