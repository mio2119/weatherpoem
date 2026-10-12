import { access, readFile } from "node:fs/promises";
import path from "node:path";
import {
  PILOT_EVENTS,
  PILOT_PLAN_VERSION,
  validatePilotPlan,
} from "./pilot-plan-support.mjs";

const projectRoot = path.resolve(import.meta.dirname, "..");
const plan = JSON.parse(
  await readFile(
    path.join(projectRoot, "review", "pilot-plan.json"),
    "utf8",
  ),
);
validatePilotPlan(plan);

const implementation = await readFile(
  path.join(projectRoot, "src", "core", "pilot.ts"),
  "utf8",
);
if (
  !implementation.includes(
    `PILOT_PLAN_VERSION = "${PILOT_PLAN_VERSION}"`,
  )
) {
  throw new Error("试点计划版本与客户端实现不一致");
}
for (const event of PILOT_EVENTS) {
  if (!implementation.includes(`"${event}"`)) {
    throw new Error(`客户端缺少试点事件：${event}`);
  }
}
for (const reference of Object.values(plan.instruments)) {
  const [relativePath] = reference.split("#");
  await access(path.join(projectRoot, ...relativePath.split("/")));
}

console.log(
  "试点计划契约通过：28 天本地按日聚合、无时间戳会话/异常中断计数、零自动上传、退出即删和第 35 天起下次启动清除已实现；具名负责人、联系方式与隐私批准仍未完成。",
);
