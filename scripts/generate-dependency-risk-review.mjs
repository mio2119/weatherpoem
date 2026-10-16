import { writeFile, readFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  DEPENDENCY_RISK_REVIEW_REPORT,
  DEPENDENCY_RISK_REVIEW_SCHEMA,
  REMOVED_UNIC_PACKAGES,
  sha256File,
  validateDependencyRiskReview,
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
const tauriStableVersion = tauriCrate.crate.max_stable_version;
const tauriUtilsStableVersion = tauriUtilsCrate.crate.max_stable_version;
const tauriStableDependenciesUrl =
  `https://crates.io/api/v1/crates/tauri/${tauriStableVersion}/dependencies`;
const tauriUtilsStableDependenciesUrl =
  `https://crates.io/api/v1/crates/tauri-utils/${tauriUtilsStableVersion}/dependencies`;
const [tauriStableDependencies, tauriUtilsStableDependencies] =
  await Promise.all([
    fetchJson(tauriStableDependenciesUrl),
    fetchJson(tauriUtilsStableDependenciesUrl),
  ]);
const releasedTauriUtilsRequirement =
  tauriStableDependencies.dependencies.find(
    (value) => value.crate_id === "tauri-utils" && value.kind === "normal",
  )?.req;
const releasedUrlpatternRequirement =
  tauriUtilsStableDependencies.dependencies.find(
    (value) => value.crate_id === "urlpattern" && value.kind === "normal",
  )?.req;
if (
  !/^~2\.\d+\.\d+$/.test(releasedTauriUtilsRequirement ?? "") ||
  !/^\^0\.6(?:\.\d+)?$/.test(releasedUrlpatternRequirement ?? "")
) {
  throw new Error(
    "Latest stable Tauri dependency path does not verify the released urlpattern fix",
  );
}

const targetWarnings =
  cargoAudit.targetResolution.warnings.unmaintained.map(
    ({ advisoryId, package: packageName, version }) => ({
      advisoryId,
      package: packageName,
      version,
    }),
  );
if (
  targetWarnings.length !== 0 ||
  cargoAudit.targetResolution.vulnerabilities.length !== 0 ||
  cargoAudit.targetResolution.blockingWarningCount !== 0 ||
  REMOVED_UNIC_PACKAGES.some((name) =>
    cargoAudit.targetResolution.packages.some((item) => item.name === name)
  )
) {
  throw new Error(
    "The upgraded Windows target still contains the old unic chain or a blocking security finding.",
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
  Date.parse(generatedAt) + 29 * 24 * 60 * 60 * 1000,
)
  .toISOString()
  .slice(0, 10);
const report = {
  schemaVersion: DEPENDENCY_RISK_REVIEW_SCHEMA,
  product: "WeatherPoem",
  appVersion: packageJson.version,
  generatedAt,
  status: "upgrade-applied-review-pending",
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
    independentRiskCount: 0,
    clusteredWarningCount: 0,
    frameworkPackage: `tauri-utils@${targetVersion("tauri-utils")}`,
    rootPackage: `urlpattern@${targetVersion("urlpattern")}`,
    leafPackage: null,
    path: [
      `weatherpoem@${packageJson.version}`,
      `tauri@${targetVersion("tauri")}`,
      `tauri-utils@${targetVersion("tauri-utils")}`,
      `urlpattern@${targetVersion("urlpattern")}`,
    ],
  },
  upstream: {
    checkedAt: generatedAt,
    tauriLatestStable: tauriStableVersion,
    tauriUtilsLatestStable: tauriUtilsStableVersion,
    urlpatternLatestStable:
      urlpatternCrate.crate.max_stable_version,
    urlpattern060RemovesUnicUcdIdent: true,
    releasedTauriUtilsRequirement,
    releasedUrlpatternRequirement,
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
      tauriStableDependencies: tauriStableDependenciesUrl,
      tauriUtilsStableDependencies: tauriUtilsStableDependenciesUrl,
    },
  },
  proposedDisposition: {
    action: "verify-applied-stable-upgrade-before-release",
    reason: "old-unic-chain-removed-from-windows-target",
    temporaryControl:
      "block-vulnerabilities-unsound-yanked-and-review-each-candidate",
    upgradeTrigger: "locked-windows-tree-resolves-urlpattern-0.6",
    releaseGate: "before-next-release-candidate",
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
    upstreamFixReleased: true,
    upgradeNotYetApplied: false,
    runtimeWarningStillPresent: false,
    namedSecurityReviewCompleted: false,
  },
  gateSatisfied: false,
  result: "automated-upgrade-verified-review-pending",
};

validateDependencyRiskReview(report, {
  appVersion: packageJson.version,
  cargoAuditSha256: report.inputs.cargoAuditSha256,
  cargoLockSha256: report.inputs.cargoLockSha256,
  targetUnmaintainedWarnings:
    cargoAudit.targetResolution.warnings.unmaintained,
  targetPackages: cargoAudit.targetResolution.packages,
});

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
