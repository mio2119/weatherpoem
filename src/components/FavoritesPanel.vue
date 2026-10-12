<script setup lang="ts">
import { useInitialFocus } from "../composables/useInitialFocus";
import type { Poem } from "../types";
import IconSymbol from "./IconSymbol.vue";

defineProps<{
  poems: Poem[];
  backLabel: string;
}>();

const emit = defineEmits<{
  back: [];
  open: [poem: Poem];
  remove: [workId: string];
}>();

useInitialFocus();
</script>

<template>
  <main
    ref="initialFocusTarget"
    class="favorites-panel"
    aria-labelledby="favorites-title"
    tabindex="-1"
  >
    <header class="panel-header">
      <button class="back-button" type="button" @click="emit('back')">
        <IconSymbol name="back" :size="18" />
        {{ backLabel }}
      </button>
      <h1 id="favorites-title">我的收藏</h1>
      <span class="header-spacer" />
    </header>

    <section
      v-if="poems.length"
      class="favorites-list"
      aria-label="已收藏诗词"
    >
      <article v-for="poem in poems" :key="poem.id" class="favorite-item">
        <button
          class="favorite-open"
          type="button"
          @click="emit('open', poem)"
        >
          <span class="favorite-meta">{{ poem.dynasty }} · {{ poem.author }}</span>
          <strong>{{ poem.title }}</strong>
          <span class="favorite-excerpt">{{ poem.excerpt.join("，") }}</span>
        </button>
        <button
          class="favorite-remove"
          type="button"
          :aria-label="`取消收藏《${poem.title}》`"
          @click="emit('remove', poem.id)"
        >
          <IconSymbol name="bookmark-filled" :size="18" />
        </button>
      </article>
    </section>

    <section v-else class="empty-favorites">
      <span class="brand-seal" aria-hidden="true">藏</span>
      <h2>收藏还是空的</h2>
      <p>遇到想再读的诗，点一下诗笺下方的“收藏”即可。</p>
    </section>
  </main>
</template>
