import { ref, shallowRef } from 'vue'

/**
 * Una petición a la vez, con la anterior abortada.
 *
 * Sin el aborto, teclear en un buscador deja seis peticiones en vuelo y la que
 * pinta la tabla es la que conteste última, que no tiene por qué ser la del
 * texto que el usuario ve escrito.
 */
export function useAsync<T>(loader: (signal: AbortSignal) => Promise<T>) {
  const data = shallowRef<T | null>(null)
  const pending = ref(false)
  const error = ref<Error | null>(null)

  /**
   * Si ya se cargó alguna vez. Sirve para distinguir la primera carga —cuando
   * no hay nada que enseñar y toca un esqueleto— de una recarga, en la que los
   * datos viejos siguen siendo válidos y taparlos provoca un parpadeo de toda
   * la pantalla.
   */
  const loaded = ref(false)

  let controller: AbortController | null = null

  async function run(): Promise<void> {
    controller?.abort()
    const own = new AbortController()
    controller = own

    pending.value = true
    error.value = null

    try {
      const result = await loader(own.signal)
      if (own.signal.aborted) return
      data.value = result
      loaded.value = true
    } catch (cause) {
      // Un aborto es una decisión nuestra: ni es error ni se pinta.
      if (own.signal.aborted) return
      error.value = cause instanceof Error ? cause : new Error(String(cause))
    } finally {
      if (controller === own) {
        controller = null
        pending.value = false
      }
    }
  }

  return { data, pending, error, loaded, run }
}
