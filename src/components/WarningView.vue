<script setup lang="ts">
import { computed } from "vue";
import { useInitialFocus } from "../composables/useInitialFocus";
import type { WeatherContext } from "../types";
import IconSymbol from "./IconSymbol.vue";

const props = defineProps<{
  weather: WeatherContext;
}>();

const hasOfficialWarning = computed(() =>
  props.weather.warnings.some((warning) => warning.origin === "official"),
);
const isIsolatedExercise = computed(() =>
  props.weather.warnings.some(
    (warning) => warning.source === "WeatherPoem 隔离性能演练",
  ),
);
useInitialFocus();

function displayTimestamp(value?: string): string {
  if (!value) return "";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}
</script>

<template>
  <main
    ref="initialFocusTarget"
    class="warning-view"
    role="alert"
    aria-labelledby="warning-title"
    tabindex="-1"
  >
    <div class="warning-mark" aria-hidden="true">
      <IconSymbol name="warning" :size="32" />
    </div>
    <p class="eyebrow">安全信息优先</p>
    <h1 id="warning-title">今日诗笺暂缓展示</h1>
    <p>
      {{
        isIsolatedExercise
          ? "这是隔离演练，不是真实气象预警。请先阅读安全信息。"
          : hasOfficialWarning
            ? "已收到仍在有效期内的气象预警，请先阅读安全信息。"
            : "基础天气数据发现可能影响出行的情况。请先查看当地气象部门发布的正式预警。"
      }}
    </p>
    <section
      v-for="warning in weather.warnings"
      :key="warning.id"
      class="warning-item"
      :aria-labelledby="`warning-item-${warning.id}`"
    >
      <h2 :id="`warning-item-${warning.id}`">{{ warning.title }}</h2>
      <p>{{ warning.description }}</p>
      <small v-if="warning.origin === 'official'">
        {{ warning.area }} · {{ warning.source }}
        <template v-if="warning.publishedAt">
          · 发布 {{ displayTimestamp(warning.publishedAt) }}
        </template>
        <template v-if="warning.expiresAt">
          · 有效至 {{ displayTimestamp(warning.expiresAt) }}
        </template>
      </small>
      <small v-else>{{ warning.source }}</small>
    </section>
    <p class="warning-disclaimer">
      {{
        isIsolatedExercise
          ? "本页仅用于隔离安全路径演练，没有连接真实预警网关；请以当地气象部门最新信息为准。"
          : hasOfficialWarning
            ? "预警由配置的授权网关转发，请以发布机构最新信息和属地应急指引为准。"
            : "本提示依据基础天气数据生成，不替代官方预警或应急指引。"
      }}
    </p>
  </main>
</template>
