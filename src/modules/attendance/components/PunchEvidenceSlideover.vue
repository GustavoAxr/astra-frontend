<script setup lang="ts">
import { computed, ref } from 'vue'
import { punchTypeLook } from '@/domain/punch'
import { parseVerificationMethod } from '@/domain/verification'
import { deviceUserTypeLook } from '@/domain/device-user-type'
import { describirEvento, glosaDeCampo } from '../isapi-glosario'
import type { Punch } from '../types'

const props = defineProps<{ punch: Punch }>()
const open = defineModel<boolean>('open', { default: false })

const crudoTexto = ref(false)
const copiado = ref(false)

const stamp = new Intl.DateTimeFormat('es-MX', { dateStyle: 'full', timeStyle: 'medium' })
const when = (iso: string | null): string => (iso ? stamp.format(new Date(iso)) : '—')

const raw = computed(() => props.punch.raw)

/** El literal que mandó el equipo para un campo, listo para citar. */
function crudo(clave: string): string | null {
  const v = raw.value?.[clave]
  if (v === undefined || v === null) return null
  return typeof v === 'string' ? `«${v}»` : String(v)
}

const citar = (clave: string): string => {
  const v = crudo(clave)
  return v === null ? `el equipo no mandó \`${clave}\`` : `\`${clave}\`: ${v}`
}

/**
 * Cada conclusión con el campo crudo del que salió.
 *
 * Es la mitad interesante de esta pantalla: no basta con ver el JSON, hay que
 * poder seguir el hilo desde lo que se pinta hasta lo que llegó. Cuando un
 * reloj nuevo se porta raro, esta columna dice si el fallo está en el aparato
 * o en nuestra lectura.
 */
const derivados = computed(() => {
  const p = props.punch
  const tipo = punchTypeLook(p.punchType)
  const metodo = parseVerificationMethod(p.verificationMethod)
  const reloj = deviceUserTypeLook(p.deviceUserType)

  return [
    {
      campo: 'Persona',
      valor: `${p.employeeCode} · ${p.employeeName}`,
      origen: citar('employeeNoString'),
      detalle:
        'El reloj solo manda su número interno. Astra lo traduce a persona con ' +
        'el enrolamiento del equipo; si no hay correspondencia, el marcaje se va ' +
        'a la bandeja de conciliación en vez de perderse.',
    },
    {
      campo: 'Evento del equipo',
      valor: describirEvento(raw.value) ?? 'No consta',
      origen: `${citar('major')} · ${citar('minor')}`,
      detalle:
        'La familia manda sobre el subtipo: el mismo número significa una cosa ' +
        'en control de acceso y otra en operación del equipo.',
    },
    {
      campo: 'Momento',
      valor: when(p.punchTime),
      origen: citar('time'),
      detalle: `Es la hora que DECLARA el equipo. La autoritativa es la del servidor al recibirlo: ${when(p.receivedAt)}.`,
    },
    {
      campo: 'Tipo',
      valor: tipo.label,
      origen: citar('attendanceStatus'),
      detalle: tipo.detail,
    },
    {
      campo: 'Cómo se identificó',
      valor: metodo.label,
      origen: citar('currentVerifyMode'),
      detalle: metodo.detail,
    },
    {
      campo: 'Estado en el reloj',
      valor: reloj.label,
      origen: citar('userType'),
      detalle: reloj.detail,
    },
    {
      campo: 'Reloj',
      valor: [p.deviceBrand, p.deviceModel].filter(Boolean).join(' ') || 'No consta',
      origen: p.serialNumber ? `serie ${p.serialNumber}` : 'sin número de serie',
      detalle:
        'La serie sale del alta del equipo, no del evento: el reloj no la ' +
        'repite en cada marcaje. Aquí está entera porque es lo que identifica ' +
        'al aparato ante el fabricante.',
    },
    {
      campo: 'Confianza',
      valor: p.trustLevel === null ? 'No consta' : `${p.trustLevel} de 100`,
      origen: 'no viene del equipo',
      detalle:
        'La fija la ingesta según el canal por el que entró el marcaje. Un ' +
        'aparato no puede declarar cuánto merece que se le crea.',
    },
    {
      campo: 'Desfase del reloj',
      valor: p.clockOffsetMs === null ? 'No medido' : `${(p.clockOffsetMs / 1000).toFixed(1)} s`,
      origen: 'medido al sincronizar',
      detalle:
        'Diferencia entre la hora del equipo y la del servidor. Si es grande, ' +
        'el motor marca la anomalía en vez de corregir en silencio.',
    },
  ]
})

