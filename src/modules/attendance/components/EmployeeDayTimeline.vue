<script setup lang="ts">
import { computed } from 'vue'
import type { DerivedDay } from '../types'

/**
 * Un renglón por día, con las horas de izquierda a derecha.
 *
 * POR QUÉ ASÍ Y NO CON BARRAS DE ALTURA
 * La primera versión eran barras cuya ALTURA era lo trabajado. Nadie entendía
 * nada, y con razón: una altura no dice a qué hora entró, y «llegó tarde» —que
 * es la pregunta— no se veía por ningún lado. Aquí el eje es la hora del día,
 * así que el retardo se VE: la barra sólida empieza más a la derecha que la
 * clara. Y el que se fue antes, termina antes.
 *
 * La barra CLARA es lo que su turno esperaba. La SÓLIDA, entre su primera y su
 * última checada. Cada renglón lleva su fecha y su total, así que se puede leer
 * como una tabla aunque nadie mire los colores.
 */
const props = defineProps<{ days: DerivedDay[] }>()

const COLOR: Record<string, string> = {
  ON_TIME: 'bg-success',
  LATE: 'bg-warning',
  ABSENT: 'bg-error',
  INCOMPLETE: 'bg-info',
}

const ETIQUETA: Record<string, string> = {
  ON_TIME: 'A tiempo',
  LATE: 'Retardo',
  ABSENT: 'Falta',
  INCOMPLETE: 'Incompleto',
  REST: 'Descanso',
  NO_SCHEDULE: 'Sin turno',
}

/**
 * Minutos desde la medianoche del día al que pertenece la jornada.
 *
 * Se cuenta desde ESE día y no desde la medianoche del reloj para que una
 * salida de madrugada dé más de 1440 en vez de volver al principio del eje:
 * un turno que cruza la medianoche tiene que dibujarse como una barra continua,
 * no partida en dos.
 */
function minutos(workDate: string, iso: string | null): number | null {
  if (!iso) return null
  const [y, m, d] = workDate.split('-').map(Number)
  const medianoche = new Date(y ?? 0, (m ?? 1) - 1, d ?? 1).getTime()
  return Math.round((new Date(iso).getTime() - medianoche) / 60_000)
}

const filas = computed(() =>
  props.days.map((dia) => ({
    dia,
    inicioEsperado: minutos(dia.workDate, dia.expectedStart),
    finEsperado: minutos(dia.workDate, dia.expectedEnd),
    primera: minutos(dia.workDate, dia.firstPunch),
    ultima: minutos(dia.workDate, dia.lastPunch),
  })),
)

/** El eje abarca lo esperado Y lo ocurrido, redondeado a horas enteras. */
const eje = computed(() => {
  const valores = filas.value
    .flatMap((f) => [f.inicioEsperado, f.finEsperado, f.primera, f.ultima])
    .filter((v): v is number => v !== null)

  if (valores.length === 0) return { desde: 6 * 60, hasta: 20 * 60 }

  const desde = Math.floor(Math.min(...valores) / 60) * 60
  const hasta = Math.ceil(Math.max(...valores) / 60) * 60
  // Un mínimo de seis horas de ancho: con una sola checada el eje sería un
  // punto y todas las barras quedarían pegadas.
  return hasta - desde < 360 ? { desde, hasta: desde + 360 } : { desde, hasta }
})

const largo = computed(() => Math.max(1, eje.value.hasta - eje.value.desde))
const pct = (m: number): number => ((m - eje.value.desde) / largo.value) * 100

/** Una marca por hora, o cada dos si el rango es largo, para no amontonarlas. */
const marcas = computed(() => {
  const paso = largo.value > 12 * 60 ? 120 : 60
  const salida: { m: number; label: string }[] = []
  for (let m = eje.value.desde; m <= eje.value.hasta; m += paso) {
    const h = Math.floor(m / 60) % 24
    salida.push({ m, label: `${String(h).padStart(2, '0')}h` })
  }
  return salida
})

const fecha = new Intl.DateTimeFormat('es-MX', { weekday: 'short', day: 'numeric' })
const dia = (iso: string): string => {
  const [y, m, d] = iso.split('-').map(Number)
  return fecha.format(new Date(y ?? 0, (m ?? 1) - 1, d ?? 1))
}

