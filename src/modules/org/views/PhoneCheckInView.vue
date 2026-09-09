<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { checarSinReloj, type BaseVistaDesdeElTelefono } from '../checar-sin-reloj'
import { ApiError } from '@/shared/api/errors'

/**
 * CHECAR DESDE EL TELÉFONO CUANDO EL RELOJ ESTÁ MUERTO.
 *
 * Quien abre esto no tiene cuenta, está de pie en la puerta de una nave, con
 * una mano ocupada y con gente detrás en la fila. Todo lo de esta pantalla sale
 * de ahí: un solo dato que teclear, botones grandes, y el resultado en una
 * frase que se lee de un vistazo.
 *
 * NO LLEVA EL ARMAZÓN DE LA APLICACIÓN —ni menú, ni selector de empresa, ni
 * barra— porque no es la aplicación: es un formulario de una sola cosa. Meterlo
 * dentro del armazón le enseñaría a un operario un menú que no puede abrir.
 *
 * SIN MAPA A PROPÓSITO. La comprobación la hace el servidor con el área
 * dibujada; pintar aquí un mapa costaría datos, batería y segundos para
 * enseñarle a alguien un punto sobre el que no puede hacer nada.
 */
const route = useRoute()
const entityId = String(route.params.entityId ?? '')
const installationId = String(route.params.installationId ?? '')

const cargando = ref(true)
const base = ref<BaseVistaDesdeElTelefono | null>(null)
const errorAlAbrir = ref<string | null>(null)

const clave = ref('')
const permiso = ref<{ nombreCorto: string; nonce: string } | null>(null)
const enviando = ref(false)
const error = ref<string | null>(null)
const listo = ref<{ hora: string; nombre: string } | null>(null)

const puedeIdentificar = computed(
  () => clave.value.trim().length >= 1 && !enviando.value,
)

onMounted(async () => {
  try {
    base.value = await checarSinReloj.mirar(entityId, installationId)
  } catch (e) {
    errorAlAbrir.value =
      e instanceof ApiError ? e.message : 'No encuentro esta base'
  } finally {
    cargando.value = false
  }
})

async function identificar(): Promise<void> {
  enviando.value = true
  error.value = null
  try {
    const p = await checarSinReloj.identificar(entityId, installationId, clave.value.trim())
    permiso.value = { nombreCorto: p.nombreCorto, nonce: p.nonce }
  } catch (e) {
    error.value = e instanceof ApiError ? e.message : 'No pude comprobar tu clave'
  } finally {
    enviando.value = false
  }
}

/**
 * El GPS del navegador, envuelto para poder esperarlo con `await`.
 *
 * `enableHighAccuracy` pide el chip de GPS y no la posición por antena: la
 * diferencia entre acertar el patio y acertar la colonia. Los 20 segundos son
 * para un teléfono que acaba de encender el GPS bajo un techo de lámina; menos
 * deja fuera justo a quien está dentro de la nave.
 */
function ubicacion(): Promise<GeolocationPosition> {
  return new Promise((resolver, rechazar) => {
    /*
     * SIN HTTPS NO HAY UBICACIÓN, Y EL NAVEGADOR NI SIQUIERA PREGUNTA.
     *
     * Safari y Chrome solo entregan la posición en un origen seguro. Por
     * `http://` a secas —una IP de la red local, por ejemplo— `getCurrentPosition`
     * falla en el acto con el mismo código que si la persona hubiera dicho que
     * no, sin enseñar ningún diálogo. Sin este aviso, quien está en la puerta
     * lee «acepta el permiso», va a los ajustes del teléfono a buscar un
     * permiso que nadie le pidió, y no lo encuentra.
     *
     * `localhost` es la excepción de la regla y por eso en el portátil de quien
     * programa esto funciona sin darse cuenta de nada.
     */
    if (!window.isSecureContext) {
      rechazar(
        new Error(
          'Esta página se abrió sin candado (http). Los teléfonos solo dan la ' +
            'ubicación en páginas seguras (https), así que avisa a sistemas: ' +
            'el enlace del cartel tiene que ser https.',
        ),
      )
      return
    }

    if (!('geolocation' in navigator)) {
      rechazar(new Error('Este teléfono no puede dar su ubicación'))
      return
    }
    navigator.geolocation.getCurrentPosition(resolver, rechazar, {
      enableHighAccuracy: true,
      timeout: 20_000,
      maximumAge: 0,
    })
  })
}

