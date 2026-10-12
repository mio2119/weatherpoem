import { describe, expect, it, vi } from "vitest";
import { recommendPoem } from "../core/recommendation";
import { POEMS } from "../data/poems";
import type { CalendarContext, WeatherContext } from "../types";
import {
  buildReasonRequest,
  enrichRecommendationReason,
  isAllowedReasonServiceUrl,
  validateReasonResponse,
} from "./reason";

const calendar: CalendarContext = {
  localDate: "2026-07-23",
  displayDate: "7月23日",
  weekday: "星期四",
  solarTerm: "大暑",
  lunarLabel: "六月初十",
  season: "summer",
  timePeriod: "day",
};

const weather: WeatherContext = {
  kind: "overcast",
  label: "阴",
  temperature: 25,
  freshness: "fresh",
  source: "open-meteo",
  warnings: [],
  shouldSuppressPoem: false,
};

const recommendation = recommendPoem({
  poems: POEMS,
  calendar,
  weather,
  history: [],
  feedback: [],
});

describe("AI reason adapter", () => {
  it("只允许 HTTPS 服务，以及开发环境中的本机 HTTP 服务", () => {
    expect(
      isAllowedReasonServiceUrl("https://reason.weatherpoem.example/v1/reason"),
    ).toBe(true);
    expect(
      isAllowedReasonServiceUrl("http://127.0.0.1:8787/v1/reason"),
    ).toBe(true);
    expect(
      isAllowedReasonServiceUrl("http://reason.weatherpoem.example/v1/reason"),
    ).toBe(false);
    expect(isAllowedReasonServiceUrl("not-a-url")).toBe(false);
  });

  it("只发送标准情境和受限作品，不包含经纬度或用户记录", () => {
    const request = buildReasonRequest(recommendation, calendar, weather);
    expect(request.work.id).toBe(recommendation.poem.id);
    expect(request.context.weather.kind).toBe("overcast");
    expect(JSON.stringify(request)).not.toMatch(
      /latitude|longitude|history|favorite/i,
    );
  });

  it("接受作品一致且不超过四十字的理由", () => {
    expect(
      validateReasonResponse(
        {
          workId: recommendation.poem.id,
          reason: "大暑阴云未散，正宜听一听池塘里的夏日回声。",
        },
        recommendation.poem.id,
      ),
    ).toBe("大暑阴云未散，正宜听一听池塘里的夏日回声。");
  });

  it("拒绝作品错配、超长、换行和自我声明", () => {
    expect(
      validateReasonResponse(
        { workId: "other", reason: "这是一段合格长度的推荐理由。" },
        recommendation.poem.id,
      ),
    ).toBeUndefined();
    expect(
      validateReasonResponse(
        { workId: recommendation.poem.id, reason: "今天正逢春天。，读一读这首诗。" },
        recommendation.poem.id,
      ),
    ).toBeUndefined();
    expect(
      validateReasonResponse(
        { workId: recommendation.poem.id, reason: "winter 的雨和诗相连。" },
        recommendation.poem.id,
      ),
    ).toBeUndefined();
    expect(
      validateReasonResponse(
        {
          workId: recommendation.poem.id,
          reason: "这".repeat(41),
        },
        recommendation.poem.id,
      ),
    ).toBeUndefined();
    expect(
      validateReasonResponse(
        {
          workId: recommendation.poem.id,
          reason: "作为一个AI，我认为这首诗很合适。",
        },
        recommendation.poem.id,
      ),
    ).toBeUndefined();
  });

  it("AI 响应通过校验时替换理由", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          workId: recommendation.poem.id,
          reason: "阴云与夏雨相接，让等待也有了清晰的声音。",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    const result = await enrichRecommendationReason(
      recommendation,
      calendar,
      weather,
      { endpoint: "http://127.0.0.1:8787/reason", fetcher },
    );
    expect(result.source).toBe("ai");
    expect(result.reason).toBe(
      "阴云与夏雨相接，让等待也有了清晰的声音。",
    );
  });

  it("超时、失败或无端点时无条件保留规则理由", async () => {
    const failedFetcher = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new Error("offline"));
    const failed = await enrichRecommendationReason(
      recommendation,
      calendar,
      weather,
      {
        endpoint: "http://127.0.0.1:8787/reason",
        fetcher: failedFetcher,
      },
    );
    const disabled = await enrichRecommendationReason(
      recommendation,
      calendar,
      weather,
      { endpoint: "" },
    );
    expect(failed).toEqual(recommendation);
    expect(disabled).toEqual(recommendation);
  });

  it("天气不可用时不向远端请求可能虚构当地天气的理由", async () => {
    const fetcher = vi.fn<typeof fetch>();
    const result = await enrichRecommendationReason(
      recommendation,
      calendar,
      { ...weather, kind: "unknown", freshness: "unavailable", source: "offline" },
      { endpoint: "http://127.0.0.1:8787/reason", fetcher },
    );
    expect(result).toEqual(recommendation);
    expect(fetcher).not.toHaveBeenCalled();
  });
});
