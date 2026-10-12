<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, useTemplateRef, watch } from "vue";
import { useInitialFocus } from "../composables/useInitialFocus";
import { hideWindow } from "../services/desktop";
import type { CalendarContext, Recommendation, WeatherContext } from "../types";
import IconSymbol from "./IconSymbol.vue";

const props = defineProps<{
  recommendation: Recommendation;
  calendar: CalendarContext;
  weather: WeatherContext;
  favorite: boolean;
  favoriteCount: number;
  canReplace: boolean;
}>();

const emit = defineEmits<{
  read: [];
  favorite: [];
  favorites: [];
  replace: [];
  dislike: [];
  heightNeeded: [height: number];
}>();

const moreOpen = ref(false);
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

onBeforeUnmount(() => resizeObserver?.disconnect());
</script>

<template>
  <main
    ref="initialFocusTarget"
    class="poem-view"
    aria-labelledby="daily-poem-title"
    tabindex="-1"
  >
    <div ref="contentMeasure" class="glance-content">
      <section class="context-strip" aria-label="今日环境">
        <p>
          <strong>{{ calendar.displayDate }}</strong>
          <span>{{ contextText }}</span>
        </p>
        <button class="context-favorites" type="button" @click="emit('favorites')">
          收藏 {{ favoriteCount }}
        </button>
      </section>

      <article class="poem-paper" aria-labelledby="daily-poem-title">
        <div class="poem-heading">
          <h1 id="daily-poem-title">{{ recommendation.poem.title }}</h1>
          <p>{{ recommendation.poem.author }} · {{ recommendation.poem.dynasty }}</p>
        </div>

        <div class="poem-lines" role="group" aria-label="诗句节选">
          <p v-for="line in recommendation.poem.excerpt" :key="line">{{ line }}</p>
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
          <button type="button" :disabled="!canReplace" @click="emit('replace')">
            {{ canReplace ? "换一首" : "今日已换" }}
          </button>
          <button type="button" @click="emit('dislike')">不太贴合</button>
        </div>
      </article>
    </div>
  </main>
</template>
