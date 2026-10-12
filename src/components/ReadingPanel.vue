<script setup lang="ts">
import { useInitialFocus } from "../composables/useInitialFocus";
import type { Poem } from "../types";
import IconSymbol from "./IconSymbol.vue";

defineProps<{
  poem: Poem;
  favorite: boolean;
  backLabel: string;
}>();

const emit = defineEmits<{
  back: [];
  favorite: [];
}>();

useInitialFocus();
</script>

<template>
  <main
    ref="initialFocusTarget"
    class="reading-panel"
    aria-labelledby="reading-title"
    tabindex="-1"
  >
    <header class="panel-header">
      <button class="back-button" type="button" @click="emit('back')">
        <IconSymbol name="back" :size="18" />
        {{ backLabel }}
      </button>
      <button
        class="icon-button"
        type="button"
        :aria-label="favorite ? '取消收藏' : '收藏'"
        :aria-pressed="favorite"
        @click="emit('favorite')"
      >
        <IconSymbol :name="favorite ? 'bookmark-filled' : 'bookmark'" :size="19" />
      </button>
    </header>

    <article class="reading-content" aria-labelledby="reading-title">
      <p class="eyebrow">{{ poem.dynasty }} · {{ poem.literaryForm }}</p>
      <h1 id="reading-title">{{ poem.title }}</h1>
      <p class="reading-author">{{ poem.author }}</p>
      <div class="full-poem" role="group" aria-label="诗词全文">
        <p v-for="line in poem.fullText" :key="line">{{ line }}</p>
      </div>

      <section class="reading-section">
        <h2>放回它的时代</h2>
        <p>{{ poem.culturalBackground }}</p>
      </section>
      <section class="reading-section">
        <h2>放进今天</h2>
        <p>{{ poem.contemporaryConnection }}</p>
      </section>
      <section v-if="poem.annotations.length" class="reading-section">
        <h2>词句小注</h2>
        <dl class="annotation-list">
          <div v-for="item in poem.annotations" :key="item.term">
            <dt>{{ item.term }}</dt>
            <dd>{{ item.explanation }}</dd>
          </div>
        </dl>
      </section>
      <p class="edition-note" aria-label="文本来源">
        文本来源：{{ poem.sourceName }}
      </p>
    </article>
  </main>
</template>
