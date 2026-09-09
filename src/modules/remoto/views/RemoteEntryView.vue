<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ultimaEmpresa } from '../telefono-guardado'

/**
 * LA PUERTA DEL ICONO DE LA PANTALLA DE INICIO.
 *
 * No dibuja nada en el caso normal: mira cuál fue la última empresa y manda
 * allí. Existe porque el manifiesto de una aplicación instalable es estático y
 * su `start_url` no puede llevar dentro el identificador de una razón social.
 *
 * El caso que sí dibuja algo es el que importa: alguien que instaló el icono
 * en un teléfono nuevo, o que limpió los datos del sitio, o que llegó aquí
 * tecleando la dirección. A esa persona hay que decirle qué le falta —el
 * enlace de SU empresa— y no dejarla mirando una pantalla en blanco.
 */
const router = useRouter()
const sinEmpresa = ref(false)

onMounted(() => {
  const empresa = ultimaEmpresa()
  if (empresa === null) {
    sinEmpresa.value = true
    return
  }
  /*
   * `replace` y no `push`: si quedara en el historial, el botón de atrás del
   * teléfono devolvería a esta pantalla, que volvería a redirigir. Un bucle del
   * que solo se sale cerrando la aplicación.
   */
  void router.replace({ name: 'remote-check-in', params: { entityId: empresa } })
})
</script>

<template>
  <div class="bg-default text-default min-h-dvh px-4 py-8">
    <div v-if="sinEmpresa" class="mx-auto w-full max-w-sm space-y-6 text-center">
      <UIcon name="i-lucide-house" class="text-primary size-10" />
      <h1 class="text-highlighted text-xl font-semibold">Checar a distancia</h1>
      <div class="border-default bg-elevated/50 space-y-3 rounded-xl border p-5 text-left">
        <p class="text-default text-sm">
          Este teléfono todavía no está dado de alta en ninguna empresa.
        </p>
        <p class="text-muted text-sm">
          Pídele a Recursos Humanos el enlace para checar a distancia. Se abre una vez,
          se da de alta el teléfono con un código por WhatsApp, y a partir de entonces
          este icono ya te trae directo.
        </p>
      </div>
    </div>
  </div>
</template>
