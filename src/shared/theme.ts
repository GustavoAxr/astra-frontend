import { computed, watchEffect } from 'vue'
import { useColorMode } from '@vueuse/core'

/**
 * Claro, oscuro o lo que diga el sistema.
 *
 * POR QUÉ SE APOYA EN VueUse Y NO SE ESCRIBE A MANO
 * El plugin de Nuxt UI ya llama a `useDark()` al arrancar —por eso la interfaz
 * seguía al sistema sin que nadie lo hubiera programado—, y `useDark` no es más
 * que `useColorMode` con `modes: { dark: 'dark', light: '' }`. Montar un
 * interruptor aparte crearía dos verdades peleándose por la clase del `<html>`.
 * Esto usa **las mismas opciones y la misma clave de almacenamiento**, así que
 * los dos escriben lo mismo y se mantienen sincronizados.
 *
 * TRES ESTADOS, NO DOS
 * «Sistema» no es lo mismo que «claro»: quien tiene el equipo en automático
 * espera que la aplicación cambie sola al anochecer. Con un interruptor de dos
 * posiciones esa opción se pierde en cuanto alguien lo toca una vez.
 */
export type Theme = 'auto' | 'light' | 'dark'

export const THEMES: { value: Theme; label: string; icon: string }[] = [
  { value: 'light', label: 'Claro', icon: 'i-lucide-sun' },
  { value: 'dark', label: 'Oscuro', icon: 'i-lucide-moon' },
  { value: 'auto', label: 'El del sistema', icon: 'i-lucide-monitor' },
]

export function useTheme() {
  const mode = useColorMode({
    // Idénticas a las de `useDark()`, que es lo que instala Nuxt UI.
    modes: { dark: 'dark', light: '' },
    // Sin esto, `mode.value` resolvería «auto» a claro u oscuro y no habría
    // forma de saber si la persona eligió seguir al sistema.
    emitAuto: true,
  })

  const current = computed<Theme>({
    get: () => mode.value as Theme,
    set: (value) => {
      mode.value = value
    },
  })

  /** Qué se está viendo de verdad, con «auto» ya resuelto. */
  const resolved = computed<'light' | 'dark'>(() =>
    current.value === 'auto' ? mode.system.value : current.value,
  )

  /*
   * `color-scheme` no es decorativo: es lo que hace que el navegador pinte con
   * el tema correcto lo que NO controlamos —el calendario de los campos de
   * fecha, las barras de desplazamiento, los menús nativos—. Sin esto, en tema
   * oscuro los selectores de fecha, que en esta aplicación hay por todas
   * partes, se abren en blanco.
   */
  watchEffect(() => {
    if (typeof document === 'undefined') return
    document.documentElement.style.colorScheme = resolved.value
  })

  const icon = computed(
    () => THEMES.find((t) => t.value === current.value)?.icon ?? 'i-lucide-monitor',
  )

  return { current, resolved, icon }
}
