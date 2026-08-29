<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'

/**
 * UN solo globo para toda la aplicación: el texto completo de lo que esté
 * recortado, al pasar el ratón y sin espera.
 *
 * POR QUÉ NO SE ENVUELVE CADA COSA EN SU `UTooltip`
 * Sería lo natural, pero no se puede saber al escribir la plantilla si un texto
 * se va a recortar: depende del ancho de la ventana, del contenido y del
 * idioma. Habría que envolver todo «por si acaso» y acabaríamos con un globo en
 * textos que se leen enteros.
 *
 * Y hay un impedimento técnico además del criterio: `UTooltip` monta su
 * disparador con `as-child`, que exige UN elemento raíz. `USelectMenu` tiene
 * TRES nodos raíz, así que no se deja envolver — el mismo motivo por el que
 * antes falló la directiva.
 *
 * CÓMO FUNCIONA
 * `UTooltip` admite `reference`: un elemento externo al que anclarse. Así se
 * monta un único globo y se le va diciendo a qué se ancla y qué dice, según lo
 * que haya debajo del ratón. Cero cambios en las plantillas y sirve para
 * cualquier cosa que se recorte: un desplegable, una celda, un título.
 */

/** El que se está señalando. `null` = no hay nada recortado bajo el ratón. */
const ancla = ref<HTMLElement | null>(null)
const texto = ref('')
const abierto = ref(false)

/**
 * `scrollWidth > clientWidth` significa que el contenido mide más que su hueco,
 * que es justo lo que hace `truncate` al poner los puntos suspensivos. El píxel
 * de holgura evita que el redondeo del navegador delate como recortado un texto
 * que se ve entero.
 */
const recortado = (el: HTMLElement): boolean => el.scrollWidth > el.clientWidth + 1

function alSeñalar(evento: MouseEvent): void {
  const destino = evento.target
  if (!(destino instanceof HTMLElement)) return
  if (destino === ancla.value) return

  // Un `title` escrito a mano manda: dice algo que el texto visible no dice, y
  // taparlo con el propio texto sería perder información.
  if (destino.title || !recortado(destino)) {
    cerrar()
    return
  }

  const completo = destino.textContent?.trim()
  if (!completo) {
    cerrar()
    return
  }

  ancla.value = destino
  texto.value = completo
  abierto.value = true
}

function cerrar(): void {
  abierto.value = false
  ancla.value = null
}

onMounted(() => {
  // En captura para verlo aunque alguien detenga la propagación por el camino;
  // pasivo porque solo lee y nunca cancela.
  document.addEventListener('mouseover', alSeñalar, { capture: true, passive: true })
  // Al desplazar, el ancla se va de sitio y el globo se quedaría flotando.
  document.addEventListener('scroll', cerrar, { capture: true, passive: true })
})

onBeforeUnmount(() => {
  document.removeEventListener('mouseover', alSeñalar, { capture: true })
  document.removeEventListener('scroll', cerrar, { capture: true })
})
</script>

<template>
  <!--
    `delay-duration` en cero: el globo aparece al instante. La espera del
    navegador con el `title` nativo era casi un segundo, y para leer un nombre
    cortado eso es una eternidad.

    El disparador va vacío a propósito: quien manda es `reference`. El `span`
    está porque `as-child` necesita un elemento donde posarse.
  -->
  <UTooltip
    v-if="ancla"
    :reference="ancla"
    :text="texto"
    :open="abierto"
    :delay-duration="0"
    :disable-closing-trigger="true"
  >
    <span class="sr-only" />
  </UTooltip>
</template>
