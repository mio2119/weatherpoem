<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useInitialFocus } from "../composables/useInitialFocus";
import { CITIES } from "../data/cities";
import type { AppSettings } from "../types";
import IconSymbol from "./IconSymbol.vue";

const props = defineProps<{
  initialSettings: AppSettings;
  saving?: boolean;
  saveError?: string;
}>();

const emit = defineEmits<{
  complete: [settings: AppSettings];
}>();

const cityId = ref(props.initialSettings.configured ? props.initialSettings.cityId : "");
const autostart = ref(props.initialSettings.autostart);
const consent = ref(false);
const query = ref("");
useInitialFocus();

const filteredCities = computed(() => {
  const keyword = query.value.trim();
  if (!keyword) return CITIES;
  return CITIES.filter((city) =>
    `${city.name}${city.province}${city.note}`.includes(keyword),
  );
});
const selectedCity = computed(() =>
  CITIES.find((city) => city.id === cityId.value),
);

watch(query, () => {
  // Searching for another city must not silently keep a previous selection.
  cityId.value = "";
});

function submit(): void {
  if (props.saving || !consent.value || !selectedCity.value) return;
  emit("complete", {
    ...props.initialSettings,
    configured: true,
    cityId: cityId.value,
    autostart: autostart.value,
  });
}
</script>

<template>
  <main
    ref="initialFocusTarget"
    class="onboarding-view"
    aria-labelledby="onboarding-title"
    tabindex="-1"
  >
    <div class="onboarding-intro">
      <p class="eyebrow">第一次见面</p>
      <h1 id="onboarding-title">让诗词回到<br />每天的天气里</h1>
      <p>
        每天打开电脑时，根据节日、当地天气和节气，
        只送来一首诗。默认保持安静，需要时再展开。
      </p>
    </div>

    <form class="onboarding-form" :aria-busy="saving" @submit.prevent="submit">
      <label class="field-label" for="city-search">你所在的城市</label>
      <input
        id="city-search"
        v-model="query"
        class="text-input"
        type="search"
        placeholder="搜索城市"
        autocomplete="off"
        aria-describedby="city-search-help"
      />
      <p id="city-search-help" class="city-search-help">
        当前支持 {{ CITIES.length }} 座示范城市；不会自动定位或改用其他城市。
      </p>
      <p v-if="filteredCities.length === 0" class="city-empty" role="status">
        暂未找到支持的城市。请清空搜索，或换一个城市名称试试。
      </p>
      <div v-else class="city-grid" role="radiogroup" aria-label="选择城市">
        <label
          v-for="city in filteredCities"
          :key="city.id"
          class="city-option"
          :class="{ selected: cityId === city.id }"
        >
          <input v-model="cityId" type="radio" :value="city.id" />
          <span>
            <strong>{{ city.name }}</strong>
            <small>{{ city.note }}</small>
          </span>
          <IconSymbol v-if="cityId === city.id" name="check" :size="17" />
        </label>
      </div>
      <p class="city-selection" aria-live="polite">
        {{
          selectedCity
            ? `本次将使用${selectedCity.province} · ${selectedCity.name}的天气；城市设置保存在本机。`
            : "请选择一座城市，再开始今日诗笺。"
        }}
      </p>

      <label class="switch-row">
        <span>
          <strong>打开电脑时显示今日诗笺</strong>
          <small>可随时在设置中关闭</small>
        </span>
        <input v-model="autostart" type="checkbox" role="switch" />
      </label>

      <label class="consent-row">
        <input v-model="consent" type="checkbox" />
        <span>
          我同意使用所选城市请求基础天气。城市设置和阅读记录保存在本机。
        </span>
      </label>

      <p v-if="saveError" class="onboarding-save-error" role="alert">
        {{ saveError }}
      </p>

      <button
        class="primary-button"
        type="submit"
        :disabled="saving || !consent || !selectedCity"
      >
        {{ saving ? "正在保存" : "开始今日诗笺" }}
      </button>
    </form>
  </main>
</template>
