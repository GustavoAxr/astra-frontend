<script setup lang="ts">
import { computed, ref } from 'vue'
import { useElementSize } from '@vueuse/core'
import type { SummaryDay } from '../types'

/**
 * Barras apiladas: cómo se repartió cada día entre puntuales, retardos, faltas,
 * incompletos y quien no tenía turno.
 *
 * POR QUÉ SVG A MANO Y NO UNA LIBRERÍA DE GRÁFICAS
 * Una barra apilada son rectángulos. Traer doscientos kilobytes para dibujarlos
 * obligaría además a cablearle el tema —esta aplicación tiene claro y oscuro— y
 * a repetir la paleta en su formato. Con SVG y las clases del tema, la gráfica
 * cambia de color sola cuando alguien cambia de tema.
 *
 * POR QUÉ SE PINTA «SIN TURNO»
 * Es la categoría que más explica. Sin ella, un periodo con cuarenta y dos
 * personas dibujaría barras de tres y parecería que faltan datos, cuando lo
 * que falta es asignarles turno.
 */
const props = defineProps<{ days: SummaryDay[]; selected?: string | null }>()
const emit = defineEmits<{ select: [fecha: string] }>()

interface Tramo {
  clave: string
  label: string
  color: string
  valor: (d: SummaryDay) => number
}

const TRAMOS: Tramo[] = [
  { clave: 'onTime', label: 'Puntual', color: 'fill-success', valor: (d) => d.onTime },
  { clave: 'late', label: 'Retardo', color: 'fill-warning', valor: (d) => d.late },
  { clave: 'absent', label: 'Falta', color: 'fill-error', valor: (d) => d.absent },
  /*
   * PEGADO al de faltas y a propósito: quien mire la barra tiene que ver de un
   * vistazo cuánto de lo que parece ausencia es en realidad un día que el reloj
   * no reportó. En ámbar rayado, no en rojo: no es una falta.
   */
  {
    clave: 'noData',
    label: 'Sin datos del reloj',
    color: 'fill-warning opacity-50',
    valor: (d) => d.noData,
  },
  { clave: 'incomplete', label: 'Incompleto', color: 'fill-info', valor: (d) => d.incomplete },
  // Lo que trae la migración 019. Sin estos tramos, un puente de tres días
  // dibujaría barras a la mitad y parecería que faltan datos, cuando lo que
  // hay es gente de vacaciones y un festivo.
  {
    clave: 'incidence',
    label: 'Incidencia',
    color: 'fill-info opacity-60',
    valor: (d) => d.incidence,
  },
  { clave: 'holiday', label: 'Festivo', color: 'fill-info opacity-30', valor: (d) => d.holiday },
  {
    clave: 'offsite',
    label: 'Fuera de sede',
    color: 'fill-success opacity-50',
    valor: (d) => d.offsite,
  },
  {
    clave: 'noSchedule',
    label: 'Sin turno',
    color: 'fill-current opacity-25',
    valor: (d) => d.noSchedule,
  },
]

/**
 * Tramos apagados desde la leyenda.
 *
 * «Sin turno» es el candidato obvio: cuando casi nadie tiene adscripción,
 * aplasta todo lo demás contra el suelo y no se ve nada. Apagarlo deja mirar el
 * reparto de quienes SÍ tienen turno, y la escala se recalcula sola.
 */
const apagados = ref(new Set<string>())
const activos = computed(() => TRAMOS.filter((t) => !apagados.value.has(t.clave)))

function alternar(clave: string): void {
  const copia = new Set(apagados.value)
  if (copia.has(clave)) copia.delete(clave)
  else copia.add(clave)
  // Apagarlos todos dejaría un lienzo en blanco sin explicación.
  if (copia.size < TRAMOS.length) apagados.value = copia
}

const caja = ref<HTMLElement | null>(null)
const { width } = useElementSize(caja)
const señalado = ref<number | null>(null)

const ALTO = 150
const HUECO = 3

const total = (d: SummaryDay): number => activos.value.reduce((suma, t) => suma + t.valor(d), 0)

const maximo = computed(() => Math.max(1, ...props.days.map(total)))

const anchoBarra = computed(() => {
  const n = Math.max(1, props.days.length)
  // Reparte el ancho disponible en vez de fijarlo: con un mes de datos las
  // barras se estrechan solas y no aparece una barra de desplazamiento.
  return Math.max(4, (width.value || 600) / n - HUECO)
})

