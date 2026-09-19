<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { env } from '@/shared/config/env'
import type { GeoPoint } from '../types'

/**
 * DIBUJAR EL ÁREA REAL DE LA BASE, punto por punto.
 *
 * POR QUÉ NO BASTA UN RADIO
 * Un círculo alrededor de un punto siempre se sale de la propiedad. Para que
 * cubra una nave alargada hay que estirarlo hasta que quepa el lado más lejano,
 * y para entonces abarca la calle de atrás y el estacionamiento del vecino:
 * alguien podría validar su checada desde el coche, sin entrar.
 *
 * EL MAPA NECESITA INTERNET, EL CÁLCULO NO
 * Las imágenes vienen de OpenStreetMap. Sin salida a internet el mapa sale en
 * gris y se puede seguir dibujando por coordenadas, pero es incómodo. La
 * validación de una checada, en cambio, es aritmética sobre los vértices: no
 * consulta a nadie y funciona con la red caída.
 *
 * QUIÉN DECIDE SI UNA CHECADA ENTRA
 * El servidor, con el mismo objeto de valor que usa la auditoría. Aquí solo se
 * dibuja. Repetir la regla en la pantalla garantizaría que un día las dos digan
 * cosas distintas del mismo punto — y una de ellas se lo diría a un trabajador.
 */
const vertices = defineModel<GeoPoint[]>({ default: () => [] })

const props = withDefaults(
  defineProps<{
    /** Dónde centrar el mapa cuando todavía no hay nada dibujado. */
    centro?: GeoPoint | null
    radioMetros?: number
    disabled?: boolean
  }>(),
  { centro: null, radioMetros: 75, disabled: false },
)

/** Villahermosa. Solo se usa si la base no tiene coordenadas todavía. */
const CENTRO_POR_OMISION: GeoPoint = { lat: 17.9892, lng: -92.9475 }

/**
 * EL SATÉLITE ES EL MODO POR OMISIÓN, y no es una preferencia estética.
 *
 * El mapa de calles dibuja la calle y deja la manzana en blanco: sirve para
 * encontrar el sitio, no para saber dónde acaba la propiedad. Las esquinas de
 * una barda solo se ven en la foto aérea, y son justo lo que hay que marcar.
 * Quedan las calles a un toque porque para LLEGAR al predio siguen siendo lo
 * más rápido, y porque en zonas nuevas la foto puede estar vieja.
 *
 * `maxNativeZoom` es menor que `maxZoom` a propósito: pasado el nivel 19 casi
 * nadie tiene foto, así que se amplía la última que hay en vez de dejar el
 * cuadro en gris. Se ve borroso, pero se sigue pudiendo afinar un vértice.
 */
interface Capa {
  url: string
  attribution: string
  maxNativeZoom: number
  /** Nombres de calle, que ninguna de las dos fuentes trae dibujados. */
  etiquetas?: string
}

/**
 * LA CALIDAD CON LA QUE MAPBOX COMPRIME CADA CUADRO.
 *
 * Se pide el conjunto de imágenes en crudo (`mapbox.satellite`) y no un estilo
 * ya montado, PRECISAMENTE porque en crudo se puede elegir la compresión: los
 * estilos la traen fijada y no hay forma de subirla.
 *
 * `@2x` = cuadro al doble de resolución, que es lo que hace falta para ver el
 * filo de una barda contra su propia sombra. Eso NO se toca.
 *
 * Lo que sí se tocó es el formato. MEDIDO sobre el mismo cuadro de Ciudad del
 * Carmen en el zoom 18, con la ficha de verdad:
 *
 *   @2x.jpg90 → 47 929 B      @2x.jpg70 → 26 623 B
 *   @2x.jpg80 → 32 993 B      @2x.webp  → 20 542 B
 *
 * WebP pesa **menos de la mitad que jpg90 con exactamente los mismos píxeles**,
 * y encima menos que jpg70, que ya se vería peor. No es un intercambio: es el
 * mismo detalle por la mitad de espera.
 *
 * Si algún día hiciera falta bajar más —una base con enlace pobre— lo siguiente
 * sería quitar el `@2x`, que baja a 10 966 B pero deja la foto a media
 * resolución. Comprimir más el JPEG no: los cuadros de la compresión salen
 * justo en los bordes rectos, que son los que hay que seguir.
 */
const CALIDAD = '@2x.webp'

