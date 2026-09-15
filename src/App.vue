<template>
  <UApp
    :tooltip="{ delayDuration: 0 }"
    :toaster="{ position: 'top-right', expand: false, duration: 4000 }"
  >
    <RouterView />
  </UApp>
</template>