/** Los campos crudos, con su glosa cuando la hay. */
const campos = computed(() =>
  Object.entries(raw.value ?? {}).map(([clave, valor]) => ({
    clave,
    valor: typeof valor === 'string' ? valor : JSON.stringify(valor),
    glosa: glosaDeCampo(clave),
    retirado: typeof valor === 'string' && valor.startsWith('[retirado'),
  })),
)

const hayRetirados = computed(() => campos.value.some((c) => c.retirado))
const json = computed(() => JSON.stringify(raw.value ?? {}, null, 2))

async function copiar(): Promise<void> {
  await navigator.clipboard.writeText(json.value)
  copiado.value = true
  window.setTimeout(() => (copiado.value = false), 2000)
}
</script>

<template>
  <USlideover v-model:open="open" title="Evidencia del marcaje" :ui="{ content: 'max-w-2xl' }">
    <template #description>
      Lo que llegó del equipo y cómo se leyó. No se edita ni se borra.
    </template>

    <template #body>
      <div class="space-y-6">
        <!-- Lo que concluyó Astra, con el campo crudo del que salió cada cosa. -->
        <section class="space-y-1">
          <h3 class="text-sm font-medium">Cómo se leyó</h3>
          <div
            v-for="fila in derivados"
            :key="fila.campo"
            class="border-default grid grid-cols-3 gap-3 border-b py-2 last:border-0"
          >
            <div class="text-dimmed text-xs">{{ fila.campo }}</div>
            <div class="text-sm">{{ fila.valor }}</div>
            <div class="text-dimmed font-mono text-xs" :title="fila.detalle">
              {{ fila.origen }}
            </div>
          </div>
        </section>

        <!--
          Regla 5. Si el equipo mandó una foto o una plantilla, la clave sigue
          a la vista y el valor no: que desaparezca haría creer que el aparato
          no la mandó, y eso lleva a diagnosticar el equipo equivocado.
        -->
        <UAlert
          v-if="hayRetirados"
          color="warning"
          icon="i-lucide-shield"
          title="Este evento traía datos biométricos"
          description="El equipo los mandó sin que se los pidieran. No se guardan ni se sirven; la clave queda a la vista para que conste que llegaron."
        />

        <section class="space-y-1">
          <div class="flex items-center justify-between">
            <h3 class="text-sm font-medium">Lo que mandó el equipo</h3>
            <div class="flex gap-1">
              <UButton
                :label="crudoTexto ? 'Ver por campo' : 'Ver el JSON tal cual'"
                size="xs"
                @click="crudoTexto = !crudoTexto"
              />
              <UButton
                :label="copiado ? 'Copiado' : 'Copiar'"
                :icon="copiado ? 'i-lucide-check' : 'i-lucide-copy'"
                size="xs"
                @click="copiar"
              />
            </div>
          </div>

          <p v-if="!raw" class="text-dimmed text-sm">
            Este marcaje no guardó la carga del equipo. Pasa con los que se capturaron a mano y con
            los que entraron antes de que se conservara.
          </p>

          <pre
            v-else-if="crudoTexto"
            class="bg-elevated/50 overflow-x-auto rounded p-3 font-mono text-xs"
            >{{ json }}</pre>

          <template v-else>
            <div
              v-for="campo in campos"
              :key="campo.clave"
              class="border-default grid grid-cols-3 gap-3 border-b py-2 last:border-0"
            >
              <div class="font-mono text-xs">{{ campo.clave }}</div>
              <div class="font-mono text-xs" :class="campo.retirado ? 'text-warning' : ''">
                {{ campo.valor }}
              </div>
              <div class="text-dimmed text-xs">{{ campo.glosa ?? '—' }}</div>
            </div>
          </template>
        </section>
      </div>
    </template>
  </USlideover>
</template>