/**
 * Nombres de calle encima de la foto. Sin ellos el satélite es bonito y no se
 * sabe dónde está uno; con ellos se reconoce la esquina y se traza con la calle
 * de referencia a la vista. Va aparte porque las imágenes en crudo no traen
 * ninguna etiqueta dibujada.
 */
const ETIQUETAS_ESRI =
  'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}'

/**
 * SATÉLITE: MAPBOX SI HAY FICHA, ESRI SI NO.
 *
 * Esri no pide credencial, y por eso es el suelo del que no se baja: sin ficha
 * el editor sigue funcionando. Pero en Ciudad del Carmen se queda en el zoom
 * 18 —comprobado: del 19 en adelante devuelve un cartel gris—, y el estilo
 * `satellite-streets` de Mapbox suele tener más detalle y ya trae los nombres
 * de calle dibujados encima de la foto.
 *
 * La ficha va en `VITE_MAPBOX_TOKEN`. No es un secreto: viaja en la URL de
 * cada cuadro. Lo que la protege es la lista de dominios de la cuenta.
 */
const SATELITE: Capa = env.mapboxToken
  ? {
      url: `https://api.mapbox.com/v4/mapbox.satellite/{z}/{x}/{y}${CALIDAD}?access_token=${env.mapboxToken}`,
      attribution: '© Mapbox © Maxar',
      /*
       * 19, no 22. MEDIDO en el mismo punto: el cuadro pesa 45 054 B en el
       * zoom 17, 20 542 en el 18, 11 932 en el 19 y 1 738 en el 22. Una foto
       * con detalle de verdad no adelgaza así al acercarse —son los mismos
       * píxeles— salvo que a partir de ahí ya no haya nada nuevo que enseñar:
       * lo que llega del 20 en adelante es la misma foto estirada por Mapbox.
       *
       * Estirándola aquí se ve igual y se piden CUATRO VECES MENOS cuadros por
       * cada nivel de más. Si al máximo acercamiento se notara más blanda que
       * antes, este 19 es el único número que hay que mover.
       */
      maxNativeZoom: 19,
      etiquetas: ETIQUETAS_ESRI,
    }
  : {
      url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      attribution: 'Imágenes © Esri, Maxar, Earthstar Geographics',
      // 18 y no 19: COMPROBADO contra Ciudad del Carmen, del 19 en adelante
      // Esri devuelve siempre el mismo cartel de «Map data not yet available»
      // (2 521 bytes idénticos a los de un cuadro en mitad del Golfo). Pidiendo
      // 18 se amplía la última foto REAL en vez de tapar el predio con un
      // cartel gris.
      maxNativeZoom: 18,
      etiquetas: ETIQUETAS_ESRI,
    }

const CAPAS: Record<'satelite' | 'calles', Capa> = {
  satelite: SATELITE,
  calles: {
    url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '© OpenStreetMap',
    maxNativeZoom: 19,
  },
}

type NombreDeCapa = keyof typeof CAPAS

/**
 * Se puede llegar al 22. Pasado el nivel donde hay foto la imagen se amplía y
 * se ve blanda, pero es la única forma de colocar un vértice justo en la
 * esquina de la barda en vez de «por ahí».
 */
const ZOOM_MAXIMO = 22

const capa = ref<NombreDeCapa>('satelite')

/**
 * ACLARAR LA FOTO, de 0 a 100.
 *
 * La foto aérea de un sitio se tomó el día que se tomó: hay predios que salen
 * a contraluz, bajo nube, o —el caso de aquí— ampliados desde el último nivel
 * con foto, y ampliar SIEMPRE apaga el contraste. Distinguir el filo de una
 * barda de la sombra que proyecta es justo lo que hay que hacer para marcar la
 * esquina, así que se deja en manos de quien mira.
 *
 * Arranca con un realce moderado porque el caso normal es la foto ampliada.
 * Al 0 se ve el cuadro tal cual lo manda Esri.
 *
 * Va sobre el panel de las imágenes, NO sobre el mapa entero: el área dibujada
 * y las esquinas viven en otro panel y tienen que conservar su color, que para
 * eso se eligió que resaltara.
 */
const claridad = ref(35)

function aplicarClaridad(): void {
  const panel = mapa?.getPane('tilePane')
  if (!panel) return
  const v = claridad.value / 100
  panel.style.filter =
    v === 0
      ? ''
      : `brightness(${(1 + v * 0.35).toFixed(3)}) contrast(${(1 + v * 0.4).toFixed(3)}) saturate(${(1 + v * 0.25).toFixed(3)})`
}

