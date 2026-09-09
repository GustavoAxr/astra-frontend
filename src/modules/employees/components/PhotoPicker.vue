<script setup lang="ts">
import { computed, ref } from 'vue'

/**
 * LA FOTO DEL EXPEDIENTE.
 *
 * PARA QUÉ SIRVE HOY: para nada en el reloj de la nave, que declara
 * `face: null` y no tiene cámara de reconocimiento. Se guarda para el día que
 * entre un equipo que sí lo tenga, porque volver a pedirle una foto a mil
 * trescientas personas ese día no es un plan.
 *
 * SE REDUCE AQUÍ, ANTES DE SUBIRLA. Una foto de teléfono son tres o cuatro
 * megas y un rostro se reconoce de sobra con 640 píxeles de lado largo. Subir
 * el original sería llenar la base de píxeles que nadie va a mirar y hacer que
 * el alta tarde en una red de nave industrial.
 *
 * NO ES UN DATO BIOMÉTRICO: la plantilla facial —el vector que compara el
 * aparato— la fabrica el equipo y se queda dentro de él. Aquí hay una foto.
 */
const modelo = defineModel<string | null>({ default: null })

const props = withDefaults(defineProps<{ nombre?: string; disabled?: boolean }>(), {
  nombre: '',
  disabled: false,
})

/** Lado largo al que se reduce. Un rostro no necesita más. */
const LADO = 640
/** Por encima de esto la cámara está mandando algo que no es una foto de carnet. */
const MAXIMO_ORIGINAL = 12 * 1024 * 1024

const entrada = ref<HTMLInputElement | null>(null)
const error = ref('')
const trabajando = ref(false)

const iniciales = computed(() =>
  props.nombre
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join(''),
)

/**
 * Reduce y reencoda a JPEG.
 *
 * Se dibuja en un lienzo y se saca de ahí: eso además QUITA LOS METADATOS de
 * la foto original —dónde y cuándo se tomó, con qué teléfono—, que no tenemos
 * por qué guardar de nadie y que un JPEG de móvil trae siempre.
 */
async function encoger(archivo: File): Promise<string> {
  const bitmap = await createImageBitmap(archivo)
  const escala = Math.min(1, LADO / Math.max(bitmap.width, bitmap.height))

  const lienzo = document.createElement('canvas')
  lienzo.width = Math.round(bitmap.width * escala)
  lienzo.height = Math.round(bitmap.height * escala)

  const ctx = lienzo.getContext('2d')
  if (!ctx) throw new Error('El navegador no pudo procesar la imagen.')
  ctx.drawImage(bitmap, 0, 0, lienzo.width, lienzo.height)
  bitmap.close()

  return lienzo.toDataURL('image/jpeg', 0.85)
}

async function elegir(evento: Event): Promise<void> {
  const archivo = (evento.target as HTMLInputElement).files?.[0]
  if (!archivo) return

  error.value = ''
  trabajando.value = true
  try {
    if (!archivo.type.startsWith('image/')) {
      throw new Error('Eso no es una imagen.')
    }
    if (archivo.size > MAXIMO_ORIGINAL) {
      throw new Error('La imagen pasa de 12 MB. Usa una foto normal de cámara.')
    }
    modelo.value = await encoger(archivo)
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : String(cause)
  } finally {
    trabajando.value = false
    // Se limpia para que elegir OTRA VEZ el mismo archivo vuelva a disparar el
    // evento: sin esto, corregir un recorte y volver a subirlo no hace nada.
    if (entrada.value) entrada.value.value = ''
  }
}
</script>

<template>
  <div class="flex items-start gap-4">
    <div
      class="bg-elevated/50 ring-default flex size-24 shrink-0 items-center justify-center overflow-hidden rounded-lg ring-1"
    >
      <img v-if="modelo" :src="modelo" alt="" class="size-full object-cover" />
      <span v-else-if="iniciales" class="text-dimmed text-xl font-medium">{{ iniciales }}</span>
      <UIcon v-else name="i-lucide-user-round" class="text-dimmed size-8" />
    </div>

    <div class="min-w-0 space-y-2">
      <div class="flex flex-wrap gap-2">
        <UButton
          :label="modelo ? 'Cambiar foto' : 'Añadir foto'"
          icon="i-lucide-camera"
          size="xs"
          :loading="trabajando"
          :disabled="disabled"
          @click="entrada?.click()"
        />
        <UButton
          v-if="modelo"
          label="Quitar"
          icon="i-lucide-x"
          size="xs"
          :disabled="disabled"
          @click="modelo = null"
        />
      </div>

      <!--
        `capture` deja al teléfono abrir la cámara directamente. En el escritorio
        no estorba: el navegador lo ignora y enseña el explorador de archivos.
      -->
      <input
        ref="entrada"
        type="file"
        accept="image/*"
        capture="user"
        class="hidden"
        @change="elegir"
      />

      <p v-if="error" class="text-error text-xs">{{ error }}</p>
      <p v-else class="text-dimmed text-xs">
        Opcional. Se guarda para los relojes que abren por rostro; el de la nave todavía no tiene
        esa función. Se reduce a {{ LADO }} px antes de subirla.
      </p>
    </div>
  </div>
</template>
