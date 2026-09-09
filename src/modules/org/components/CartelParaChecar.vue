<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import QRCode from 'qrcode'
import type { Installation } from '../types'

/**
 * EL PAPEL QUE SE PEGA EN LA PUERTA.
 *
 * El QR no es más que el enlace a la pantalla del teléfono. Se dibuja aquí y no
 * en el servidor porque no hay nada que guardar: es una función del enlace, y
 * el enlace ya lo sabe esta pantalla.
 *
 * DEBAJO VA EL ENLACE ESCRITO, y no es adorno. En una nave hay cámaras que no
 * enfocan, pantallas rotas y gente sin lector de QR; sin la dirección tecleable
 * esas personas se quedan fuera del sistema el día que más falta hace.
 */
const props = defineProps<{ installation: Installation }>()

const lienzo = ref<HTMLCanvasElement | null>(null)

/**
 * LA DIRECCIÓN DEL CARTEL ES EDITABLE, Y SIEMPRE.
 *
 * Por omisión se toma del navegador, que acierta cuando quien imprime abrió
 * Astra por la misma dirección que va a usar el teléfono. Pero eso falla en el
 * caso más común de todos: alguien trabajando en `localhost`. Un QR que dice
 * `localhost` manda al teléfono A SÍ MISMO, y ahí no hay nada escuchando.
 *
 * No se resuelve solo desde el navegador —una página no puede saber la IP de la
 * máquina en la red— así que se pregunta. Y se queda guardado: la dirección por
 * la que se llega a Astra cambia una vez cada mucho, y volver a teclearla cada
 * vez que se rompe un reloj sería cobrarle a la urgencia un trabajo de
 * instalación.
 *
 * Se recuerda en este navegador, no en el servidor, porque es un dato de CÓMO
 * SE LLEGA desde aquí: la misma Astra puede verse por IP desde la planta y por
 * nombre desde la oficina, y ninguna de las dos respuestas es la correcta para
 * la otra.
 */
const CLAVE = 'astra.contingencia.direccion'

const direccion = ref(
  localStorage.getItem(CLAVE) ?? window.location.origin,
)
const editando = ref(false)

/** Sin barra final ni espacios: se concatena una ruta justo detrás. */
const base = computed(() => direccion.value.trim().replace(/\/+$/, ''))

const enElTelefono = computed(() => {
  try {
    return new URL(base.value).hostname
  } catch {
    return ''
  }
})

/**
 * `localhost` y `127.0.0.1` son la única dirección que con seguridad NO sirve:
 * en el teléfono significan el teléfono. Se avisa en vez de impedirlo, porque
 * en un quiosco con el navegador en la misma máquina sí valdría.
 */
const seVaAlPropioTelefono = computed(
  () => enElTelefono.value === 'localhost' || enElTelefono.value === '127.0.0.1',
)

/**
 * Un cartel en `http://` produce checadas imposibles: el teléfono no entrega la
 * ubicación fuera de un origen seguro, y sin ubicación no hay checada. Se avisa
 * AQUÍ, antes de imprimir y pegar el papel, y no cuando hay una fila de gente
 * delante de un QR que no funciona.
 */
const sinCandado = computed(
  () => base.value.startsWith('http://') && !seVaAlPropioTelefono.value,
)

const enlace = computed(
  () => `${base.value}/checar/${props.installation.legalEntityId}/${props.installation.id}`,
)

function guardarDireccion(): void {
  localStorage.setItem(CLAVE, base.value)
  direccion.value = base.value
  editando.value = false
}

async function dibujar(): Promise<void> {
  if (!lienzo.value) return
  await QRCode.toCanvas(lienzo.value, enlace.value, {
    width: 260,
    margin: 1,
    // Negro sobre blanco fijo, sin seguir el tema: esto se imprime, y un QR
    // claro sobre fondo oscuro sale de la impresora como un cuadro negro.
    color: { dark: '#000000', light: '#ffffff' },
    errorCorrectionLevel: 'M',
  })
}

onMounted(dibujar)
watch(enlace, dibujar)

const copiado = ref(false)
function imprimir(): void {
  window.print()
}

async function copiar(): Promise<void> {
  await navigator.clipboard.writeText(enlace.value)
  copiado.value = true
  window.setTimeout(() => (copiado.value = false), 2000)
}
</script>

<template>
  <div class="space-y-3">
    <div
      class="cartel mx-auto flex w-full max-w-xs flex-col items-center gap-3 rounded-xl bg-white p-5 text-center"
    >
      <p class="text-lg font-bold text-black">Checa aquí</p>
      <p class="text-xs text-neutral-600">
        {{ installation.name }}
      </p>
      <canvas ref="lienzo" class="rounded" />
      <p class="text-xs break-all text-neutral-500">{{ enlace }}</p>
      <p class="text-xs text-neutral-600">Escanea y teclea tu número de empleado</p>
    </div>

    <div class="no-imprimir mx-auto max-w-md space-y-2">
      <UAlert
        v-if="seVaAlPropioTelefono"
        color="warning"
        icon="i-lucide-triangle-alert"
        title="Este QR no va a funcionar en un teléfono"
        description="Dice «localhost», que en el teléfono significa el propio teléfono. Pon la dirección por la que se llega a Astra desde la red."
      />

      <UAlert
        v-else-if="sinCandado"
        color="warning"
        icon="i-lucide-shield-alert"
        title="Este QR no va a poder leer la ubicación"
        description="La dirección empieza por http. Los teléfonos solo entregan la posición en páginas con candado (https), y sin posición no se puede registrar la checada."
      />

      <div v-if="editando" class="flex gap-2">
        <UInput
          v-model="direccion"
          placeholder="http://192.168.1.10:5173"
          class="flex-1"
          @keyup.enter="guardarDireccion"
        />
        <UButton label="Guardar" icon="i-lucide-check" size="sm" @click="guardarDireccion" />
      </div>
      <div v-else class="flex items-center justify-center gap-2">
        <span class="text-dimmed text-xs">Los teléfonos entran por {{ enElTelefono }}</span>
        <UButton
          label="Cambiar dirección"
          icon="i-lucide-pencil"
          size="xs"
          @click="editando = true"
        />
      </div>
    </div>

    <div class="no-imprimir flex flex-wrap justify-center gap-2">
      <UButton
        :label="copiado ? 'Copiado' : 'Copiar enlace'"
        :icon="copiado ? 'i-lucide-check' : 'i-lucide-copy'"
        size="xs"
        @click="copiar"
      />
      <UButton
        label="Imprimir"
        icon="i-lucide-printer"
        size="xs"
        @click="imprimir"
      />
    </div>
  </div>
</template>

<style scoped>
/*
  Al imprimir se va todo menos el cartel. Sin esto sale la barra lateral, el
  menú y media pantalla de la aplicación alrededor de un QR de tres centímetros.
*/
@media print {
  .no-imprimir {
    display: none;
  }

  .cartel {
    max-width: none;
    padding: 4rem;
  }
}
</style>