/**
 * EL HUECO ES DE VUE; EL ELEMENTO DEL MAPA LO CREA ESTE CÓDIGO.
 *
 * Leaflet le añade a su elemento la clase `leaflet-container` —de ahí salen su
 * `position: relative` y su `overflow: hidden`— y le mete dentro sus propios
 * hijos. Si ese elemento lo declara la plantilla, Vue lo considera suyo: en
 * cuanto vuelve a renderizar reescribe el atributo `class` con lo que dice la
 * plantilla, se lleva por delante `leaflet-container`, y los controles —que van
 * en posición absoluta— se escapan del recuadro y aterrizan sobre los botones.
 * Es el «+ −  Leaflet | © Esri» suelto que salía tapando «Empezar de nuevo».
 *
 * Creando el elemento aquí, Vue no lo patcha nunca.
 */
const hueco = ref<HTMLElement | null>(null)
let contenedor: HTMLElement | null = null
let mapa: L.Map | null = null
let fondo: L.TileLayer | null = null
let etiquetas: L.TileLayer | null = null
let area: L.Polygon | null = null
let borde: L.Polygon | null = null
let circulo: L.Circle | null = null
const marcas: L.Marker[] = []
const intermedias: L.Marker[] = []

/**
 * MIENTRAS SE ARRASTRA, EL MODELO NO SE TOCA.
 *
 * Escribir en `vertices` en cada milímetro dispararía el `watch` que vuelve a
 * pintarlo todo: el marcador que el dedo está sujetando se destruiría y se
 * crearía otro, y el arrastre se cortaría en seco. Así que durante el gesto se
 * mueve una copia de trabajo y solo se pinta la figura; al soltar se escribe
 * una vez y el repintado normal se encarga del resto.
 */
const arrastrando = ref(false)
let trabajo: GeoPoint[] = []

const suficientes = computed(() => vertices.value.length >= 3)

/**
 * El área en metros cuadrados, por la fórmula del agrimensor.
 *
 * Se enseña porque es la comprobación más rápida de que el dibujo salió bien:
 * quien conoce su nave sabe si son mil metros o diez mil, y un cero de más se
 * ve al instante. Con la lista de coordenadas a secas, no.
 */
const superficie = computed(() => {
  if (!suficientes.value) return 0
  const R = 6_371_000
  const rad = (g: number) => (g * Math.PI) / 180
  const o = vertices.value[0]!
  const xy = vertices.value.map((p) => ({
    x: rad(p.lng - o.lng) * R * Math.cos(rad(o.lat)),
    y: rad(p.lat - o.lat) * R,
  }))
  let doble = 0
  for (let i = 0; i < xy.length; i += 1) {
    const a = xy[i]!
    const b = xy[(i + 1) % xy.length]!
    doble += a.x * b.y - b.x * a.y
  }
  return Math.round(Math.abs(doble) / 2)
})

