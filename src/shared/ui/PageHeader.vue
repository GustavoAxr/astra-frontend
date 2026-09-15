<script setup lang="ts">
/**
 * LA FILA DE ACCIONES DE UNA PANTALLA. Ya no lleva título, y es a propósito.
 *
 * EL NOMBRE DE LA PANTALLA LO DICE LA BARRA DE ARRIBA, que lo saca de
 * `route.meta.title`. Repetirlo aquí en grande obligaba a leer «Asistencia» dos
 * veces con dos centímetros de separación, y el segundo empujaba hacia abajo la
 * tabla que se viene a mirar.
 *
 * También se le quitaron el subtítulo y la cifra. El subtítulo explicaba de qué
 * iba la pantalla a quien ya estaba dentro de ella, y la cifra repetía lo que la
 * propia tabla enseña — un «0» en un globo al lado del título es ruido con forma
 * de dato. Lo que de verdad hace falta explicar se explica donde pasa: en el
 * estado vacío, en la ayuda de un campo, en el aviso de un error.
 *
 * TAMPOCO LLEVA RAYA DEBAJO. Separaba un título que ya no está de una tabla que
 * trae su propia cabecera: dos líneas horizontales a tres centímetros que no
 * dividían nada.
 *
 * Una pantalla SIN acciones no monta esto: sería un hueco y nada más.
 */
</script>

<template>
  <header class="flex flex-wrap items-center justify-end gap-2">
    <slot name="actions" />
  </header>
</template>
