import { writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  LICENSE_INVENTORY_PATH,
  buildLicenseInventory,
  collectLicenseInventoryInputs,
  validateLicenseInventory,
} from "./license-inventory-support.mjs";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const outputPath = path.join(
  projectRoot,
  ...LICENSE_INVENTORY_PATH.split("/"),
);
const inputs = await collectLicenseInventoryInputs(projectRoot);
const inventory = buildLicenseInventory(
  inputs,
  new Date().toISOString(),
);
const summary = validateLicenseInventory(inventory, inputs);

await writeFile(
  outputPath,
  `${JSON.stringify(inventory, null, 2)}\n`,
  "utf8",
);

console.log(
  `许可台账已生成：${summary.workCount} 首内容、` +
    `${summary.iconFileCount} 个图标资产文件、` +
    `${summary.npmPackageCount} 个 npm 包、` +
    `${summary.cargoPackageCount} 个 Windows Rust 第三方包；` +
    "公开发布许可仍待具名内容/设计/数据/法务负责人确认。",
);