function pintar(): void {
  if (!mapa) return

  area?.remove()
  area = null
  borde?.remove()
  borde = null
  for (const m of marcas.splice(0)) m.remove()
  for (const m of intermedias.splice(0)) m.remove()

  // El círculo se sigue pintando de fondo mientras no haya área: es lo que
  // enseña POR QUÉ hace falta dibujar, sin tener que explicarlo con palabras.
  circulo?.remove()
  circulo = null
  const centro = props.centro ?? vertices.value[0] ?? null
  if (!suficientes.value && centro) {
    circulo = L.circle([centro.lat, centro.lng], {
      radius: props.radioMetros,
      color: '#FBBF24',
      weight: 2,
      dashArray: '6 5',
      fillOpacity: 0.06,
    }).addTo(mapa)
  }

  if (vertices.value.length > 0) {
    if (suficientes.value) {
      // Sobre una foto aérea una línea fina de un solo color desaparece en un
      // techo claro o en el agua. Va con un trazo blanco debajo, como los
      // mapas impresos, para que se lea sobre cualquier fondo.
      const contorno = vertices.value.map((p) => [p.lat, p.lng] as [number, number])
      borde = L.polygon(contorno, {
        color: '#fff',
        weight: 5,
        opacity: 0.85,
        fill: false,
        interactive: false,
      }).addTo(mapa)
      area = L.polygon(contorno, {
        color: '#38BDF8',
        weight: 2.5,
        fillOpacity: 0.18,
      }).addTo(mapa)
    }

    /*
     * LOS VÉRTICES SE ARRASTRAN, y por eso son `Marker` y no `CircleMarker`:
     * el segundo no sabe arrastrarse, y era la causa de que la única forma de
     * corregir una esquina fuera quitarla y volver a ponerla en el sitio justo.
     *
     * El icono es una caja transparente de 34 px con el punto dibujado dentro:
     * el punto se ve del tamaño que conviene al dibujo y el dedo agarra una
     * superficie que sí puede agarrar. Con un punto de 12 px, en un teléfono,
     * el gesto falla una de cada tres veces y acaba moviendo el mapa.
     */
    vertices.value.forEach((p, i) => {
      const marca = L.marker([p.lat, p.lng], {
        icon: L.divIcon({
          className: 'clocc-tirador',
          html: '<span class="clocc-vertice"></span>',
          iconSize: [34, 34],
          iconAnchor: [17, 17],
        }),
        draggable: !props.disabled,
        autoPan: true,
        keyboard: false,
        zIndexOffset: 500,
      })
        .addTo(mapa!)
        .bindTooltip(`${i + 1}`, { permanent: false })

      if (!props.disabled) {
        marca.on('dragstart', () => empezarArrastre())
        marca.on('drag', (e) => moverDurante(i, (e.target as L.Marker).getLatLng()))
        marca.on('dragend', terminarArrastre)

        /*
         * QUITAR PASA A SER DOBLE TOQUE. Con un solo clic no se puede: ese
         * mismo gesto es el principio de un arrastre, y quien intentaba mover
         * una esquina se la borraba. El doble toque no se dispara por accidente
         * y se para aquí para que el mapa no se acerque de paso.
         */
        marca.on('dblclick', (e) => {
          L.DomEvent.stop(e)
          quitar(i)
        })
      }
      marcas.push(marca)
    })

    /*
     * Y ENTRE CADA DOS ESQUINAS, UN PUNTO HUECO PARA AÑADIR.
     *
     * Es la forma de meter un vértice nuevo ahora que tocar el mapa ya no los
     * pone: se arrastra el hueco y nace una esquina donde se suelte. Tocarlo
     * sin arrastrar también la crea, en su sitio, para quien prefiera colocarla
     * y moverla después.
     */
    if (suficientes.value && !props.disabled) {
      vertices.value.forEach((p, i) => {
        const q = vertices.value[(i + 1) % vertices.value.length]!
        const medio = L.marker([(p.lat + q.lat) / 2, (p.lng + q.lng) / 2], {
          icon: L.divIcon({
            className: 'clocc-tirador',
            html: '<span class="clocc-medio"></span>',
            iconSize: [30, 30],
            iconAnchor: [15, 15],
          }),
          draggable: true,
          keyboard: false,
          zIndexOffset: 400,
        })
          .addTo(mapa!)
          .bindTooltip('Arrastra para añadir una esquina', { permanent: false })

        medio.on('dragstart', () => {
          empezarArrastre(medio)
          trabajo.splice(i + 1, 0, { ...trabajo[i]! })
        })
        medio.on('drag', (e) => moverDurante(i + 1, (e.target as L.Marker).getLatLng()))
        medio.on('dragend', terminarArrastre)
        medio.on('click', (e) => {
          L.DomEvent.stop(e)
          const nuevo = medio.getLatLng()
          vertices.value = [
            ...vertices.value.slice(0, i + 1),
            { lat: nuevo.lat, lng: nuevo.lng },
            ...vertices.value.slice(i + 1),
          ]
        })
        intermedias.push(medio)
      })
    }
  }
}

/**
 * Copia de trabajo y fuera los puntos huecos: estorban mientras se arrastra.
 *
 * MENOS EL QUE SE ESTÁ ARRASTRANDO, claro. Quitarlos todos incluía al que el
 * dedo sujeta y el gesto se cortaba en el primer milímetro. Ese se queda —en la
 * lista también, para que el repintado del final se lo lleve— y los demás se
 * van, que durante el arrastre solo confunden.
 */
function empezarArrastre(salvo?: L.Marker): void {
  arrastrando.value = true
  trabajo = vertices.value.map((p) => ({ ...p }))

  for (let i = intermedias.length - 1; i >= 0; i -= 1) {
    const m = intermedias[i]!
    if (m === salvo) continue
    m.remove()
    intermedias.splice(i, 1)
  }
}

