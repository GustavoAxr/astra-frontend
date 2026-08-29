import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { orgApi } from './api'
import type { LegalEntity } from './types'

/**
 * La razón social elegida en la barra superior.
 *
 * **Esto NO es el alcance de la sesión.** El alcance lo resuelve el servidor en
 * cada petición y lo aplica RLS en PostgreSQL; el navegador no participa. Lo
 * que hay aquí es el valor por omisión de un **filtro de comodidad**, que las
 * listas mandan como `?legalEntityId=<uuid>`, igual que mandarían `search`.
 *
 * `null` significa «todas las que alcanzo», que es lo que devuelve la API
 * cuando el parámetro no viaja. Un id que el usuario no alcanza no da error:
 * da cero filas, porque RLS ya lo descartó.
 */
export const useLegalEntityFilter = defineStore('legalEntityFilter', () => {
  const entities = ref<LegalEntity[]>([])
  const selectedId = ref<string | null>(null)
  const loading = ref(false)

  let loaded: Promise<void> | null = null

  const selected = computed(
    () => entities.value.find((entity) => entity.id === selectedId.value) ?? null,
  )

  function load(): Promise<void> {
    loaded ??= (async () => {
      loading.value = true
      try {
        entities.value = await orgApi.legalEntities()
      } finally {
        loading.value = false
      }
    })()

    return loaded
  }

  function select(id: string | null): void {
    selectedId.value = id
  }

  function reset(): void {
    entities.value = []
    selectedId.value = null
    loaded = null
  }

  return { entities, selectedId, selected, loading, load, select, reset }
})
