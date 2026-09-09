<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { ApiError } from '@/shared/api/errors'
import { remotoApi } from '../api'
import { guardarTelefono, leerTelefono, olvidarTelefono } from '../telefono-guardado'

/**
 * CHECAR DESDE CASA.
 *
 * Quien abre esto no tiene cuenta en Astra y no está en ningún centro de
 * trabajo: está en su comedor, con su teléfono, y lo único que quiere es dejar
 * constancia de que empezó. Por eso la pantalla no lleva armazón, ni menú, ni
 * selector de empresa — igual que el cartel de la contingencia, y por la misma
 * razón.
 *
 * LA DIFERENCIA CON EL CARTEL, que es toda la pantalla: aquí el teléfono se DA
 * DE ALTA una vez y a partir de entonces checa de un toque. En la contingencia
 * hay que teclear el número cada vez porque el aparato es compartido —está
 * pegado a una puerta y lo usan treinta personas—; este es de una sola persona,
 * y pedirle su número todos los días sería tratarlo como si no lo fuera.
 *
 * SIN MAPA, como el cartel. La ubicación se manda y se guarda, pero aquí no hay
 * área contra la cual medirla: pintar un punto solo gastaría datos y batería
 * para enseñar algo sobre lo que nadie puede actuar.
 */
const route = useRoute()
const entityId = String(route.params.entityId ?? '')

type Paso = 'checar' | 'numero' | 'codigo'

const paso = ref<Paso>('numero')
const enviando = ref(false)
const error = ref<string | null>(null)

/** El token del teléfono, si este ya estaba dado de alta. */
const token = ref<string | null>(null)

const clave = ref('')
const codigo = ref('')
const etiqueta = ref('')
const pendiente = ref<{ nonce: string; enviadoA: string; nombre: string } | null>(null)

const listo = ref<{ hora: string; nombre: string; comprobante: boolean } | null>(null)

const puedePedir = computed(() => clave.value.trim().length >= 1 && !enviando.value)
const puedeConfirmar = computed(() => /^\d{6}$/.test(codigo.value) && !enviando.value)

onMounted(() => {
  const guardado = leerTelefono(entityId)
  if (guardado !== null) {
    token.value = guardado.token
    paso.value = 'checar'
  }
})

async function pedirCodigo(): Promise<void> {
  enviando.value = true
  error.value = null
  try {
    pendiente.value = await remotoApi.pedirCodigo(entityId, clave.value.trim())
    paso.value = 'codigo'
  } catch (e) {
    error.value = e instanceof ApiError ? e.message : 'No pude mandarte el código'
  } finally {
    enviando.value = false
  }
}

async function confirmar(): Promise<void> {
  if (pendiente.value === null) return
  enviando.value = true
  error.value = null
  try {
    const alta = await remotoApi.darDeAltaTelefono(entityId, {
      nonce: pendiente.value.nonce,
      codigo: codigo.value,
      etiqueta: etiqueta.value.trim() || undefined,
    })
    token.value = alta.token
    guardarTelefono(entityId, { token: alta.token, venceEl: alta.venceEl })
    paso.value = 'checar'
    codigo.value = ''
  } catch (e) {
    error.value = e instanceof ApiError ? e.message : 'No pude dar de alta el teléfono'
  } finally {
    enviando.value = false
  }
}

/**
 * El GPS del navegador, envuelto para poder esperarlo con `await`.
 *
 * Mismo aviso de origen seguro que el cartel, y por el mismo motivo: sin https
 * el navegador NI SIQUIERA PREGUNTA, falla con el mismo código que si la
 * persona hubiera dicho que no. Sin este texto, alguien se va a los ajustes a
 * buscar un permiso que nadie le pidió.
 *
 * `enableHighAccuracy` aquí importa menos que en la nave —no hay borde que
 * acertar— pero se deja: si un día alguien tiene que revisar una checada, un
 * margen de 20 m dice mucho más que uno de 3 km.
 */