const hora = new Intl.DateTimeFormat('es-MX', { timeStyle: 'short' })
const reloj = (iso: string | null): string => (iso ? hora.format(new Date(iso)) : '—')

function hhmm(m: number): string {
  if (!m) return '—'
  const h = Math.floor(m / 60)
  return m % 60 === 0 ? `${h} h` : h === 0 ? `${m} min` : `${h} h ${m % 60} min`
}
</script>

<template>
  <div class="space-y-1">
    <!-- Las horas, arriba y una sola vez: son las mismas para todos los días. -->
    <div class="flex items-end gap-3 pb-1">
      <span class="w-16 shrink-0"></span>
      <div class="relative h-4 flex-1">
        <span
          v-for="t in marcas"
          :key="t.m"
          class="text-dimmed absolute -translate-x-1/2 text-[10px]"
          :style="{ left: `${pct(t.m)}%` }"
        >
          {{ t.label }}
        </span>
      </div>
      <span class="text-dimmed w-32 shrink-0 text-right text-[10px]">trabajado</span>
    </div>

    <div
      v-for="f in filas"
      :key="f.dia.workDate"
      class="hover:bg-elevated/40 flex items-center gap-3 rounded py-1 transition-colors"
    >
      <span class="text-muted w-16 shrink-0 text-xs capitalize">{{ dia(f.dia.workDate) }}</span>

      <div class="relative h-5 flex-1">
        <!-- Rejilla: sin ella no se sabe si esa barra empieza a las 8 o a las 9. -->
        <span
          v-for="t in marcas"
          :key="t.m"
          class="border-default absolute inset-y-0 border-l opacity-40"
          :style="{ left: `${pct(t.m)}%` }"
        />

        <!-- Lo que el turno esperaba. -->
        <span
          v-if="f.inicioEsperado !== null && f.finEsperado !== null"
          class="bg-elevated absolute inset-y-1 rounded"
          :style="{
            left: `${pct(f.inicioEsperado)}%`,
            width: `${Math.max(0.5, pct(f.finEsperado) - pct(f.inicioEsperado))}%`,
          }"
          :title="`Su turno: ${reloj(f.dia.expectedStart)} a ${reloj(f.dia.expectedEnd)}`"
        />

        <!-- Lo que ocurrió, entre la primera y la última checada. -->
        <span
          v-if="f.primera !== null && f.ultima !== null && f.ultima > f.primera"
          class="absolute inset-y-0 rounded"
          :class="COLOR[f.dia.status] ?? 'bg-muted'"
          :style="{
            left: `${pct(f.primera)}%`,
            width: `${Math.max(0.5, pct(f.ultima) - pct(f.primera))}%`,
          }"
          :title="`${reloj(f.dia.firstPunch)} → ${reloj(f.dia.lastPunch)}`"
        />

        <!-- Una sola checada: un palito, no una barra de ancho cero. -->
        <span
          v-else-if="f.primera !== null"
          class="absolute inset-y-0 w-1 rounded"
          :class="COLOR[f.dia.status] ?? 'bg-muted'"
          :style="{ left: `${pct(f.primera)}%` }"
          :title="`Una sola checada: ${reloj(f.dia.firstPunch)}`"
        />

        <span
          v-if="f.dia.status === 'REST' && f.primera === null"
          class="text-dimmed absolute inset-y-0 left-0 text-[10px] leading-5"
        >
          descanso
        </span>
      </div>

      <span class="w-32 shrink-0 text-right text-xs">
        <template v-if="f.dia.workedMinutes">
          <span class="text-highlighted">{{ hhmm(f.dia.workedMinutes) }}</span>
          <span v-if="f.dia.lateMinutes" class="text-warning">
            · {{ f.dia.lateMinutes }} min tarde
          </span>
        </template>
        <span v-else class="text-dimmed">{{ ETIQUETA[f.dia.status] ?? f.dia.status }}</span>
      </span>
    </div>

    <p class="text-dimmed pt-1 text-xs">
      La barra clara es lo que esperaba su turno; la de color, entre su primera y su última checada.
      Si la de color empieza más a la derecha, llegó tarde.
    </p>
  </div>
</template>
