import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  LICENSE_INVENTORY_PATH,
  collectLicenseInventoryInputs,
  validateLicenseInventory,
} from "./license-inventory-support.mjs";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const inputs = await collectLicenseInventoryInputs(projectRoot);
const inventory = JSON.parse(
  await readFile(
    path.join(
      projectRoot,
      ...LICENSE_INVENTORY_PATH.split("/"),
    ),
    "utf8",
  ),
);
const summary = validateLicenseInventory(inventory, inputs);

console.log(
  `许可台账有效：${summary.workCount} 首内容、` +
    `${summary.iconFileCount} 个图标资产文件、` +
    `${summary.npmPackageCount} 个 npm 包、` +
    `${summary.cargoPackageCount} 个 Windows Rust 第三方包；` +
    "RQT-23 保持 partial，未冒充具名法律许可。",
);