function ubicacion(): Promise<GeolocationPosition> {
  return new Promise((resolver, rechazar) => {
    if (!window.isSecureContext) {
      rechazar(
        new Error(
          'Esta página se abrió sin candado (http). Los teléfonos solo dan la ' +
            'ubicación en páginas seguras (https): avisa a sistemas.',
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
  if (token.value === null) return
  enviando.value = true
  error.value = null

  try {
    const pos = await ubicacion()
    const r = await remotoApi.checar(entityId, {
      token: token.value,
      lat: pos.coords.latitude,
      lng: pos.coords.longitude,
      accuracyMeters: Math.round(pos.coords.accuracy),
    })
    listo.value = {
      nombre: r.nombre,
      comprobante: r.comprobante,
      hora: new Date(r.cuando).toLocaleTimeString('es-MX', {
        hour: '2-digit',
        minute: '2-digit',
      }),
    }
  } catch (e) {
    if (e instanceof ApiError) {
      error.value = e.message
      /*
       * 403 y 404 significan que este teléfono ya no sirve: se revocó, se
       * venció, o a esa persona le quitaron el trabajo remoto. Se OLVIDA el
       * token y se vuelve al principio, porque insistir con él no lo va a
       * arreglar y dejarlo guardado haría que mañana pase lo mismo.
       */
      if (e.status === 403 || e.status === 404) {
        olvidarTelefono(entityId)
        token.value = null
        paso.value = 'numero'
      }
    } else if (e instanceof Error && !('code' in e)) {
      error.value = e.message
    } else {
      error.value =
        'No pude leer tu ubicación. Acepta el permiso de ubicación y vuelve a intentarlo'
    }
  } finally {
    enviando.value = false
  }
}

function otraVez(): void {
  listo.value = null
  error.value = null
}

/** Para cuando alguien cambia de teléfono o quiere quitar este de en medio. */
function olvidarEsteTelefono(): void {
  olvidarTelefono(entityId)
  token.value = null
  pendiente.value = null
  clave.value = ''
  codigo.value = ''
  listo.value = null
  error.value = null
  paso.value = 'numero'
}
</script>

<template>
  <div class="bg-default text-default min-h-dvh px-4 py-8">
    <div class="mx-auto w-full max-w-sm space-y-6">
      <header class="space-y-1 text-center">
        <UIcon name="i-lucide-house" class="text-primary size-10" />
        <h1 class="text-highlighted text-xl font-semibold">Checar a distancia</h1>
      </header>

      <!-- Ya checó. -->
      <template v-if="listo">
        <div class="border-success/40 bg-success/10 space-y-2 rounded-xl border p-6 text-center">
          <UIcon name="i-lucide-circle-check-big" class="text-success size-12" />
          <p class="text-highlighted text-lg font-semibold">Quedó registrada</p>
          <p class="text-default text-sm">{{ listo.nombre }} · {{ listo.hora }}</p>
          <!--
            Se dice si salió el acuse, y se dice cuando NO salió.
            El acuse es lo que permite a alguien darse cuenta de que checaron
            por él; que falte no es un detalle menor y callarlo sería esconder
            justo la parte que protege a esa persona.
          -->
          <p v-if="listo.comprobante" class="text-muted text-xs">
            Te mandamos el comprobante por correo.
          </p>
          <p v-else class="text-warning text-xs">
            No tienes correo en tu expediente, así que no hay comprobante. Pídele a
            Recursos Humanos que lo capture.
          </p>
        </div>
        <UButton label="Listo" icon="i-lucide-check" size="xl" block @click="otraVez" />
      </template>

      <!-- El caso de todos los días: un botón. -->
      <template v-else-if="paso === 'checar'">
        <UAlert v-if="error" color="error" icon="i-lucide-circle-alert" :description="error" />

        <UButton
          label="Checar ahora"
          icon="i-lucide-map-pin"
          size="xl"
          block
          :loading="enviando"
          @click="checar"
        />
        <p class="text-dimmed text-center text-xs">
          Este teléfono ya está dado de alta. Se guarda desde dónde checas y te llega un
          comprobante por correo cada vez.
        </p>
        <UButton label="Este no es mi teléfono" size="lg" block @click="olvidarEsteTelefono" />
      </template>

      <!-- Alta, paso 2: el código que llegó por WhatsApp. -->
      <template v-else-if="paso === 'codigo' && pendiente">
        <div class="border-default bg-elevated/50 rounded-xl border p-5 text-center">
          <p class="text-muted text-xs tracking-wide uppercase">Le mandamos un código a</p>
          <p class="text-highlighted mt-1 text-lg font-semibold">
            {{ pendiente.enviadoA }}
          </p>
          <p class="text-muted mt-1 text-sm">{{ pendiente.nombre }}</p>
        </div>

        <form class="space-y-4" @submit.prevent="confirmar">
          <UFormField label="El código" help="Seis cifras. Dura diez minutos.">
            <UInput
              v-model="codigo"
              placeholder="000000"
              inputmode="numeric"
              autocomplete="one-time-code"
              maxlength="6"
              size="xl"
              class="w-full"
            />
          </UFormField>

          <!--
            La etiqueta es opcional pero se pide AQUÍ y no después: es el único
            momento en que la persona sabe desde qué aparato está dando de alta.
            Sin ella, revocar un teléfono perdido desde Astra es elegir entre
            tres renglones idénticos.
          -->
          <UFormField
            label="¿Cómo se llama este teléfono?"
            help="Opcional. Sirve para reconocerlo si algún día hay que darlo de baja."
          >
            <UInput v-model="etiqueta" placeholder="Mi celular" size="xl" class="w-full" />
          </UFormField>

          <UAlert v-if="error" color="error" icon="i-lucide-circle-alert" :description="error" />

          <UButton
            type="submit"
            label="Dar de alta este teléfono"
            icon="i-lucide-smartphone"
            size="xl"
            block
            :disabled="!puedeConfirmar"
            :loading="enviando"
          />
        </form>

        <UButton label="Volver" size="lg" block @click="olvidarEsteTelefono" />
      </template>

      <!-- Alta, paso 1: quién eres. -->
      <template v-else>
        <form class="space-y-4" @submit.prevent="pedirCodigo">
          <UFormField
            label="Tu número de empleado"
            help="El mismo que usas en el reloj. También vale tu clave de Astra."
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
            label="Mandarme el código"
            icon="i-lucide-message-circle"
            size="xl"
            block
            :disabled="!puedePedir"
            :loading="enviando"
          />
          <p class="text-dimmed text-center text-xs">
            Te llega por WhatsApp al número de tu expediente. Solo hace falta una vez:
            después este teléfono checa de un toque.
          </p>
        </form>
      </template>
    </div>
  </div>
</template>
