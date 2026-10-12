import { describe, expect, it, vi } from "vitest";
import { CITIES } from "../data/cities";
import {
  fetchOfficialWarnings,
  isAllowedWarningGatewayUrl,
  normalizeOfficialWarnings,
} from "./warning-gateway";

const BEIJING = CITIES.find((city) => city.id === "beijing")!;
const NOW = Date.parse("2026-07-24T00:00:00+08:00");

function validPayload() {
  return {
    cityId: "beijing",
    warnings: [
      {
        id: "bj-rain-001",
        title: "暴雨黄色预警",
        level: "warning",
        description: "预计未来六小时部分地区将出现强降水。",
        source: "北京市气象台",
        area: "北京市",
        publishedAt: "2026-07-23T23:30:00+08:00",
        expiresAt: "2026-07-24T08:00:00+08:00",
      },
    ],
  };
}

describe("official warning gateway", () => {
  it("只接收城市匹配、字段完整且仍在有效期的预警", () => {
    const warnings = normalizeOfficialWarnings(
      validPayload(),
      BEIJING,
      NOW,
    );
    expect(warnings).toEqual([
      expect.objectContaining({
        id: "official-bj-rain-001",
        source: "北京市气象台",
        area: "北京市",
        origin: "official",
        level: "warning",
      }),
    ]);
  });

  it("拒绝城市不匹配、过期或缺少发布机构的记录", () => {
    expect(
      normalizeOfficialWarnings(
        { ...validPayload(), cityId: "shanghai" },
        BEIJING,
        NOW,
      ),
    ).toEqual([]);
    const expired = validPayload();
    expired.warnings[0]!.expiresAt = "2026-07-23T23:59:00+08:00";
    expect(normalizeOfficialWarnings(expired, BEIJING, NOW)).toEqual([]);
    const missingSource = validPayload();
    missingSource.warnings[0]!.source = "";
    expect(
      normalizeOfficialWarnings(missingSource, BEIJING, NOW),
    ).toEqual([]);
  });

  it("生产端点只允许 HTTPS，本地开发只放行回环地址", () => {
    expect(isAllowedWarningGatewayUrl("https://warning.example/v1")).toBe(
      true,
    );
    expect(isAllowedWarningGatewayUrl("http://warning.example/v1")).toBe(
      false,
    );
    expect(isAllowedWarningGatewayUrl("not-a-url")).toBe(false);
  });

  it("请求只发送城市标识，不发送经纬度，并规范化响应", async () => {
    const fetcher = vi.fn<typeof fetch>(async (input) => {
      const url = new URL(String(input));
      expect(url.searchParams.get("cityId")).toBe("beijing");
      expect(url.searchParams.get("city")).toBe("北京");
      expect(url.searchParams.get("latitude")).toBeNull();
      expect(url.searchParams.get("longitude")).toBeNull();
      return new Response(JSON.stringify(validPayload()), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });
    const warnings = await fetchOfficialWarnings(BEIJING, {
      endpoint: "https://warning.example/v1",
      fetcher,
      now: NOW,
    });
    expect(fetcher).toHaveBeenCalledOnce();
    expect(warnings).toHaveLength(1);
  });

  it("网关失败时返回空集合交给基础安全代理降级", async () => {
    const warnings = await fetchOfficialWarnings(BEIJING, {
      endpoint: "https://warning.example/v1",
      fetcher: vi.fn<typeof fetch>(async () => {
        throw new Error("gateway unavailable");
      }),
      now: NOW,
    });
    expect(warnings).toEqual([]);
  });
});
