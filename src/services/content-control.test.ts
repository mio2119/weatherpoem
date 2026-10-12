import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  CONTENT_WITHDRAWAL_CACHE_KEY,
  fetchContentWithdrawals,
  filterWithdrawnWorks,
  isAllowedContentControlUrl,
  normalizeContentWithdrawalManifest,
  shouldShowContentCorrection,
} from "./content-control";

const WORK_IDS = ["work-a", "work-b", "work-c"];
const CONTENT_VERSION = "2026.07.1";
const NOW = Date.parse("2026-07-24T00:00:00+08:00");

function manifest(revision = 1, withdrawnWorkIds = ["work-a"]) {
  return {
    schemaVersion: "1.0",
    contentVersion: CONTENT_VERSION,
    revision,
    issuedAt: "2026-07-23T23:30:00+08:00",
    suspendRecommendations: false,
    withdrawnWorkIds,
  };
}

describe("content withdrawal control", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("只接受当前内容版本、已知且不重复的作品标识", () => {
    expect(
      normalizeContentWithdrawalManifest(
        manifest(),
        WORK_IDS,
        CONTENT_VERSION,
        NOW,
      ),
    ).toEqual(
      expect.objectContaining({
        revision: 1,
        withdrawnWorkIds: ["work-a"],
      }),
    );
    expect(
      normalizeContentWithdrawalManifest(
        { ...manifest(), contentVersion: "old" },
        WORK_IDS,
        CONTENT_VERSION,
        NOW,
      ),
    ).toBeUndefined();
    expect(
      normalizeContentWithdrawalManifest(
        manifest(1, ["unknown"]),
        WORK_IDS,
        CONTENT_VERSION,
        NOW,
      ),
    ).toBeUndefined();
    expect(
      normalizeContentWithdrawalManifest(
        manifest(1, ["work-a", "work-a"]),
        WORK_IDS,
        CONTENT_VERSION,
        NOW,
      ),
    ).toBeUndefined();
  });

  it("拒绝未知字段、未来签发时间和不安全端点", () => {
    expect(
      normalizeContentWithdrawalManifest(
        { ...manifest(), reason: "<script>" },
        WORK_IDS,
        CONTENT_VERSION,
        NOW,
      ),
    ).toBeUndefined();
    expect(
      normalizeContentWithdrawalManifest(
        {
          ...manifest(),
          issuedAt: "2026-07-24T01:00:00+08:00",
        },
        WORK_IDS,
        CONTENT_VERSION,
        NOW,
      ),
    ).toBeUndefined();
    expect(
      isAllowedContentControlUrl(
        "https://content.example/v1/withdrawals",
        "production",
      ),
    ).toBe(true);
    expect(
      isAllowedContentControlUrl(
        "http://content.example/v1",
        "trial",
      ),
    ).toBe(false);
    expect(
      isAllowedContentControlUrl(
        "http://127.0.0.1:8788/withdrawals",
        "trial",
      ),
    ).toBe(true);
    expect(
      isAllowedContentControlUrl(
        "https://user:secret@content.example/v1",
        "production",
      ),
    ).toBe(false);
  });

  it("有效远端清单写入缓存，断网后仍保持撤回", async () => {
    const online = await fetchContentWithdrawals(
      WORK_IDS,
      CONTENT_VERSION,
      "0.2.0",
      {
        endpoint: "https://content.example/v1/withdrawals",
        fetcher: vi.fn<typeof fetch>(async (input) => {
          const url = new URL(String(input));
          expect(url.searchParams.get("contentVersion")).toBe(
            CONTENT_VERSION,
          );
          expect(url.searchParams.get("appVersion")).toBe("0.2.0");
          return new Response(JSON.stringify(manifest()), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }),
        now: NOW,
        storage: localStorage,
      },
    );
    expect(online.source).toBe("remote");
    expect(online.withdrawnWorkIds).toEqual(["work-a"]);
    expect(
      localStorage.getItem(CONTENT_WITHDRAWAL_CACHE_KEY),
    ).not.toBeNull();

    const offline = await fetchContentWithdrawals(
      WORK_IDS,
      CONTENT_VERSION,
      "0.2.0",
      {
        endpoint: "https://content.example/v1/withdrawals",
        fetcher: vi.fn<typeof fetch>(async () => {
          throw new Error("offline");
        }),
        now: NOW,
        storage: localStorage,
      },
    );
    expect(offline.source).toBe("cache");
    expect(offline.withdrawnWorkIds).toEqual(["work-a"]);
  });

  it("旧修订和同修订冲突都不能让已撤回内容复活", async () => {
    localStorage.setItem(
      CONTENT_WITHDRAWAL_CACHE_KEY,
      JSON.stringify(manifest(8, ["work-a", "work-b"])),
    );
    for (const remote of [
      manifest(7, []),
      manifest(8, ["work-a"]),
    ]) {
      const resolved = await fetchContentWithdrawals(
        WORK_IDS,
        CONTENT_VERSION,
        "0.2.0",
        {
          endpoint: "https://content.example/v1/withdrawals",
          fetcher: vi.fn<typeof fetch>(async () =>
            new Response(JSON.stringify(remote), { status: 200 }),
          ),
          now: NOW,
          storage: localStorage,
        },
      );
      expect(resolved.source).toBe("cache");
      expect(resolved.manifest?.revision).toBe(8);
      expect(resolved.withdrawnWorkIds).toEqual([
        "work-a",
        "work-b",
      ]);
    }
  });

  it("撤回作品从候选中消失，若正是当日作品则进入校正状态", () => {
    const works = WORK_IDS.map((id) => ({ id }));
    expect(filterWithdrawnWorks(works, ["work-b"])).toEqual([
      { id: "work-a" },
      { id: "work-c" },
    ]);
    expect(
      shouldShowContentCorrection("work-b", ["work-b"]),
    ).toBe(true);
    expect(
      shouldShowContentCorrection("work-a", ["work-b"]),
    ).toBe(false);
  });

  it("全局暂停状态经过严格清单返回，但不伪造成逐首撤回", async () => {
    const suspended = await fetchContentWithdrawals(
      WORK_IDS,
      CONTENT_VERSION,
      "0.2.0",
      {
        endpoint: "https://content.example/v1/withdrawals",
        fetcher: vi.fn<typeof fetch>(async () =>
          new Response(
            JSON.stringify({
              ...manifest(9, []),
              suspendRecommendations: true,
            }),
            { status: 200 },
          ),
        ),
        now: NOW,
        storage: localStorage,
      },
    );

    expect(suspended.suspendRecommendations).toBe(true);
    expect(suspended.withdrawnWorkIds).toEqual([]);
  });
});
