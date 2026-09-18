<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'

import AstraLogo from '@/shared/ui/AstraLogo.vue'
import { miBase } from '../mi-base'

/**
 * LA PUERTA DEL ICONO DE LA PANTALLA DE INICIO.
 *
 * No dibuja nada en el caso normal: mira cuál fue la última base y manda allí.
 * Existe porque el manifiesto de una aplicación instalable es estático y su
 * dirección de arranque no puede llevar dentro el identificador de una
 * instalación.
 *
 * El caso que sí dibuja algo es el que importa: alguien que instaló el icono en
 * un teléfono nuevo, que limpió los datos del sitio, o que llegó aquí tecleando
 * la dirección. A esa persona hay que decirle qué le falta —escanear el cartel
 * de su puerta— y no dejarla mirando una pantalla en blanco.
 */
const router = useRouter()
const sinBase = ref(false)

onMounted(() => {
  const base = miBase()
  if (base === null) {
    sinBase.value = true
    return
  }
  /*
   * `replace` y no `push`: si quedara en el historial, el botón de atrás
   * devolvería aquí y volvería a redirigir. Un bucle del que solo se sale
   * cerrando la aplicación.
   */
  void router.replace({
    name: 'phone-check-in',
    params: { entityId: base.entityId, installationId: base.installationId },
  })
})
</script>

<template>
  <div class="bg-default text-default flex min-h-dvh flex-col justify-center px-4 py-8">
    <div v-if="sinBase" class="mx-auto w-full max-w-sm space-y-6 text-center">
      <div class="flex items-center justify-center gap-1.5">
        <AstraLogo class="size-8 shrink-0" />
        <span class="marca-astra text-[2rem] leading-none font-semibold tracking-tight">
          CLOCC
        </span>
      </div>
      <div class="border-default bg-elevated/50 space-y-3 border p-5 text-left">
        <p class="text-default text-sm">Este teléfono todavía no sabe en qué puerta checas.</p>
        <p class="text-muted text-sm">
          Escanea una vez el cartel que está pegado en la entrada de tu centro de trabajo. A partir
          de entonces, este icono te trae directo.
        </p>
      </div>
    </div>
  </div>
</template>
