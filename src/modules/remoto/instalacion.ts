import { ref, type Ref } from 'vue'

/**
 * EL AVISO DE INSTALACIÓN SE RECOGE AL ARRANCAR, NO CUANDO SE PINTA EL BOTÓN.
 *
 * ══ EL FALLO QUE ARREGLA ══
 *
 * El navegador dispara `beforeinstallprompt` UNA vez, temprano, en cuanto
 * decide que la página se puede instalar. Si en ese instante no hay nadie
 * escuchando, el aviso se pierde y no vuelve.
 *
 * Y no había nadie: el oyente estaba dentro de `GuiaDeInstalacion`, un
 * componente que solo se monta cuando ya se está en la pantalla de checar —
 * después de dar de alta el equipo, y bastantes segundos después de que el
 * navegador haya decidido—. Resultado: el botón «Instalar» no aparecía nunca y
 * solo quedaban las instrucciones a mano, que es el repuesto, no el camino.
 *
 * Aquí se escucha desde que arranca la aplicación. El aviso queda guardado y el
 * componente lo encuentra ya hecho cuando le toca pintarse.
 *
 * ══ POR QUÉ UN MÓDULO Y NO UN COMPOSABLE ══
 *
 * Porque el estado tiene que ser UNO para toda la aplicación y sobrevivir a que
 * el componente se monte y se desmonte. Un `ref` de módulo es exactamente eso.
 */

/** El aviso que el navegador manda cuando la aplicación se puede instalar. */
export interface AvisoDeInstalacion extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export const avisoDeInstalacion: Ref<AvisoDeInstalacion | null> = ref(null)

/** Si la página ya se está viendo COMO aplicación instalada. */
export const instalada = ref(false)

/**
 * Se llama una vez, desde `main.ts`, antes de montar nada.
 *
 * `preventDefault` evita que Chrome pinte además su propia barra abajo, que
 * competiría con el bloque de la pantalla.
 */
export function escucharInstalacion(): void {
  instalada.value =
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    avisoDeInstalacion.value = e as AvisoDeInstalacion
  })

  window.addEventListener('appinstalled', () => {
    instalada.value = true
    avisoDeInstalacion.value = null
  })
}

/**
 * Lanza el diálogo del navegador. Devuelve si aceptó.
 *
 * El aviso SE GASTA al usarlo: el navegador no lo vuelve a dar en esta visita,
 * así que guardarlo sería dejar un botón que ya no hace nada.
 */
export async function instalar(): Promise<boolean> {
  const a = avisoDeInstalacion.value
  if (a === null) return false
  await a.prompt()
  const { outcome } = await a.userChoice
  avisoDeInstalacion.value = null
  if (outcome === 'accepted') instalada.value = true
  return outcome === 'accepted'
}
