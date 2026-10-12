<script setup lang="ts">
import { useInitialFocus } from "../composables/useInitialFocus";
import type { CalendarContext, Recommendation, WeatherContext } from "../types";
import IconSymbol from "./IconSymbol.vue";

defineProps<{
  recommendation: Recommendation;
  calendar: CalendarContext;
  weather: WeatherContext;
  favorite: boolean;
  canReplace: boolean;
}>();

const emit = defineEmits<{
  read: [];
  favorite: [];
  replace: [];
  dislike: [];
}>();

useInitialFocus();
</script>

<template>
  <main
    ref="initialFocusTarget"
    class="poem-view"
    aria-labelledby="daily-poem-title"
    tabindex="-1"
  >
    <section class="context-strip" aria-label="今日环境">
      <div>
        <strong>{{ calendar.displayDate }}</strong>
        <span>{{ calendar.weekday }}</span>
      </div>
      <div class="context-details">
        <span v-if="calendar.festival" class="context-priority">
          {{ calendar.festival }}
        </span>
        <span v-else-if="calendar.solarTerm">{{ calendar.solarTerm }}</span>
        <span>{{ weather.label }}</span>
        <span v-if="weather.temperature !== undefined">
          {{ Math.round(weather.temperature) }}℃
        </span>
      </div>
    </section>

    <article class="poem-paper" aria-labelledby="daily-poem-title">
      <div class="paper-meta">
        <span>{{ recommendation.primaryContext }}</span>
        <span>第 {{ calendar.localDate.replaceAll("-", "·") }} 笺</span>
      </div>
      <div class="poem-heading">
        <p>{{ recommendation.poem.dynasty }} · {{ recommendation.poem.literaryForm }}</p>
        <h1 id="daily-poem-title">{{ recommendation.poem.title }}</h1>
        <p class="author">{{ recommendation.poem.author }}</p>
      </div>
      <div class="poem-lines" role="group" aria-label="诗句节选">
        <p v-for="line in recommendation.poem.excerpt" :key="line">{{ line }}</p>
      </div>
      <section class="reason-block" aria-labelledby="reason-title">
        <h2 id="reason-title">今日为何是它</h2>
        <p>{{ recommendation.reason }}</p>
      </section>
      <button class="read-button" type="button" @click="emit('read')">
        继续读
        <IconSymbol name="expand" :size="16" />
      </button>
    </article>

    <div class="card-actions">
      <button
        class="quiet-action"
        type="button"
        :aria-pressed="favorite"
        @click="emit('favorite')"
      >
        <IconSymbol :name="favorite ? 'bookmark-filled' : 'bookmark'" :size="17" />
        {{ favorite ? "已收藏" : "收藏" }}
      </button>
      <button
        class="quiet-action"
        type="button"
        :disabled="!canReplace"
        @click="emit('replace')"
      >
        <IconSymbol name="swap" :size="17" />
        {{ canReplace ? "换一首" : "今日已换" }}
      </button>
      <button class="text-action" type="button" @click="emit('dislike')">
        不太贴合
      </button>
    </div>

    <p
      v-if="weather.freshness !== 'fresh'"
      class="source-note"
      role="status"
    >
      天气暂未更新，今日内容已使用本地规则生成。
    </p>
  </main>
</template>
