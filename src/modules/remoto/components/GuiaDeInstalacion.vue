<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

/**
 * «AÑÁDELO A TU PANTALLA DE INICIO», dicho con el gesto de SU teléfono.
 *
 * ══ POR QUÉ HACE FALTA DECIRLO ══
 *
 * Quien acaba de dar de alta su teléfono está en una pestaña del navegador. Si
 * nadie le dice nada, mañana no sabe volver: buscará el correo, y el enlace ya
 * estará gastado. La instalación no es un adorno — es lo que convierte esto en
 * algo que se abre de un toque todos los días.
 *
 * ══ Y POR QUÉ TRES TEXTOS Y NO UNO ══
 *
 * Android y iPhone NO comparten el gesto. En Android el navegador ofrece
 * instalar solo; en iPhone hay que entrar a Compartir y buscar una opción que
 * no se llama «instalar». Un texto genérico —«añádelo a tu pantalla de
 * inicio»— deja a media plantilla dando vueltas por un menú.
 *
 * Y EN UNA COMPUTADORA NO HAY PANTALLA DE INICIO. Desde que se puede checar
 * también desde la computadora, las instrucciones de Android le salían a quien
 * está en un escritorio buscando unos «tres puntos» que no llevan a ninguna
 * parte. Ahí el nombre es otro —instalar, o un favorito— y el gesto también.
 *
 * ══ SI EL NAVEGADOR OFRECE HACERLO, SE PULSA Y YA ══
 *
 * Android dispara `beforeinstallprompt`. Cuando llega, se guarda y se ofrece un
 * botón que instala de verdad, sin instrucciones. Las instrucciones son el
 * repuesto para cuando ese aviso no existe, que es siempre en iPhone.
 */

/** El aviso que Android manda cuando la aplicación se puede instalar. */
interface AvisoDeInstalacion extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

const aviso = ref<AvisoDeInstalacion | null>(null)
const instalada = ref(false)

/**
 * Si esto NO es un teléfono ni una tableta.
 *
 * Se pregunta por el puntero y no por el agente de usuario: `(pointer: fine)`
 * es un ratón o un lápiz, y `(hover: hover)` es un puntero que puede posarse
 * encima sin tocar. Las dos cosas juntas son un escritorio con bastante
 * fiabilidad, y no hay que mantener una lista de nombres de aparatos.
 */
const esEscritorio = computed(
  () => window.matchMedia('(pointer: fine)').matches && window.matchMedia('(hover: hover)').matches,
)

/**
 * Si es un iPhone o un iPad.
 *
 * Se mira el agente de usuario, que es lo único que hay: Safari no expone nada
 * mejor y no dispara ningún aviso de instalación. El iPad moderno se declara
 * como Mac, así que se comprueba además si la pantalla responde al tacto.
 */
const esApple = computed(() => {
  const ua = navigator.userAgent
  const iPadNuevo = /Macintosh/.test(ua) && navigator.maxTouchPoints > 1
  return /iPhone|iPad|iPod/.test(ua) || iPadNuevo
})

onMounted(() => {
  /*
   * YA INSTALADA: no se le dice nada a quien ya lo hizo. `standalone` es lo que
   * declara el manifiesto; `navigator.standalone` es el de Safari, que no
   * implementa esa consulta de medios.
   */
  const comoApp =
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  instalada.value = comoApp

  window.addEventListener('beforeinstallprompt', (e) => {
    // Sin esto, Chrome enseña su propia barra abajo y compite con este bloque.
    e.preventDefault()
    aviso.value = e as AvisoDeInstalacion
  })

  window.addEventListener('appinstalled', () => {
    instalada.value = true
    aviso.value = null
  })
})

async function instalar(): Promise<void> {
  const a = aviso.value
  if (a === null) return
  await a.prompt()
  const { outcome } = await a.userChoice
  /*
   * El aviso SE GASTA al usarlo: el navegador no lo vuelve a dar en esta
   * visita, así que guardarlo sería dejar un botón que ya no hace nada.
   */
  aviso.value = null
  if (outcome === 'accepted') instalada.value = true
}
</script>

<template>
  <div v-if="!instalada" class="border-primary/40 bg-primary/5 space-y-3 border p-4">
    <p class="text-highlighted font-medium">
      {{ esEscritorio ? 'Ténlo a mano' : 'Añádelo a tu pantalla de inicio' }}
    </p>
    <p class="text-muted text-sm">
      Así {{ esEscritorio ? 'entras de un clic' : 'entras de un toque' }} cada día y no tienes que
      buscar este enlace otra vez.
    </p>

    <!--
      El camino corto, cuando el navegador lo ofrece. Lo ofrecen tanto Android
      como Chrome y Edge de escritorio; solo cambia cómo se llama la cosa.
    -->
    <UButton
      v-if="aviso"
      :label="esEscritorio ? 'Instalar' : 'Añadir a la pantalla de inicio'"
      icon="i-lucide-download"
      color="primary"
      @click="instalar"
    />

    <!--
      ESCRITORIO SIN EL AVISO: Safari y Firefox de escritorio no instalan nada.
      Ahí el favorito no es un premio de consolación — es exactamente lo que
      hace falta, porque esta dirección ya es suya y no caduca.
    -->
    <ol v-else-if="esEscritorio" class="text-default space-y-1 text-sm">
      <li>
        1. Busca el icono de <strong>instalar</strong> en la barra de direcciones, a la derecha. Si
        no está, sigue al 2.
      </li>
      <li>
        2. Guarda esta página en <strong>favoritos</strong> con <strong>Ctrl</strong> +
        <strong>D</strong> (o <strong>⌘</strong> + <strong>D</strong> en Mac).
      </li>
      <li>3. Esta dirección ya es tuya: no caduca y te deja checar de un clic.</li>
    </ol>

    <!-- iPhone y iPad: Safari no ofrece nada, y el gesto no se adivina. -->
    <ol v-else-if="esApple" class="text-default space-y-1 text-sm">
      <li>
        1. Toca <strong>Compartir</strong> — el cuadrito con la flecha hacia arriba, abajo en el
        centro.
      </li>
      <li>2. Desliza y toca <strong>Añadir a pantalla de inicio</strong>.</li>
      <li>3. Toca <strong>Añadir</strong>, arriba a la derecha.</li>
    </ol>

    <!-- Android sin el aviso: pasa en Firefox y en navegadores de fabricante. -->
    <ol v-else class="text-default space-y-1 text-sm">
      <li>1. Toca los <strong>tres puntos</strong> de arriba a la derecha.</li>
      <li>
        2. Toca <strong>Añadir a pantalla de inicio</strong> o <strong>Instalar aplicación</strong>.
      </li>
      <li>3. Confirma con <strong>Añadir</strong>.</li>
    </ol>
  </div>
</template>
