<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, useTemplateRef, watch } from "vue";
import { useInitialFocus } from "../composables/useInitialFocus";
import { displayedPoemLines, glancePoemLayout } from "../core/poem-layout";
import { selectPoemScene } from "../core/poem-scene";
import { hideWindow } from "../services/desktop";
import type { CalendarContext, PoemFontSize, PoemLayout, Recommendation, WeatherContext } from "../types";
import IconSymbol from "./IconSymbol.vue";

const props = defineProps<{
  recommendation: Recommendation;
  calendar: CalendarContext;
  weather: WeatherContext;
  favorite: boolean;
  favoriteCount: number;
  canReplace: boolean;
  replacing: boolean;
  poemLayout: PoemLayout;
  poemFontSize: PoemFontSize;
}>();

const emit = defineEmits<{
  read: [];
  favorite: [];
  favorites: [];
  replace: [];
  dislike: [];
  heightNeeded: [height: number];
  layoutChange: [layout: PoemLayout];
}>();

const moreOpen = ref(false);
const effectivePoemLayout = computed(() =>
  glancePoemLayout(props.recommendation.poem.excerpt, props.poemLayout),
);
const poemLines = computed(() =>
  displayedPoemLines(props.recommendation.poem.excerpt, effectivePoemLayout.value),
);
const scene = computed(() => selectPoemScene({
  poem: props.recommendation.poem,
  calendar: props.calendar,
  weather: props.weather,
}));
const contentMeasure = useTemplateRef<HTMLElement>("contentMeasure");
let resizeObserver: ResizeObserver | undefined;
useInitialFocus();

const contextText = computed(() => {
  const parts: string[] = [];
  if (props.calendar.festival) parts.push(props.calendar.festival);
  if (props.weather.freshness === "fresh" && props.weather.kind !== "unknown") {
    parts.push(props.weather.label);
  } else if (props.weather.freshness === "stale" && props.weather.kind !== "unknown") {
    parts.push(`缓存天气：${props.weather.label}`);
  } else {
    parts.push("天气未更新");
  }
  if (props.calendar.solarTerm && !props.calendar.festival) {
    parts.push(props.calendar.solarTerm);
  }
  return parts.slice(0, 2).join(" · ");
});

function reportContentHeight(): void {
  const content = contentMeasure.value;
  if (!content) return;
  // Include the card's outer padding and 58px desktop chrome.
  emit("heightNeeded", Math.ceil(content.scrollHeight + 82));
}

onMounted(async () => {
  await nextTick();
  reportContentHeight();
  if (typeof ResizeObserver !== "undefined" && contentMeasure.value) {
    resizeObserver = new ResizeObserver(reportContentHeight);
    resizeObserver.observe(contentMeasure.value);
  }
});

watch(() => props.recommendation.poem.id, async () => {
  moreOpen.value = false;
  await nextTick();
  reportContentHeight();
});

watch(() => [props.poemLayout, props.poemFontSize], async () => {
  await nextTick();
  reportContentHeight();
});

onBeforeUnmount(() => resizeObserver?.disconnect());
</script>

<template>
  <main
    ref="initialFocusTarget"
    class="poem-view"
    :data-poem-font-size="poemFontSize"
    aria-labelledby="daily-poem-title"
    tabindex="-1"
  >
    <div ref="contentMeasure" class="glance-content">
      <section class="context-strip" aria-label="今日环境">
        <p>
          <strong>{{ calendar.displayDate }}</strong>
          <span>{{ contextText }}</span>
        </p>
        <span
          class="scene-mark"
          role="img"
          :aria-label="scene.description"
          :title="scene.description"
        >{{ scene.glyph }}</span>
        <button class="context-favorites" type="button" @click="emit('favorites')">
          收藏 {{ favoriteCount }}
        </button>
      </section>

      <article
        class="poem-paper"
        :data-scene="scene.kind"
        aria-labelledby="daily-poem-title"
      >
        <div class="poem-heading">
          <h1 id="daily-poem-title">{{ recommendation.poem.title }}</h1>
          <p>{{ recommendation.poem.author }} · {{ recommendation.poem.dynasty }}</p>
          <button
            v-if="effectivePoemLayout === poemLayout"
            class="layout-toggle"
            type="button"
            :aria-label="poemLayout === 'horizontal' ? '改为竖排诗句' : '改为横排诗句'"
            @click="emit('layoutChange', poemLayout === 'horizontal' ? 'vertical' : 'horizontal')"
          >
            {{ poemLayout === "horizontal" ? "竖排" : "横排" }}
          </button>
          <span
            v-else
            class="layout-fallback-note"
            title="节选较长，诗笺暂用横排；展开全文后仍可竖排阅读"
          >节选较长，暂用横排</span>
        </div>

        <div
          class="poem-lines"
          :class="{ 'is-vertical': effectivePoemLayout === 'vertical' }"
          role="group"
          aria-label="诗句节选"
        >
          <p v-for="(line, index) in poemLines" :key="index">{{ line }}</p>
        </div>

        <p class="reason-block">{{ recommendation.reason }}</p>

        <div class="card-actions">
          <button class="read-button" type="button" @click="emit('read')">
            继续读
            <IconSymbol name="expand" :size="15" />
          </button>
          <button
            class="quiet-action"
            type="button"
            :aria-pressed="favorite"
            @click="emit('favorite')"
          >
            <IconSymbol :name="favorite ? 'bookmark-filled' : 'bookmark'" :size="16" />
            {{ favorite ? "已收藏" : "收藏" }}
          </button>
          <button class="quiet-action" type="button" @click="hideWindow">
            收起
          </button>
          <button
            class="quiet-action more-action"
            type="button"
            :aria-expanded="moreOpen"
            aria-controls="poem-secondary-actions"
            @click="moreOpen = !moreOpen"
          >
            更多
          </button>
        </div>

        <div v-if="moreOpen" id="poem-secondary-actions" class="secondary-actions">
          <button type="button" :disabled="!canReplace || replacing" @click="emit('replace')">
            {{ replacing ? "正在换诗" : canReplace ? "换一首" : "今日已换" }}
          </button>
          <button type="button" @click="emit('dislike')">不太贴合</button>
        </div>
      </article>
    </div>
  </main>
</template>
