<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useAuthStore } from '@/modules/auth/store'
import { useAviso } from '@/shared/ui/aviso'
import { soporteApi, type ClienteDeLaPlataforma } from '../api'
import NuevoClienteModal from './NuevoClienteModal.vue'

/**
 * EL SELECTOR DE CLIENTES, para quien atiende a varios.
 *
 * Ocupa el mismo sitio que el de razones sociales y hace la misma clase de cosa
 * un nivel más arriba: donde la dirección de una empresa elige entre SUS
 * razones sociales, soporte elige entre CLIENTES.
 *
 * ══ NO HAY «CLIENTE PROPIO» ══
 *
 * Antes la primera opción decía «Mi propio cliente» y las demás iban por su
 * nombre. Era falso desde el punto de vista del negocio: quien atiende no tiene
 * empresa propia dentro de Astra, TODOS son clientes que contratan el servicio.
 * Que la cuenta de soporte viva técnicamente dentro del inquilino de uno de
 * ellos es un detalle de la base, no algo que deba salir en la pantalla.
 *
 * Así que todos se listan igual, por su nombre, y lo que se ve puesto es
 * siempre el nombre del cliente en el que estás. La pantalla nunca dice dónde
 * estás con una etiqueta que no significa nada para quien la lee.
 *
 * NO SE PINTA PARA NADIE MÁS. La lista llega vacía a quien no es operador de
 * plataforma, así que no hay botón deshabilitado ni «no tienes permiso»: para
 * el resto del mundo esta función no existe.
 *
 * ══ POR QUÉ SE LEE EL CLIENTE ACTUAL DE `/auth/me` ══
 *
 * Antes el selector nacía vacío y tras cada recarga volvía a decir «Mi propio
 * cliente». Como cambiar de cliente RECARGA la página, decía eso SIEMPRE —
 * incluso estando dentro de los datos de otro cliente. Un rótulo que dice «mi
 * casa» mientras enseñas la nómina ajena es peor que no tener rótulo.
 */
const aviso = useAviso()
const { me } = storeToRefs(useAuthStore())

const clientes = ref<ClienteDeLaPlataforma[]>([])
const cambiando = ref(false)
const nuevoAbierto = ref(false)

/**
 * QUIÉN VE ESTO. La lista llega vacía a quien no es operador de plataforma, así
 * que basta con que tenga algo para saber que quien mira lo es.
 *
 * Es COMODIDAD, no seguridad: quien llame a la API por su cuenta se topa con la
 * misma comprobación en el servidor. Si esto fallara, el peor síntoma es un
 * botón que devuelve 404.
 */
const esOperador = computed(() => clientes.value.length > 0)

async function recargar(): Promise<void> {
  try {
    clientes.value = await soporteApi.clientes()
  } catch {
    clientes.value = []
  }
}

onMounted(async () => {
  try {
    clientes.value = await soporteApi.clientes()
  } catch {
    // Sin lista no hay selector, y no merece molestar a nadie: la inmensa
    // mayoría de quienes entran no son operadores.
    clientes.value = []
  }
})

/** Todos los clientes, todos por su nombre. Ninguno es más propio que otro. */
const items = computed(() =>
  clientes.value.map((c) => ({
    label: `${c.nombre} · ${c.legalEntities} ${c.legalEntities === 1 ? 'empresa' : 'empresas'}`,
    value: c.tenantId,
  })),
)

/**
 * En cuál estás. Sale DEL SERVIDOR y no de un `ref` que se olvida al recargar
 * —y cambiar de cliente recarga—. Es siempre un cliente de verdad, así que el
 * desplegable siempre encuentra su nombre: nunca vuelve a enseñar un UUID.
 */
const actual = computed(() => {
  /*
   * Estando en el inquilino del PROVEEDOR no hay nada puesto, y es correcto:
   * ese no es un cliente, no sale en la lista y no se puede «entrar» a él. La
   * cuenta maestra no pertenece a ninguno — el selector queda vacío hasta que
   * se elige uno, que es justo lo que hay que hacer para empezar a trabajar.
   */
  const donde = me.value?.tenantId ?? null
  return clientes.value.some((c) => c.tenantId === donde) ? donde : null
})

/** Lo que se lee cuando todavía no hay cliente elegido. */
const vacio = computed(() => (actual.value === null ? 'Elige un cliente' : 'Cliente'))

async function entrar(tenantId: string | null): Promise<void> {
  if (tenantId === null || cambiando.value) return
  cambiando.value = true
  try {
    /*
     * Volver al cliente donde vive la cuenta se hace SOLTANDO la cookie, no
     * poniéndola. El resultado que ve la persona es el mismo —acaba en ese
     * cliente— pero dejar la cookie apuntando a su propio inquilino sería
     * declarar un estado especial que el servidor tendría que ignorar en cada
     * petición. Sin cookie no hay nada que ignorar.
     */
    if (tenantId === me.value?.tenantPropio) await soporteApi.salir()
    else await soporteApi.entrar(tenantId)

    /*
     * Recarga completa, a propósito. Media aplicación tiene datos del cliente
     * anterior en memoria —el filtro de empresas, las listas, los catálogos— y
     * refrescarlos uno a uno sería una lista que alguien tendría que mantener
     * al día para siempre. Una recarga no deja nada viejo por descuido.
     */
    window.location.assign('/')
  } catch (e) {
    aviso.fallo(e, 'cambiar de cliente')
    cambiando.value = false
  }
}
</script>

<template>
  <div v-if="esOperador" class="flex items-center gap-2">
    <!--
      SIN BADGE APARTE. Lo enseñaba en ámbar cuando estabas «fuera de tu casa»,
      y esa idea ya no existe: el propio selector lleva SIEMPRE el nombre del
      cliente en el que estás, que es la señal que hacía falta. Un aviso al lado
      repitiendo lo mismo era ruido.
    -->
    <USelectMenu
      :model-value="actual"
      :items="items"
      value-key="value"
      :loading="cambiando"
      icon="i-lucide-building-2"
      :placeholder="vacio"
      class="w-56"
      @update:model-value="(v: string | null) => void entrar(v)"
    />

    <UButton
      icon="i-lucide-plus"
      label="Nuevo cliente"
      :title="'Dar de alta un cliente nuevo'"
      @click="nuevoAbierto = true"
    />

    <NuevoClienteModal v-model:open="nuevoAbierto" @creado="recargar" />
  </div>
</template>