/** Solo la figura se mueve; el modelo espera a que se suelte. */
function moverDurante(indice: number, donde: L.LatLng): void {
  const punto = trabajo[indice]
  if (punto === undefined) return
  punto.lat = donde.lat
  punto.lng = donde.lng

  const contorno = trabajo.map((p) => [p.lat, p.lng] as [number, number])
  area?.setLatLngs(contorno)
  borde?.setLatLngs(contorno)
}

/** Al soltar se escribe una vez, y el repintado normal rehace los tiradores. */
function terminarArrastre(): void {
  arrastrando.value = false
  vertices.value = trabajo.map((p) => ({ ...p }))
}

function quitar(indice: number): void {
  vertices.value = vertices.value.filter((_, i) => i !== indice)
}

function deshacer(): void {
  vertices.value = vertices.value.slice(0, -1)
}

function limpiar(): void {
  vertices.value = []
}

/** Cambia el fondo sin tocar lo dibujado ni mover la vista. */
function aplicarCapa(): void {
  if (!mapa) return

  fondo?.remove()
  etiquetas?.remove()
  etiquetas = null

  const elegida = CAPAS[capa.value]
  fondo = L.tileLayer(elegida.url, {
    maxZoom: ZOOM_MAXIMO,
    maxNativeZoom: elegida.maxNativeZoom,
    attribution: elegida.attribution,
    // Mientras dura la animación de acercar, el mapa pasa por niveles
    // intermedios que nadie llega a mirar. Sin esto se piden los cuadros de
    // todos ellos y se tiran a medio bajar.
    updateWhenZooming: false,
  }).addTo(mapa)

  if (elegida.etiquetas) {
    etiquetas = L.tileLayer(elegida.etiquetas, {
      maxZoom: ZOOM_MAXIMO,
      maxNativeZoom: 19,
    }).addTo(mapa)
  }

  // El fondo se pone DEBAJO de lo dibujado: al cambiar de capa, la última en
  // añadirse quedaría encima y taparía el área.
  fondo.bringToBack()
}

onMounted(() => {
  if (!hueco.value || mapa) return

  contenedor = document.createElement('div')
  contenedor.className = 'h-full w-full'
  contenedor.setAttribute('role', 'application')
  contenedor.setAttribute('aria-label', 'Mapa para dibujar el área de la base')
  hueco.value.appendChild(contenedor)

  const centro = props.centro ?? vertices.value[0] ?? CENTRO_POR_OMISION
  mapa = L.map(contenedor, {
    attributionControl: true,
    maxZoom: ZOOM_MAXIMO,
  }).setView([centro.lat, centro.lng], 19)

  aplicarCapa()
  aplicarClaridad()

  /*
   * TOCAR EL MAPA SOLO PONE PUNTOS MIENTRAS SE ESTÁ DIBUJANDO.
   *
   * Antes ponía uno con cualquier toque, siempre. Con la figura ya cerrada eso
   * es casi siempre un accidente —se quiso agarrar una esquina y se falló por
   * dos píxeles— y el resultado es un pico que hay que buscar y deshacer. Una
   * vez cerrada, las esquinas nuevas nacen de los puntos huecos del contorno,
   * que es donde tiene sentido que aparezcan.
   */
  mapa.on('click', (e: L.LeafletMouseEvent) => {
    if (props.disabled || suficientes.value) return
    vertices.value = [...vertices.value, { lat: e.latlng.lat, lng: e.latlng.lng }]
  })

  pintar()

  // El editor nace dentro de un modal que todavía se está abriendo: cuando
  // Leaflet mide el contenedor, mide cero, y luego pinta las imágenes en las
  // coordenadas de un mapa que no existe —de ahí los controles sueltos fuera
  // del recuadro—. Se vuelve a medir en cuanto el modal termina de entrar.
  requestAnimationFrame(() => mapa?.invalidateSize())
})

watch(
  vertices,
  () => {
    // En mitad de un arrastre la figura ya se está moviendo sola: repintar aquí
    // destruiría el marcador que el dedo sujeta.
    if (!arrastrando.value) pintar()
  },
  { deep: true },
)
watch(capa, aplicarCapa)
watch(claridad, aplicarClaridad)

onBeforeUnmount(() => {
  mapa?.remove()
  mapa = null
  contenedor?.remove()
  contenedor = null
})
</script>

