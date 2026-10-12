<script setup lang="ts">
import IconSymbol from "./IconSymbol.vue";
import {
  hideWindow,
  minimizeWindow,
  startWindowDrag,
} from "../services/desktop";

defineProps<{
  subtitle?: string;
}>();

const emit = defineEmits<{
  settings: [];
}>();
</script>

<template>
  <header
    class="window-chrome"
    data-tauri-drag-region
    @mousedown.left="startWindowDrag"
  >
    <div class="brand-lockup" data-tauri-drag-region>
      <span class="brand-seal" aria-hidden="true">诗</span>
      <div data-tauri-drag-region>
        <strong>今日诗笺</strong>
        <small v-if="subtitle">{{ subtitle }}</small>
      </div>
    </div>
    <div class="window-actions">
      <button class="icon-button" type="button" aria-label="设置" @click="emit('settings')">
        <IconSymbol name="settings" :size="17" />
      </button>
      <button class="icon-button" type="button" aria-label="最小化" @click="minimizeWindow">
        <IconSymbol name="minimize" :size="17" />
      </button>
      <button class="icon-button" type="button" aria-label="隐藏到托盘" @click="hideWindow">
        <IconSymbol name="close" :size="17" />
      </button>
    </div>
  </header>
</template>
