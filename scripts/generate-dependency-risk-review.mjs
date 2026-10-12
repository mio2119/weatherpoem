import { writeFile, readFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  DEPENDENCY_RISK_REVIEW_REPORT,
  EXPECTED_UNIC_WARNINGS,
  sha256File,
} from "./dependency-risk-review-support.mjs";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const packageJson = JSON.parse(
  await readFile(path.join(projectRoot, "package.json"), "utf8"),
);
const cargoAuditPath = path.join(
  projectRoot,
  "output",
  "WeatherPoem_0.2.0_CARGO_AUDIT.json",
);
const cargoLockPath = path.join(
  projectRoot,
  "src-tauri",
  "Cargo.lock",
);
const cargoAudit = JSON.parse(
  await readFile(cargoAuditPath, "utf8"),
);

async function fetchWithRetry(url, options = {}) {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(url, options);
      if (response.ok || response.status < 500) return response;
      lastError = new Error(
        `Dependency review source returned ${response.status}: ${url}`,
      );
    } catch (error) {
      lastError = error;
    }
    if (attempt < 3) {
      await new Promise((resolve) =>
        setTimeout(resolve, attempt * 500),
      );
    }
  }
  throw new Error(
    `Dependency review source failed after three attempts: ${url}`,
    { cause: lastError },
  );
}

async function fetchJson(url) {
  const response = await fetchWithRetry(url, {
    headers: {
      Accept: "application/vnd.github+json, application/json",
      "User-Agent": "WeatherPoem-dependency-review",
    },
  });
  if (!response.ok) {
    throw new Error(
      `Dependency review source returned ${response.status}: ${url}`,
    );
  }
  return response.json();
}

function targetVersion(name) {
  const packageEntry = cargoAudit.targetResolution.packages.find(
    (value) => value.name === name,
  );
  if (!packageEntry) {
    throw new Error(`Windows target dependency is missing ${name}`);
  }
  return packageEntry.version;
}

const [
  tauriCrate,
  tauriUtilsCrate,
  urlpatternCrate,
  urlpattern030Dependencies,
  urlpattern060Dependencies,
  pullRequest,
  tauriDevCargoResponse,
] = await Promise.all([
  fetchJson("https://crates.io/api/v1/crates/tauri"),
  fetchJson("https://crates.io/api/v1/crates/tauri-utils"),
  fetchJson("https://crates.io/api/v1/crates/urlpattern"),
  fetchJson(
    "https://crates.io/api/v1/crates/urlpattern/0.3.0/dependencies",
  ),
  fetchJson(
    "https://crates.io/api/v1/crates/urlpattern/0.6.0/dependencies",
  ),
  fetchJson(
    "https://api.github.com/repos/tauri-apps/tauri/pulls/15660",
  ),
  fetchWithRetry(
    "https://raw.githubusercontent.com/tauri-apps/tauri/dev/crates/tauri-utils/Cargo.toml",
    {
      headers: {
        "User-Agent": "WeatherPoem-dependency-review",
      },
    },
  ),
]);
if (!tauriDevCargoResponse.ok) {
  throw new Error(
    `Tauri dev Cargo.toml returned ${tauriDevCargoResponse.status}`,
  );
}
const tauriDevCargo = await tauriDevCargoResponse.text();

const targetWarnings =
  cargoAudit.targetResolution.warnings.unmaintained.map(
    ({ advisoryId, package: packageName, version }) => ({
      advisoryId,
      package: packageName,
      version,
    }),
  );
if (
  JSON.stringify(
    [...targetWarnings].sort((a, b) =>
      a.advisoryId.localeCompare(b.advisoryId),
    ),
  ) !==
  JSON.stringify(
    [...EXPECTED_UNIC_WARNINGS].sort((a, b) =>
      a.advisoryId.localeCompare(b.advisoryId),
    ),
  )
) {
  throw new Error(
    "Windows target unmaintained warnings changed; reassess instead of reusing this disposition.",
  );
}

const oldDependencies =
  urlpattern030Dependencies.dependencies.map(
    (value) => value.crate_id,
  );
const newDependencies =
  urlpattern060Dependencies.dependencies.map(
    (value) => value.crate_id,
  );
