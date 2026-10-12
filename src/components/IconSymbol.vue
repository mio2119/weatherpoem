<script setup lang="ts">
defineProps<{
  name:
    | "back"
    | "bookmark"
    | "bookmark-filled"
    | "check"
    | "close"
    | "expand"
    | "info"
    | "minimize"
    | "settings"
    | "swap"
    | "warning";
  size?: number;
}>();
</script>

<template>
  <svg
    class="icon-symbol"
    :width="size ?? 19"
    :height="size ?? 19"
    viewBox="0 0 24 24"
    fill="none"
    aria-hidden="true"
  >
    <template v-if="name === 'back'">
      <path d="M15.5 5 8.5 12l7 7" />
    </template>
    <template v-else-if="name === 'bookmark'">
      <path d="M7 4.5h10v15l-5-3.2L7 19.5v-15Z" />
    </template>
    <template v-else-if="name === 'bookmark-filled'">
      <path
        d="M7 4.5h10v15l-5-3.2L7 19.5v-15Z"
        fill="currentColor"
      />
    </template>
    <template v-else-if="name === 'check'">
      <path d="m5.5 12.5 4 4 9-9" />
    </template>
    <template v-else-if="name === 'close'">
      <path d="m7 7 10 10M17 7 7 17" />
    </template>
    <template v-else-if="name === 'expand'">
      <path d="M8 4.5H4.5V8M16 4.5h3.5V8M8 19.5H4.5V16M16 19.5h3.5V16" />
    </template>
    <template v-else-if="name === 'info'">
      <circle cx="12" cy="12" r="8" />
      <path d="M12 10.7v5M12 7.6h.01" />
    </template>
    <template v-else-if="name === 'minimize'">
      <path d="M6.5 12h11" />
    </template>
    <template v-else-if="name === 'settings'">
      <circle cx="12" cy="12" r="3" />
      <path
        d="M19 13.7v-3.4l-2-.5a7 7 0 0 0-.7-1.6l1-1.8-2.4-2.4-1.8 1a7 7 0 0 0-1.6-.7l-.5-2H7.6l-.5 2a7 7 0 0 0-1.6.7l-1.8-1-2.4 2.4 1 1.8a7 7 0 0 0-.7 1.6l-2 .5v3.4l2 .5a7 7 0 0 0 .7 1.6l-1 1.8L3.7 20l1.8-1a7 7 0 0 0 1.6.7l.5 2H11l.5-2a7 7 0 0 0 1.6-.7l1.8 1 2.4-2.4-1-1.8a7 7 0 0 0 .7-1.6l2-.5Z"
        transform="translate(2 -0.1) scale(.82)"
      />
    </template>
    <template v-else-if="name === 'swap'">
      <path d="M5 8h12l-3-3M19 16H7l3 3" />
    </template>
    <template v-else-if="name === 'warning'">
      <path d="M12 3.5 21 20H3L12 3.5Z" />
      <path d="M12 9v5M12 17.2h.01" />
    </template>
  </svg>
</template>