<template>
  <div class="space-y-2">
    <div class="ring-default h-96 w-full overflow-hidden ring-1" ref="hueco" />

    <div class="flex flex-wrap items-center gap-2">
      <UButton
        label="Deshacer punto"
        icon="i-lucide-undo-2"
        size="xs"
        :disabled="disabled || vertices.length === 0"
        @click="deshacer"
      />
      <UButton
        label="Empezar de nuevo"
        icon="i-lucide-eraser"
        size="xs"
        :disabled="disabled || vertices.length === 0"
        @click="limpiar"
      />
      <UButton
        :label="capa === 'satelite' ? 'Ver calles' : 'Ver satélite'"
        :icon="capa === 'satelite' ? 'i-lucide-map' : 'i-lucide-satellite'"
        size="xs"
        @click="capa = capa === 'satelite' ? 'calles' : 'satelite'"
      />
      <div class="flex items-center gap-2">
        <UIcon name="i-lucide-sun" class="text-dimmed size-4 shrink-0" />
        <USlider
          v-model="claridad"
          :min="0"
          :max="100"
          :step="5"
          size="xs"
          class="w-24"
          aria-label="Aclarar la foto"
        />
        <UButton v-if="claridad !== 35" label="Normal" size="xs" @click="claridad = 35" />
      </div>
      <span class="text-dimmed text-xs">
        <template v-if="vertices.length === 0">
          Toca el mapa para marcar las esquinas de la base sobre la foto. La línea punteada es el
          círculo actual: fíjate en cuánta calle abarca.
        </template>
        <template v-else-if="!suficientes">
          {{ vertices.length }} de 3 puntos mínimos. Sigue tocando el mapa para marcar las demás
          esquinas.
        </template>
        <template v-else>
          {{ vertices.length }} esquinas · {{ superficie.toLocaleString('es-MX') }} m² · arrastra
          una esquina para moverla, o un punto hueco del borde para añadir otra. Doble toque en una
          esquina la quita.
        </template>
      </span>
    </div>

    <!--
      Se dice lo que cambia al guardar. Sin esta línea, quien dibuja no tiene
      forma de saber que acaba de dejar el radio sin efecto.
    -->
    <p v-if="suficientes" class="text-muted text-xs">
      Al guardar, el área manda sobre el radio: una checada de contingencia solo valdrá dentro de
      esta figura, más el margen de error que declare el teléfono.
    </p>
  </div>
</template>

<style scoped>
/*
  LOS TIRADORES: UN PUNTO PEQUEÑO DENTRO DE UNA CAJA GRANDE.

  Lo que se ve mide doce o catorce píxeles, que es lo que no estorba encima de
  una foto aérea; lo que el dedo agarra es la caja transparente de treinta y
  pico que lo rodea. Con un blanco del tamaño del dibujo, en un teléfono el
  gesto falla y lo que se mueve es el mapa.
*/
:deep(.clocc-tirador) {
  display: flex;
  align-items: center;
  justify-content: center;
  background: none;
  border: 0;
  cursor: grab;
  touch-action: none;
}

:deep(.clocc-tirador:active) {
  cursor: grabbing;
}

:deep(.clocc-vertice) {
  width: 14px;
  height: 14px;
  border-radius: 999px;
  background: #fff;
  border: 3px solid #0ea5e9;
  /* Sobre un techo blanco el punto desaparecía: la sombra lo despega del fondo. */
  box-shadow: 0 1px 4px rgb(0 0 0 / 45%);
}

/*
  El de añadir se distingue del de mover SIN leer nada: hueco y a medio tono,
  como el hueco que viene a llenar.
*/
:deep(.clocc-medio) {
  width: 12px;
  height: 12px;
  border-radius: 999px;
  background: rgb(255 255 255 / 55%);
  border: 2px solid #0ea5e9;
  box-shadow: 0 1px 3px rgb(0 0 0 / 35%);
}

/*
  Al pasar del nivel donde hay foto, el navegador ESTIRA el cuadro y lo suaviza
  con su interpolación: el filo de una barda se convierte en un degradado. Se le
  pide que conserve el contraste al ampliar; el resultado se ve más granulado y
  más nítido, que es lo que sirve para colocar una esquina.
*/
:deep(.leaflet-tile) {
  image-rendering: -webkit-optimize-contrast;
}
</style>
