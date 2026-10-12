<script setup lang="ts">
import { useInitialFocus } from "../composables/useInitialFocus";

defineProps<{
  hasAlternative: boolean;
  globallySuspended: boolean;
}>();

defineEmits<{
  replace: [];
}>();

useInitialFocus();
</script>

<template>
  <main
    ref="initialFocusTarget"
    class="content-correction-view"
    role="status"
    aria-live="polite"
    aria-labelledby="content-correction-title"
    tabindex="-1"
  >
    <p class="eyebrow">内容保护</p>
    <h1 id="content-correction-title">今日内容正在校正</h1>
    <p>
      {{
        globallySuspended
          ? "内容服务已暂缓展示，恢复前不会推送新的诗笺。"
          : "当前诗笺已暂时撤回，我们不会继续展示可能有误的文本。"
      }}
    </p>
    <button
      v-if="hasAlternative"
      class="primary-button"
      type="button"
      @click="$emit('replace')"
    >
      换一首已核验内容
    </button>
    <small v-else>暂时没有可展示的内容，请稍后再打开。</small>
  </main>
</template>
