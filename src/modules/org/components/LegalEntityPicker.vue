<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import { useLegalEntityFilter } from '@/modules/org/store'
import { mergeQuery } from '@/shared/router/query'

const filter = useLegalEntityFilter()
const route = useRoute()
const router = useRouter()
const { entities, selectedId, loading } = storeToRefs(filter)

onMounted(() => {
  void filter.load()
})

const items = computed(() => [
  // Sin parámetro, la API devuelve todo lo que el usuario alcanza. Esa es la
  // opción por omisión, no un caso raro.
  { label: 'Todas las empresas', value: null as string | null },
  ...entities.value.map((entity) => ({ label: entity.businessName, value: entity.id })),
])

const model = computed({
  get: () => selectedId.value,
  set: (value: string | null) => {
    filter.select(value)

    // En una lista, el filtro vive en la URL: se puede recargar, compartir y
    // deshacer con el botón atrás. Fuera de una lista solo se recuerda para la
    // siguiente. Cambiar de empresa vuelve a la página 1: la 7 de la anterior
    // no tiene por qué existir en esta.
    if (route.meta.acceptsLegalEntityFilter === true) {
      void router.replace({
        query: mergeQuery(route.query, { legalEntityId: value, page: undefined }),
      })
    }
  },
})
</script>

<template>
  <USelectMenu
    v-model="model"
    :items="items"
    value-key="value"
    :loading="loading"
    icon="i-lucide-building-2"
    class="w-56"
  />
</template>
