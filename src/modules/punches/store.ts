import { ref } from 'vue'
import { defineStore } from 'pinia'
import { punchesApi } from './api'

/**
 * El contador del menú.
 *
 * Vive en un store y no en la pantalla porque el aviso solo sirve si se ve
 * desde cualquier sitio: si sube, alguien está trabajando sin quedar
 * registrado, y eso no se descubre entrando a mirar la bandeja.
 */
export const useUnmatchedCount = defineStore('unmatchedCount', () => {
  const total = ref<number | null>(null)

  async function refresh(): Promise<void> {
    try {
      total.value = (await punchesApi.unmatchedCount()).total
    } catch {
      // Un contador que falla no debe estropear la pantalla que lo enseña.
      total.value = null
    }
  }

  function reset(): void {
    total.value = null
  }

  return { total, refresh, reset }
})
