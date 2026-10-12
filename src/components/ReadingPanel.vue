<script setup lang="ts">
import { computed } from "vue";
import { displayedPoemLines } from "../core/poem-layout";
import { useInitialFocus } from "../composables/useInitialFocus";
import type { Poem, PoemFontSize, PoemLayout } from "../types";
import IconSymbol from "./IconSymbol.vue";

const props = defineProps<{
  poem: Poem;
  favorite: boolean;
  backLabel: string;
  poemLayout: PoemLayout;
  poemFontSize: PoemFontSize;
}>();

const emit = defineEmits<{
  back: [];
  favorite: [];
  layoutChange: [layout: PoemLayout];
}>();

const fullLines = computed(() =>
  displayedPoemLines(props.poem.fullText, props.poemLayout),
);
useInitialFocus();
</script>

<template>
  <main
    ref="initialFocusTarget"
    class="reading-panel"
    :data-poem-font-size="poemFontSize"
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
      <div class="reading-layout-action">
        <button
          type="button"
          :aria-label="poemLayout === 'horizontal' ? '改为竖排诗句' : '改为横排诗句'"
          @click="emit('layoutChange', poemLayout === 'horizontal' ? 'vertical' : 'horizontal')"
        >
          {{ poemLayout === "horizontal" ? "竖排阅读" : "横排阅读" }}
        </button>
      </div>
      <div
        class="reading-poem-frame"
        :class="{ 'is-vertical': poemLayout === 'vertical' }"
        :tabindex="poemLayout === 'vertical' ? 0 : undefined"
        :role="poemLayout === 'vertical' ? 'region' : undefined"
        :aria-label="poemLayout === 'vertical' ? '竖排诗文，可左右滚动' : undefined"
      >
        <div
          class="full-poem"
          :class="{ 'is-vertical': poemLayout === 'vertical' }"
          role="group"
          aria-label="诗词全文"
        >
          <p v-for="(line, index) in fullLines" :key="index">{{ line }}</p>
        </div>
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