if (
  !oldDependencies.includes("unic-ucd-ident") ||
  newDependencies.includes("unic-ucd-ident") ||
  !newDependencies.includes("icu_properties")
) {
  throw new Error(
    "urlpattern 0.6 dependency migration no longer matches the reviewed fix.",
  );
}
if (
  pullRequest.merged !== true ||
  pullRequest.merge_commit_sha !==
    "dd725f4b13c30a86b398ccc59eb498f151f461c5" ||
  !/urlpattern\s*=\s*"0\.6"/.test(tauriDevCargo)
) {
  throw new Error(
    "Tauri upstream fix is not merged or dev no longer uses urlpattern 0.6.",
  );
}

const generatedAt = new Date().toISOString();
const targetDate = new Date(
  Date.parse(generatedAt) + 89 * 24 * 60 * 60 * 1000,
)
  .toISOString()
  .slice(0, 10);
const report = {
  schemaVersion: "1.0",
  product: "WeatherPoem",
  appVersion: packageJson.version,
  generatedAt,
  status: "review-ready-not-approved",
  inputs: {
    cargoAuditReport:
      "output/WeatherPoem_0.2.0_CARGO_AUDIT.json",
    cargoAuditSha256: await sha256File(cargoAuditPath),
    cargoLock: "src-tauri/Cargo.lock",
    cargoLockSha256: await sha256File(cargoLockPath),
    targetTriple: "x86_64-pc-windows-msvc",
  },
  currentTarget: {
    vulnerabilityCount:
      cargoAudit.targetResolution.vulnerabilities.length,
    blockingWarningCount:
      cargoAudit.targetResolution.blockingWarningCount,
    unmaintainedWarningCount: targetWarnings.length,
    unmaintainedWarnings: targetWarnings,
  },
  dependencyCluster: {
    independentRiskCount: 1,
    clusteredWarningCount: 5,
    frameworkPackage: `tauri-utils@${targetVersion("tauri-utils")}`,
    rootPackage: `urlpattern@${targetVersion("urlpattern")}`,
    leafPackage: `unic-ucd-ident@${targetVersion("unic-ucd-ident")}`,
    path: [
      `weatherpoem@${packageJson.version}`,
      `tauri@${targetVersion("tauri")}`,
      `tauri-utils@${targetVersion("tauri-utils")}`,
      `urlpattern@${targetVersion("urlpattern")}`,
      `unic-ucd-ident@${targetVersion("unic-ucd-ident")}`,
    ],
  },
  upstream: {
    checkedAt: generatedAt,
    tauriLatestStable: tauriCrate.crate.max_stable_version,
    tauriUtilsLatestStable:
      tauriUtilsCrate.crate.max_stable_version,
    urlpatternLatestStable:
      urlpatternCrate.crate.max_stable_version,
    urlpattern060RemovesUnicUcdIdent: true,
    tauriPullRequest:
      "https://github.com/tauri-apps/tauri/pull/15660",
    mergeCommitSha: pullRequest.merge_commit_sha,
    mergedAt: pullRequest.merged_at,
    tauriDevDependency: "urlpattern@0.6",
    sources: {
      tauriCrate: "https://crates.io/crates/tauri",
      tauriUtilsCrate:
        "https://crates.io/crates/tauri-utils",
      urlpatternCrate:
        "https://crates.io/crates/urlpattern",
      pullRequest:
        "https://github.com/tauri-apps/tauri/pull/15660",
      tauriDevCargoToml:
        "https://github.com/tauri-apps/tauri/blob/dev/crates/tauri-utils/Cargo.toml",
    },
  },
  proposedDisposition: {
    action: "upgrade-next-stable-tauri-release",
    reason: "avoid-unreleased-core-framework-git-patch",
    temporaryControl:
      "block-vulnerabilities-unsound-yanked-and-review-each-candidate",
    upgradeTrigger: "stable-tauri-release-containing-pr-15660",
    targetDate,
  },
  approval: {
    securityOwner: null,
    decision: null,
    approvedAt: null,
    evidencePath:
      "review/evidence/RQT-15-security-privacy-review.json",
  },
  limitations: {
    upstreamFixMergedNotReleased: true,
    runtimeWarningStillPresent: true,
    namedSecurityReviewCompleted: false,
  },
  gateSatisfied: false,
  result: "automated-disposition-draft-ready",
};

const outputPath = path.join(
  projectRoot,
  ...DEPENDENCY_RISK_REVIEW_REPORT.split("/"),
);
await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(
  outputPath,
  `${JSON.stringify(report, null, 2)}\n`,
  "utf8",
);
console.log(`已生成依赖风险处置草案：${outputPath}`);
