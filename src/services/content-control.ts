export interface ContentWithdrawalManifest {
  schemaVersion: "1.0";
  contentVersion: string;
  revision: number;
  issuedAt: string;
  suspendRecommendations: boolean;
  withdrawnWorkIds: string[];
}

export interface ContentControlResult {
  manifest?: ContentWithdrawalManifest;
  suspendRecommendations: boolean;
  withdrawnWorkIds: string[];
  source: "remote" | "cache" | "none";
}

export interface ContentControlOptions {
  endpoint?: string;
  fetcher?: typeof fetch;
  storage?: Pick<Storage, "getItem" | "setItem">;
  now?: number;
  timeoutMs?: number;
  releaseChannel?: "trial" | "production";
}

export const CONTENT_WITHDRAWAL_CACHE_KEY =
  "weatherpoem.content-withdrawals.v1";

const MAX_CLOCK_SKEW_MS = 10 * 60 * 1000;
const MAX_REVISION = 2_147_483_647;
const MAX_WITHDRAWALS = 500;

function currentReleaseChannel(): "trial" | "production" {
  return typeof __RELEASE_CHANNEL__ === "string"
    ? __RELEASE_CHANNEL__
    : "production";
}

function storageFrom(
  override?: Pick<Storage, "getItem" | "setItem">,
): Pick<Storage, "getItem" | "setItem"> | undefined {
  if (override) return override;
  try {
    return typeof localStorage === "undefined"
      ? undefined
      : localStorage;
  } catch {
    return undefined;
  }
}

export function isAllowedContentControlUrl(
  value: string,
  releaseChannel = currentReleaseChannel(),
): boolean {
  try {
    const url = new URL(value);
    if (
      url.username ||
      url.password ||
      url.search ||
      url.hash
    ) {
      return false;
    }
    if (url.protocol === "https:") return true;
    return (
      releaseChannel === "trial" &&
      url.protocol === "http:" &&
      (url.hostname === "127.0.0.1" ||
        url.hostname === "localhost")
    );
  } catch {
    return false;
  }
}

export function normalizeContentWithdrawalManifest(
  payload: unknown,
  knownWorkIds: Iterable<string>,
  expectedContentVersion: string,
  now = Date.now(),
): ContentWithdrawalManifest | undefined {
  if (!payload || typeof payload !== "object") return undefined;
  const candidate = payload as Record<string, unknown>;
  const allowedFields = new Set([
    "schemaVersion",
    "contentVersion",
    "revision",
    "issuedAt",
    "suspendRecommendations",
    "withdrawnWorkIds",
  ]);
  if (
    Object.keys(candidate).some(
      (field) => !allowedFields.has(field),
    ) ||
    candidate.schemaVersion !== "1.0" ||
    candidate.contentVersion !== expectedContentVersion ||
    !Number.isInteger(candidate.revision) ||
    (candidate.revision as number) < 0 ||
    (candidate.revision as number) > MAX_REVISION ||
    typeof candidate.issuedAt !== "string" ||
    typeof candidate.suspendRecommendations !== "boolean" ||
    !Array.isArray(candidate.withdrawnWorkIds) ||
    candidate.withdrawnWorkIds.length > MAX_WITHDRAWALS
  ) {
    return undefined;
  }
  const issuedAtMs = Date.parse(candidate.issuedAt);
  if (
    !Number.isFinite(issuedAtMs) ||
    issuedAtMs > now + MAX_CLOCK_SKEW_MS
  ) {
    return undefined;
  }
  const known = new Set(knownWorkIds);
  const withdrawn = candidate.withdrawnWorkIds;
  if (
    withdrawn.some(
      (workId) =>
        typeof workId !== "string" ||
        !known.has(workId) ||
        workId.length > 120,
    ) ||
    new Set(withdrawn).size !== withdrawn.length
  ) {
    return undefined;
  }
  return {
    schemaVersion: "1.0",
    contentVersion: expectedContentVersion,
    revision: candidate.revision as number,
    issuedAt: candidate.issuedAt,
    suspendRecommendations: candidate.suspendRecommendations,
    withdrawnWorkIds: [...withdrawn].sort(),
  };
}