async function checar(): Promise<void> {
  if (permiso.value === null) return
  enviando.value = true
  error.value = null

  try {
    const pos = await ubicacion()
    const r = await checarSinReloj.checar(entityId, installationId, {
      nonce: permiso.value.nonce,
      lat: pos.coords.latitude,
      lng: pos.coords.longitude,
      accuracyMeters: Math.round(pos.coords.accuracy),
    })
    listo.value = {
      nombre: permiso.value.nombreCorto,
      hora: new Date(r.cuando).toLocaleTimeString('es-MX', {
        hour: '2-digit',
        minute: '2-digit',
      }),
    }
  } catch (e) {
    if (e instanceof ApiError) {
      error.value = e.message
      // Un permiso gastado o vencido no se arregla reintentando: hay que
      // volver a teclear la clave, y la pantalla lo dice sola volviendo atrás.
      if (e.status === 409 || e.status === 400) permiso.value = null
    } else if (e instanceof Error && !('code' in e)) {
      // Los que lanza esta pantalla ya traen escrito qué pasa y qué hacer.
      error.value = e.message
    } else {
      error.value =
        'No pude leer tu ubicación. Acepta el permiso de ubicación y vuelve a intentarlo'
    }
  } finally {
    enviando.value = false
  }
}

function otraPersona(): void {
  listo.value = null
  permiso.value = null
  clave.value = ''
  error.value = null
}
</script>

<template>
  <div class="bg-default text-default min-h-dvh px-4 py-8">
    <div class="mx-auto w-full max-w-sm space-y-6">
      <header class="space-y-1 text-center">
        <UIcon name="i-lucide-clock-alert" class="text-warning size-10" />
        <h1 class="text-highlighted text-xl font-semibold">Checar sin reloj</h1>
        <p v-if="base" class="text-muted text-sm">{{ base.installationName }}</p>
      </header>

      <p v-if="cargando" class="text-muted text-center text-sm">Un momento…</p>

      <UAlert
        v-else-if="errorAlAbrir"
        color="error"
        icon="i-lucide-circle-x"
        title="No encuentro esta base"
        :description="errorAlAbrir"
      />

      <!-- Ya checó. Se queda enseñando la hora hasta que alguien la quite. -->
      <template v-else-if="listo">
        <div class="border-success/40 bg-success/10 space-y-2 rounded-xl border p-6 text-center">
          <UIcon name="i-lucide-circle-check-big" class="text-success size-12" />
          <p class="text-highlighted text-lg font-semibold">Quedó registrada</p>
          <p class="text-default text-sm">{{ listo.nombre }} · {{ listo.hora }}</p>
        </div>
        <UButton
          label="Checar otra persona"
          icon="i-lucide-user-plus"
          size="xl"
          block
          @click="otraPersona"
        />
      </template>

      <!-- Paso 2: ya sé quién es, falta dónde está. -->
      <template v-else-if="permiso">
        <div class="border-default bg-elevated/50 rounded-xl border p-5 text-center">
          <p class="text-muted text-xs tracking-wide uppercase">Vas a checar como</p>
          <p class="text-highlighted mt-1 text-lg font-semibold">
            {{ permiso.nombreCorto }}
          </p>
        </div>

        <UAlert v-if="error" color="error" icon="i-lucide-circle-alert" :description="error" />

        <UButton
          label="Checar aquí"
          icon="i-lucide-map-pin"
          size="xl"
          block
          :loading="enviando"
          @click="checar"
        />
        <p class="text-dimmed text-center text-xs">
          El teléfono va a pedirte permiso para usar tu ubicación. Sin ella no se puede
          comprobar que estás en tu centro de trabajo.
        </p>
        <UButton label="No soy yo" size="lg" block @click="otraPersona" />
      </template>

      <!-- Paso 1: quién eres. -->
      <template v-else>
        <form class="space-y-4" @submit.prevent="identificar">
          <!--
            DICE «NÚMERO», NO «CLAVE», y la diferencia costó una prueba fallida.
            Con «tu clave del reloj» la primera persona tecleó su clave de
            PUERTA —los cuatro dígitos con los que abre— que Astra no guarda en
            ningún sitio. Lo que sí sabe es el número del padrón, y ese es el
            que hay que pedir, con un ejemplo delante para no dejar dudas.
          -->
          <UFormField
            label="Tu número de empleado"
            help="El que sale en la pantalla del reloj. También vale tu clave de Astra."
          >
            <UInput
              v-model="clave"
              placeholder="00000001"
              inputmode="numeric"
              autocomplete="off"
              autocapitalize="characters"
              size="xl"
              class="w-full"
            />
          </UFormField>

          <UAlert v-if="error" color="error" icon="i-lucide-circle-alert" :description="error" />

          <UButton
            type="submit"
            label="Continuar"
            icon="i-lucide-arrow-right"
            size="xl"
            block
            :disabled="!puedeIdentificar"
            :loading="enviando"
          />
        </form>
      </template>
    </div>
  </div>
</template>
