<script setup lang="ts">
import { computed, reactive, ref, watch } from "vue";
import { useInitialFocus } from "../composables/useInitialFocus";
import { CITIES } from "../data/cities";
import {
  OPEN_METEO_LICENSE_URL,
  openExternal,
  openThirdPartyNotices,
} from "../services/desktop";
import type { AppSettings, PilotState } from "../types";
import IconSymbol from "./IconSymbol.vue";

const props = defineProps<{
  settings: AppSettings;
  savedSettings: AppSettings;
  autostartWarning?: string;
  favoriteCount: number;
  pilotStatus?: PilotState["status"];
}>();

const emit = defineEmits<{
  back: [];
  save: [settings: AppSettings];
  draftChange: [settings: AppSettings];
  reset: [];
  favorites: [];
  pilot: [];
}>();

const draft = reactive<AppSettings>({
  ...props.settings,
  anonymousMetrics: false,
});
const appVersion = __APP_VERSION__;
const isTrialRelease = __RELEASE_CHANNEL__ === "trial";
const releaseLabel = isTrialRelease
  ? "M1 未签名试用版"
  : "正式签名版";
const trustError = ref("");
const confirmDiscard = ref(false);
const isDirty = computed(() =>
  JSON.stringify(draft) !==
  JSON.stringify({ ...props.savedSettings, anonymousMetrics: false }),
);
useInitialFocus();

watch(draft, () => {
  confirmDiscard.value = false;
  emit("draftChange", { ...draft, anonymousMetrics: false });
}, { deep: true });

watch(() => props.settings, (next) => {
  Object.assign(draft, next);
});

function back(): void {
  if (isDirty.value) {
    confirmDiscard.value = true;
    return;
  }
  emit("back");
}

function submit(): void {
  emit("save", { ...draft, anonymousMetrics: false });
}

async function showWeatherLicense(): Promise<void> {
  trustError.value = "";
  try {
    await openExternal(OPEN_METEO_LICENSE_URL);
  } catch {
    trustError.value = "暂时无法打开天气数据许可页面。";
  }
}

async function showThirdPartyNotices(): Promise<void> {
  trustError.value = "";
  try {
    await openThirdPartyNotices();
  } catch {
    trustError.value = "暂时无法打开随应用提供的第三方许可清单。";
  }
}
</script>

<template>
  <main
    ref="initialFocusTarget"
    class="settings-panel"
    aria-labelledby="settings-title"
    tabindex="-1"
  >
    <header class="panel-header">
      <button class="back-button" type="button" @click="back">
        <IconSymbol name="back" :size="18" />
        返回
      </button>
      <h1 id="settings-title">设置</h1>
      <span class="header-spacer" />
    </header>

    <div v-if="confirmDiscard" class="settings-discard" role="alert">
      <p>修改尚未保存。可以继续编辑，或放弃修改后返回诗笺。</p>
      <div>
        <button type="button" @click="confirmDiscard = false">继续编辑</button>
        <button type="button" @click="emit('back')">放弃修改并返回</button>
      </div>
    </div>

    <form class="settings-form" @submit.prevent="submit">
      <section class="settings-group">
        <h2>每日环境</h2>
        <label class="stacked-field">
          <span>所在城市</span>
          <select v-model="draft.cityId" class="select-input">
            <option v-for="city in CITIES" :key="city.id" :value="city.id">
              {{ city.province }} · {{ city.name }}
            </option>
          </select>
        </label>
        <label class="switch-row">
          <span>
            <strong>开机时显示</strong>
            <small>启动后只出现一次，可关闭到托盘</small>
          </span>
          <input v-model="draft.autostart" type="checkbox" role="switch" />
        </label>
        <p v-if="autostartWarning" class="settings-warning" role="status">
          {{ autostartWarning }}
        </p>
      </section>

      <section class="settings-group">
        <h2>阅读外观</h2>
        <label class="stacked-field">
          <span>主题</span>
          <select v-model="draft.theme" class="select-input">
            <option value="system">跟随系统</option>
            <option value="light">浅色</option>
            <option value="dark">深色</option>
          </select>
        </label>
        <label class="switch-row">
          <span>
            <strong>减少动态效果</strong>
            <small>关闭页面过渡与细微动效</small>
          </span>
          <input v-model="draft.reduceMotion" type="checkbox" role="switch" />
        </label>
      </section>

      <section class="settings-group">
        <h2>隐私</h2>
        <label class="switch-row">
          <span>
            <strong>匿名使用统计</strong>
            <small>当前版本不上传；未来开放时会重新征求同意</small>
          </span>
          <input
            :checked="false"
            type="checkbox"
            role="switch"
            disabled
            aria-describedby="metrics-disabled-note"
          />
        </label>
        <p id="metrics-disabled-note" class="settings-note">
          此预留能力未启用，旧版本中的选择不会作为未来授权。
        </p>
        <button class="danger-link" type="button" @click="emit('reset')">
          清除个人数据与设置
        </button>
      </section>

      <section class="settings-group">
        <h2>我的内容</h2>
        <button
          class="settings-navigation"
          type="button"
          @click="emit('favorites')"
        >
          <span>
            <strong>我的收藏</strong>
            <small>{{ favoriteCount }} 首保存在本机的诗</small>
          </span>
          <IconSymbol name="back" :size="17" />
        </button>
        <button
          class="settings-navigation"
          type="button"
          @click="emit('pilot')"
        >
          <span>
            <strong>校园试点</strong>
            <small>
              {{
                pilotStatus === "active"
                  ? "本地聚合记录中，不自动上传"
                  : pilotStatus === "completed"
                    ? "记录期已结束，可查看摘要"
                    : "自愿参加 28 天本地记录"
              }}
            </small>
          </span>
          <IconSymbol name="back" :size="17" />
        </button>
      </section>

      <section class="settings-group" aria-labelledby="release-heading">
        <h2 id="release-heading">版本与信任</h2>
        <div class="release-row">
          <span>
            <strong>WeatherPoem {{ appVersion }}</strong>
            <small>{{ releaseLabel }}</small>
          </span>
        </div>
        <p v-if="isTrialRelease" class="settings-note">
          当前安装包未经过代码签名，仅用于受控的内部试用，不是正式公开发行版。
        </p>
        <p v-else class="settings-note">
          当前版本已通过项目的签名、可信时间戳与发布清单门禁。
        </p>
        <div class="trust-disclosure">
          <strong>天气数据来源</strong>
          <p>
            基础天气由 Open-Meteo 提供，数据依据 CC BY 4.0 使用。
            WeatherPoem 会选择所需字段、把天气代码映射为中文情境并作本地缓存，
            不改写接口返回的温度、风速和降水数值。
          </p>
          <small>天气推荐和安全提示不替代当地气象部门的正式预警。</small>
          <div class="trust-actions">
            <button type="button" @click="showWeatherLicense">
              查看来源与许可
            </button>
            <button type="button" @click="showThirdPartyNotices">
              第三方许可清单
            </button>
          </div>
          <p v-if="trustError" class="trust-error" role="alert">
            {{ trustError }}
          </p>
        </div>
      </section>

      <button class="primary-button" type="submit">保存设置</button>
    </form>
  </main>
</template>
