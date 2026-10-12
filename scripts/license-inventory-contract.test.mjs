import assert from "node:assert/strict";
import test from "node:test";
import {
  buildLicenseInventory,
  validateLicenseInventory,
} from "./license-inventory-support.mjs";

const sha = "A".repeat(64);
const inputs = {
  packageJson: {
    name: "weatherpoem",
    version: "0.2.0",
    private: true,
  },
  contentCatalog: {
    contentVersion: "2026.07.1",
  },
  npmPackages: [
    {
      name: "vue",
      version: "3.5.40",
      license: "MIT",
      resolved: "https://registry.npmjs.org/vue/-/vue-3.5.40.tgz",
    },
  ],
  cargoPackages: [
    {
      name: "tauri",
      version: "2.11.5",
      license: "Apache-2.0 OR MIT",
      source:
        "registry+https://github.com/rust-lang/crates.io-index",
      repository: "https://github.com/tauri-apps/tauri",
    },
  ],
  projectLicenseFiles: [],
  fontFiles: [],
  iconFiles: [
    {
      path: "src-tauri/icons/app-icon.svg",
      bytes: 10,
      sha256: sha,
    },
  ],
  sourceNames: ["《全唐诗》"],
  contentCounts: {
    workCount: 1,
    sourceNamePopulated: 1,
    oneLineSummaryPopulated: 1,
    culturalBackgroundPopulated: 1,
    contemporaryConnectionPopulated: 1,
    annotationCount: 2,
  },
  hashedInputs: Object.fromEntries(
    [
      "packageJson",
      "packageLock",
      "cargoLock",
      "cargoAudit",
      "contentCatalog",
      "iconSource",
      "iconPng",
      "iconIco",
      "inlineIcons",
      "styles",
      "settingsPanel",
      "desktopService",
      "tauriConfig",
      "capability",
      "rustShell",
    ].map((key) => [
      key,
      {
        path: `${key}.fixture`,
        sha256: sha,
      },
    ]),
  ),
  implementationChecks: {
    openMeteoAttribution: true,
    noticeBundleConfigured: true,
  },
};

test("完整台账保持人工许可门禁未通过", () => {
  const inventory = buildLicenseInventory(
    structuredClone(inputs),
    new Date().toISOString(),
  );
  const result = validateLicenseInventory(inventory, inputs);
  assert.equal(result.npmPackageCount, 1);
  assert.equal(result.cargoPackageCount, 1);
  assert.equal(inventory.gateSatisfied, false);
});

test("拒绝把古诗公版候选冒充为具体底本已获许可", () => {
  const inventory = buildLicenseInventory(
    structuredClone(inputs),
    new Date().toISOString(),
  );
  inventory.classicalContent.editionOrTranscriptionRightsVerified =
    true;
  assert.throws(
    () => validateLicenseInventory(inventory, inputs),
    /古诗公版候选/,
  );
});

test("拒绝删除 Open-Meteo 署名或伪造服务档位与法务批准", () => {
  const inventory = buildLicenseInventory(
    structuredClone(inputs),
    new Date().toISOString(),
  );
  inventory.externalServices.find(
    (item) => item.id === "open-meteo",
  ).attributionImplemented = false;
  inventory.externalServices.find(
    (item) => item.id === "open-meteo",
  ).serviceTierApproved = true;
  inventory.approval.legalReviewer = "虚构审批人";
  inventory.gateSatisfied = true;
  assert.throws(
    () => validateLicenseInventory(inventory, inputs),
    /Open-Meteo/,
  );
});
