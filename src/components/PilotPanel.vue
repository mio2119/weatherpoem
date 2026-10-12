<script setup lang="ts">
import { computed, ref } from "vue";
import { useInitialFocus } from "../composables/useInitialFocus";
import type { PilotState, PilotSummary } from "../types";
import IconSymbol from "./IconSymbol.vue";

const props = defineProps<{
  state?: PilotState;
  summary?: PilotSummary;
}>();

const emit = defineEmits<{
  back: [];
  start: [];
  withdraw: [];
}>();

const adultConfirmed = ref(false);
const voluntaryConfirmed = ref(false);
const localDataConfirmed = ref(false);
const summaryVisible = ref(false);
useInitialFocus();
const canStart = computed(
  () =>
    adultConfirmed.value &&
    voluntaryConfirmed.value &&
    localDataConfirmed.value,
);
const summaryText = computed(() =>
  props.summary ? JSON.stringify(props.summary, null, 2) : "",
);

function selectSummary(event: Event): void {
  (event.currentTarget as HTMLTextAreaElement).select();
}
</script>

<template>
  <main
    ref="initialFocusTarget"
    class="pilot-panel"
    aria-labelledby="pilot-title"
    tabindex="-1"
  >
    <header class="panel-header">
      <button class="back-button" type="button" @click="emit('back')">
        <IconSymbol name="back" :size="18" />
        设置
      </button>
      <h1 id="pilot-title">校园试点</h1>
      <span class="header-spacer" />
    </header>

    <div class="pilot-content">
      <template v-if="!state">
        <p class="eyebrow">28 天 · 自愿参与</p>
        <h2>只在本机留下一份简短使用摘要</h2>
        <p class="pilot-lead">
          用来判断诗笺是否按时出现、是否愿意继续阅读，以及推荐是否贴合日常。
          参与与否不影响正常使用。
        </p>

        <section class="pilot-privacy-box" aria-labelledby="pilot-data-heading">
          <h2 id="pilot-data-heading">会记录什么</h2>
          <p>
            仅按自然日累计出现诗笺、打开详情、不贴合、换一首和收藏次数，
            并累计已结束会话及异常中断会话数。不记录账号、IP、设备名、
            具体城市、诗词名称、操作时间、会话时间点或崩溃堆栈。
          </p>
          <p>
            数据不会自动上传。四周结束后由你决定是否复制摘要；退出立即删除，
            第 35 天起会在下次打开应用时自动清除。
          </p>
        </section>

        <div class="pilot-consents">
          <label class="consent-row">
            <input v-model="adultConfirmed" type="checkbox" />
            <span>我已年满 18 周岁。</span>
          </label>
          <label class="consent-row">
            <input v-model="voluntaryConfirmed" type="checkbox" />
            <span>我理解参与完全自愿，可以随时退出且不影响继续使用。</span>
          </label>
          <label class="consent-row">
            <input v-model="localDataConfirmed" type="checkbox" />
            <span>我同意按照上述范围在本机生成聚合记录。</span>
          </label>
        </div>

        <button
          class="primary-button"
          type="button"
          :disabled="!canStart"
          @click="emit('start')"
        >
          开始本地试点记录
        </button>
        <p class="pilot-caveat">
          当前为候选方案。正式招募前，邀请方仍需提供真实负责人、联系方式和批准文本。
        </p>
      </template>

      <template v-else>
        <p class="eyebrow">
          {{ state.status === "active" ? "本地记录中" : "记录期已结束" }}
        </p>
        <h2>
          {{
            state.status === "active"
              ? "记录留在你的电脑里"
              : "你可以查看并自行提交摘要"
          }}
        </h2>
        <p class="pilot-lead">
          {{ state.startedOn }} 至 {{ state.endsOn }}。没有后台上传，也没有参与者编号。
        </p>

        <dl v-if="summary" class="pilot-stats">
          <div>
            <dt>观察天数</dt>
            <dd>{{ summary.counts.activeDays }}</dd>
          </div>
          <div>
            <dt>成功呈现</dt>
            <dd>{{ summary.counts.successfulDeliveryDays }}</dd>
          </div>
          <div>
            <dt>深入阅读</dt>
            <dd>{{ summary.counts.detailOpenDays }}</dd>
          </div>
          <div>
            <dt>无异常中断</dt>
            <dd>
              {{
                summary.rates.crashFreeSessionPercent === null
                  ? "待形成会话"
                  : `${summary.rates.crashFreeSessionPercent}%`
              }}
            </dd>
          </div>
        </dl>

        <button
          class="secondary-button pilot-summary-button"
          type="button"
          @click="summaryVisible = !summaryVisible"
        >
          {{ summaryVisible ? "收起匿名摘要" : "查看可复制摘要" }}
        </button>
        <div v-if="summaryVisible" class="pilot-summary">
          <label for="pilot-summary-text">匿名聚合 JSON</label>
          <textarea
            id="pilot-summary-text"
            :value="summaryText"
            readonly
            rows="11"
            @focus="selectSummary"
            @click="selectSummary"
          />
          <p>点击文本后按 Ctrl+C。提交前可以自行检查全部内容。</p>
        </div>

        <button
          class="danger-link pilot-withdraw"
          type="button"
          @click="emit('withdraw')"
        >
          退出试点并删除本地记录
        </button>
      </template>
    </div>
  </main>
</template>