function loadCachedManifest(
  storage: Pick<Storage, "getItem" | "setItem"> | undefined,
  knownWorkIds: Iterable<string>,
  contentVersion: string,
  now: number,
): ContentWithdrawalManifest | undefined {
  if (!storage) return undefined;
  try {
    const raw = storage.getItem(CONTENT_WITHDRAWAL_CACHE_KEY);
    if (!raw) return undefined;
    return normalizeContentWithdrawalManifest(
      JSON.parse(raw),
      knownWorkIds,
      contentVersion,
      now,
    );
  } catch {
    return undefined;
  }
}

function saveCachedManifest(
  storage: Pick<Storage, "getItem" | "setItem"> | undefined,
  manifest: ContentWithdrawalManifest,
): void {
  if (!storage) return;
  try {
    storage.setItem(
      CONTENT_WITHDRAWAL_CACHE_KEY,
      JSON.stringify(manifest),
    );
  } catch {
    // 缓存写入失败不应让有效撤回清单在当前进程中失效。
  }
}

function sameWithdrawals(
  left: ContentWithdrawalManifest,
  right: ContentWithdrawalManifest,
): boolean {
  return (
    left.contentVersion === right.contentVersion &&
    left.revision === right.revision &&
    left.suspendRecommendations ===
      right.suspendRecommendations &&
    left.withdrawnWorkIds.join("\n") ===
      right.withdrawnWorkIds.join("\n")
  );
}

function result(
  manifest: ContentWithdrawalManifest | undefined,
  source: ContentControlResult["source"],
): ContentControlResult {
  return {
    manifest,
    suspendRecommendations:
      manifest?.suspendRecommendations ?? false,
    withdrawnWorkIds: manifest
      ? [...manifest.withdrawnWorkIds]
      : [],
    source,
  };
}

export async function fetchContentWithdrawals(
  knownWorkIds: Iterable<string>,
  contentVersion: string,
  appVersion: string,
  options: ContentControlOptions = {},
): Promise<ContentControlResult> {
  const now = options.now ?? Date.now();
  const known = [...knownWorkIds];
  const storage = storageFrom(options.storage);
  const cached = loadCachedManifest(
    storage,
    known,
    contentVersion,
    now,
  );
  const endpoint =
    options.endpoint ?? import.meta.env.VITE_CONTENT_CONTROL_URL;
  if (
    !endpoint ||
    !isAllowedContentControlUrl(
      endpoint,
      options.releaseChannel ?? currentReleaseChannel(),
    )
  ) {
    return result(cached, cached ? "cache" : "none");
  }

  const controller = new AbortController();
  const timeoutMs =
    options.timeoutMs ??
    Number(import.meta.env.VITE_CONTENT_CONTROL_TIMEOUT_MS ?? 2500);
  const timer = globalThis.setTimeout(
    () => controller.abort(),
    timeoutMs,
  );
  const url = new URL(endpoint);
  url.searchParams.set("contentVersion", contentVersion);
  url.searchParams.set("appVersion", appVersion);

  try {
    const response = await (options.fetcher ?? fetch)(url, {
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
    if (response.status === 204) {
      return result(cached, cached ? "cache" : "none");
    }
    if (!response.ok) {
      return result(cached, cached ? "cache" : "none");
    }
    const remote = normalizeContentWithdrawalManifest(
      await response.json(),
      known,
      contentVersion,
      now,
    );
    if (!remote) {
      return result(cached, cached ? "cache" : "none");
    }
    if (cached && remote.revision < cached.revision) {
      return result(cached, "cache");
    }
    if (
      cached &&
      remote.revision === cached.revision &&
      !sameWithdrawals(cached, remote)
    ) {
      return result(cached, "cache");
    }
    saveCachedManifest(storage, remote);
    return result(remote, "remote");
  } catch {
    return result(cached, cached ? "cache" : "none");
  } finally {
    globalThis.clearTimeout(timer);
  }
}

export function filterWithdrawnWorks<T extends { id: string }>(
  works: T[],
  withdrawnWorkIds: Iterable<string>,
): T[] {
  const withdrawn = new Set(withdrawnWorkIds);
  return works.filter((work) => !withdrawn.has(work.id));
}

export function shouldShowContentCorrection(
  currentWorkId: string | undefined,
  withdrawnWorkIds: Iterable<string>,
): boolean {
  return Boolean(
    currentWorkId &&
      new Set(withdrawnWorkIds).has(currentWorkId),
  );
}