const barras = computed(() =>
  props.days.map((d, i) => {
    let acumulado = 0
    const tramos = activos.value
      .map((t) => {
        const valor = t.valor(d)
        const alto = (valor / maximo.value) * ALTO
        const y = ALTO - acumulado - alto
        acumulado += alto
        return { ...t, valor, alto, y }
      })
      .filter((t) => t.valor > 0)

    return {
      i,
      dia: d,
      x: i * (anchoBarra.value + HUECO),
      tramos,
      // Un día enteramente de descanso se marca con una raya, no con un hueco:
      // así se distingue de un día sin datos.
      soloDescanso: total(d) === 0 && d.rest > 0,
    }
  }),
)

const detalle = computed(() => (señalado.value === null ? null : props.days[señalado.value]))

const fecha = new Intl.DateTimeFormat('es-MX', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
})
const dia = (iso: string): string => {
  const [y, m, d] = iso.split('-').map(Number)
  return fecha.format(new Date(y ?? 0, (m ?? 1) - 1, d ?? 1))
}
</script>

<template>
  <div ref="caja" class="space-y-2">
    <svg
      :width="width || 600"
      :height="ALTO + 4"
      :viewBox="`0 0 ${width || 600} ${ALTO + 4}`"
      class="w-full cursor-pointer"
      role="img"
      aria-label="Reparto de la plantilla por día"
      @mouseleave="señalado = null"
    >
      <g
        v-for="b in barras"
        :key="b.dia.date"
        @mouseenter="señalado = b.i"
        @focusin="señalado = b.i"
      >
        <!-- Zona sensible de altura completa: apuntar a un tramo de dos
             píxeles sería imposible. -->
        <rect
          :x="b.x"
          y="0"
          :width="anchoBarra"
          :height="ALTO"
          class="fill-current opacity-0 hover:opacity-5"
          tabindex="0"
          role="button"
          :aria-label="`Ver el detalle de ${b.dia.date}`"
          @click="emit('select', b.dia.date)"
          @keydown.enter="emit('select', b.dia.date)"
        />

        <!-- El día abierto se subraya: hay una tabla debajo que depende de él. -->
        <rect
          v-if="selected === b.dia.date"
          :x="b.x"
          :y="ALTO + 1"
          :width="anchoBarra"
          height="3"
          class="fill-primary"
          rx="1"
        />

        <rect
          v-for="t in b.tramos"
          :key="t.clave"
          :x="b.x"
          :y="t.y"
          :width="anchoBarra"
          :height="Math.max(1, t.alto)"
          :class="[t.color, 'transition-all duration-300']"
          :opacity="señalado === null || señalado === b.i ? 1 : 0.4"
          rx="2"
        />

        <rect
          v-if="b.soloDescanso"
          :x="b.x"
          :y="ALTO - 3"
          :width="anchoBarra"
          height="3"
          class="fill-current opacity-25"
          rx="1"
        />
      </g>
    </svg>

    <!--
      El detalle ocupa el mismo hueco que la ayuda, en vez de flotar sobre la
      gráfica: así nada salta de sitio al pasar el ratón.
    -->
    <p v-if="detalle" class="text-sm">
      <span class="capitalize">{{ dia(detalle.date) }}</span>
      <template v-for="t in TRAMOS" :key="t.clave">
        <span v-if="t.valor(detalle) > 0" class="text-muted">
          · {{ t.valor(detalle) }} {{ t.label.toLowerCase() }}
        </span>
      </template>
      <span v-if="detalle.rest > 0" class="text-muted">· {{ detalle.rest }} descanso</span>
    </p>
    <p v-else class="text-dimmed text-sm">
      Pulsa un día para ver a toda la plantilla de esa fecha. Las etiquetas de abajo dejan un tramo
      fuera del apilado.
    </p>

    <div class="flex flex-wrap gap-x-4 gap-y-1 text-xs">
      <button
        v-for="t in TRAMOS"
        :key="t.clave"
        type="button"
        class="flex cursor-pointer items-center gap-1.5"
        :class="apagados.has(t.clave) ? 'opacity-40' : ''"
        :aria-pressed="!apagados.has(t.clave)"
        @click="alternar(t.clave)"
      >
        <svg width="10" height="10" aria-hidden="true">
          <rect width="10" height="10" rx="2" :class="t.color" />
        </svg>
        <span class="text-muted" :class="apagados.has(t.clave) ? 'line-through' : ''">
          {{ t.label }}
        </span>
      </button>
    </div>
  </div>
</template>
