# Curated Important Events Requirements Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preserve WeatherPoem’s original “important current events connect to traditional culture” vision in the formal requirements while keeping real-time news and runtime event delivery outside the current MVP and campus-pilot scope.

**Architecture:** A focused documentation contract locks the approved staged boundary across the source design, future-feature specification, and MVP verification guide. The product design then records a curated, dual-reviewed post-pilot event overlay with explicit priority, safety, AI, UI, lifecycle, and rollout rules; existing readiness artifacts are regenerated without promoting any current gate.

**Tech Stack:** Markdown, Node.js 24 ESM, `node:test`, JSON readiness artifacts, existing Python DOCX builder and bundled document-audit tools.

## Global Constraints

- Actual development and document source stay under `E:\weatherpoem`; `D:\纯净工作台` remains an external control and audit surface.
- Do not rebuild, replace, rename, terminate, or otherwise disturb the EXE with SHA-256 `830FBE885FCCECD24C43A9209085F053CA78687558DE7A3B466A00024AC310A5` while run `9b325c9b23a949d3ad0092c722912ce4` is active.
- This plan integrates requirements only. It does not implement an event feed, editorial backend, client event overlay, new network permission, or AI news access.
- Versions `0.2–1.0` continue to exclude real-time news and important-event automatic recommendation.
- Post-pilot event priority is exactly `人工批准的重要事件专题 ＞ 节日 ＞ 天气 ＞ 节气`.
- Without an approved in-window topic, normal priority remains exactly `节日 ＞ 天气 ＞ 节气`.
- Severe-weather or public-safety suppression overrides both normal poems and event topics.
- AI never reads raw news and never decides whether an event may be published.
- The main card remains one poem with low information density; event background and sources remain in progressive disclosure.
- The source design must not claim the future feature is implemented, tested, approved, or available.
- Generate `output/WeatherPoem_0.2.0_READINESS.json` before regenerating `review/four-week-pilot-execution-plan.json`, because the latter binds the current readiness hash.
- Do not claim visual DOCX QA until every rendered page has been inspected. The current environment has neither LibreOffice `soffice` nor Microsoft Word.
- `E:\weatherpoem\.git` is not a valid repository. Skip commit commands honestly unless the user separately authorizes repository initialization.

---

### Task 1: Add a Red Requirements-Consistency Contract

**Files:**
- Create: `scripts/product-requirements-contract.test.mjs`

**Interfaces:**
- Consumes:
  - `docs/WeatherPoem_产品设计工作稿.md`
  - `docs/MVP_VERIFICATION.md`
  - `docs/superpowers/specs/2026-07-24-curated-important-events-design.md`
- Produces: a `node:test` contract that fails if the staged feature is removed, moved into MVP, allowed to bypass review, or made denser than the approved card design.

- [ ] **Step 1: Create the failing documentation contract**

Create `scripts/product-requirements-contract.test.mjs` with:

```js
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const read = (relativePath) =>
  readFile(path.join(projectRoot, relativePath), "utf8");
const [productDesign, mvpVerification, eventSpec] =
  await Promise.all([
    read("docs/WeatherPoem_产品设计工作稿.md"),
    read("docs/MVP_VERIFICATION.md"),
    read(
      "docs/superpowers/specs/" +
        "2026-07-24-curated-important-events-design.md",
    ),
  ]);

test("important events remain a reviewed post-pilot feature", () => {
  assert.match(
    productDesign,
    /PD-09[^]*MVP 与四周校园试点不接入实时新闻/,
  );
  assert.match(
    productDesign,
    /### 5\.3 后续重要事件能力边界/,
  );
  assert.match(
    productDesign,
    /人工批准的重要事件专题 ＞ 节日 ＞ 天气 ＞ 节气/,
  );
  assert.match(
    productDesign,
    /严重天气或公共安全抑制状态下，普通诗笺和重要事件专题都暂停/,
  );
  assert.match(
    productDesign,
    /AI 不读取原始新闻/,
  );
  assert.match(
    productDesign,
    /1\.2 Curated Context/,
  );
});

test("future event scope cannot masquerade as current MVP evidence", () => {
  const mvpSection = productDesign.match(
    /### 5\.1 MVP 范围内([^]*?)### 5\.2 MVP 范围外/,
  )?.[1] ?? "";
  assert.doesNotMatch(
    mvpSection,
    /实时新闻|重要事件专题|自动热点/,
  );
  assert.match(
    mvpVerification,
    /重要事件专题不属于当前 MVP/,
  );
  assert.match(
    mvpVerification,
    /不得把未来规格当作当前实现或当前验收证据/,
  );
});

test("approved event design preserves low-density progressive disclosure", () => {
  for (const source of [productDesign, eventSpec]) {
    assert.match(source, /主卡片仍只展示一首诗/);
    assert.match(source, /AI 不读取原始新闻/);
    assert.match(source, /具名编辑/);
    assert.match(source, /具名审核/);
  }
  assert.match(eventSpec, /事件背景默认折叠/);
  assert.match(
    eventSpec,
    /本设计不授权实时新闻抓取/,
  );
  assert.match(
    eventSpec,
    /不允许 AI 自动生成并发布事件专题/,
  );
});
```

- [ ] **Step 2: Run the contract and verify RED**

Run:

```powershell
node --test scripts/product-requirements-contract.test.mjs
```

Expected: the future specification assertions pass, while the product-design or MVP-verification assertions fail because the approved design has not yet been integrated into those files.

- [ ] **Step 3: Record the red-state reason**

Record in the execution notes:

```text
RED is caused by missing staged-boundary wording in the main product design
and MVP verification guide, not by a missing future-feature specification.
```

- [ ] **Step 4: Record the file checkpoint**

Run:

```powershell
Get-FileHash -Algorithm SHA256 `
  scripts/product-requirements-contract.test.mjs
```

Expected: one SHA-256 record. Do not attempt a Git commit.

---

### Task 2: Integrate the Approved Boundary into the Main Product Design

**Files:**
- Modify: `docs/WeatherPoem_产品设计工作稿.md`

**Interfaces:**
- Consumes: `docs/superpowers/specs/2026-07-24-curated-important-events-design.md`
- Produces:
  - revised `PD-09`;
  - new section `5.3 后续重要事件能力边界`;
  - an explicit future version `1.2 Curated Context`;
  - no current-MVP implementation claim.

- [ ] **Step 1: Replace PD-09 with the staged decision**

Replace the existing `PD-09` table row with:

```markdown
| PD-09 | MVP 与四周校园试点不接入实时新闻；试点后仅考虑人工策展的重要事件专题 | 已确认 | 保留“当下事件连接传统文化”的长期愿景，同时控制时效、立场、来源和审核风险 | 四周试点通过，且具名编辑、双人审核、自动过期、撤回和安全抑制能力均已具备 |
```

- [ ] **Step 2: Clarify the current out-of-scope bullet**

Replace:

```markdown
- 实时新闻、社会热点和历史事件日自动推荐。
```

with:

```markdown
- 实时新闻、自动热点判断和未经人工双人审核的重要事件推荐；人工策展专题属于试点后的独立能力，不属于当前 MVP。
```

- [ ] **Step 3: Add the exact future-feature boundary after section 5.2**

Insert:

```markdown
### 5.3 后续重要事件能力边界

重要事件不是新的实时数据源，而是试点后才可能启用的稀少编辑覆盖层。

- 准入：只接受事实稳定、来源可定位、与传统文化存在自然连接的文化、纪念、教育和公共知识事件。
- 审核：每个专题必须由具名编辑提交，并由不同的具名审核人批准；必须设置开始、过期和撤回条件。
- 优先级：有效专题存在时使用“人工批准的重要事件专题 ＞ 节日 ＞ 天气 ＞ 节气”；没有专题时仍使用“节日 ＞ 天气 ＞ 节气”。
- 安全：严重天气或公共安全抑制状态下，普通诗笺和重要事件专题都暂停。
- AI：AI 不读取原始新闻，不判断事件是否可以发布，只能在人工批准的候选诗词中排序并生成不超过 40 字的理由。
- 界面：主卡片仍只展示一首诗和低显著度专题标签；事件摘要、来源与文化连接放入“了解更多”，事件背景默认折叠。
- 生命周期：专题到期或撤回后不得继续展示；服务失败时直接回到现有节日、天气、节气逻辑。
- 上线门禁：四周试点完成后，还需通过编辑审核、自动过期、撤回、缓存防回退、安全抑制和非开发人员 UAT，才允许小范围启用。

完整后续设计见 `docs/superpowers/specs/2026-07-24-curated-important-events-design.md`。
```

- [ ] **Step 4: Extend the version table without changing 1.0 scope**

Replace the existing `1.1 Decision` row and add `1.2`:

```markdown
| 1.1 Decision | 试点后决策 | 根据证据决定个性化、平台扩展、内容扩充和重要事件专题投入 |
| 1.2 Curated Context | 人工策展情境 | 门禁满足后，小范围启用具名双人审核的重要事件专题 |
```

- [ ] **Step 5: Run the product contract and inspect the remaining RED**

Run:

```powershell
node --test scripts/product-requirements-contract.test.mjs
```

Expected: the product-design assertions pass; the MVP-verification boundary assertion still fails.

- [ ] **Step 6: Check that the current MVP list did not gain the future feature**

Run:

```powershell
rg -n -A 15 "### 5\\.1 MVP 范围内" `
  docs/WeatherPoem_产品设计工作稿.md
```

Expected: the ten existing MVP items remain; no real-time news, event topic, or automatic-hotspot capability appears.

---

### Task 3: Lock the Boundary in MVP Verification and Package Checks

**Files:**
- Modify: `docs/MVP_VERIFICATION.md`
- Modify: `package.json`

**Interfaces:**
- Consumes: the approved event specification and Task 1 contract.
- Produces:
  - explicit future-scope wording in the operator guide;
  - `requirements:check` execution of both readiness and product-document contracts.

- [ ] **Step 1: Add the future-scope note to MVP verification**

After the current MVP scope/readiness summary, insert:

```markdown
### 重要事件的阶段边界

重要事件专题不属于当前 MVP，也不属于当前四周校园试点候选。当前发布物不抓取实时新闻、不自动判断热点，也不把未来规格作为当前功能。

试点后若进入 `1.2 Curated Context`，只允许具名编辑和不同的具名审核人共同批准、带有效期和撤回条件的少量专题。AI 不读取原始新闻；主卡片仍只展示一首诗；严重天气和公共安全抑制优先。自动检查不得把未来规格当作当前实现或当前验收证据。
```

- [ ] **Step 2: Run the focused contract and verify GREEN**

Run:

```powershell
node --test scripts/product-requirements-contract.test.mjs
```

Expected: all three tests pass.

- [ ] **Step 3: Wire the contract into `requirements:check`**

Replace the `requirements:check` package script with:

```json
"requirements:check": "node scripts/generate-project-readiness.mjs --check && node --test scripts/project-readiness-contract.test.mjs scripts/product-requirements-contract.test.mjs"
```

Do not add the future event contract to `requirements:pilot` or `requirements:public` separately; both already invoke `npm run check`, which invokes `requirements:check`.

- [ ] **Step 4: Verify the package command includes both contracts**

Run:

```powershell
npm.cmd pkg get scripts[requirements:check]
```

Expected:

```json
{
  "scripts[requirements:check]": "node scripts/generate-project-readiness.mjs --check && node --test scripts/project-readiness-contract.test.mjs scripts/product-requirements-contract.test.mjs"
}
```

- [ ] **Step 5: Run the package-level requirements check and observe the expected stale-input boundary**

Run:

```powershell
npm.cmd run requirements:check
```

Expected before regeneration: either a stale-input failure caused by the changed `package.json`, or a pass if the readiness report does not bind that field. A stale-input failure is the intended signal to continue to Task 4; do not weaken validation.

---

### Task 4: Refresh Hash-Bound Planning and Readiness Artifacts

**Files:**
- Regenerate: `review/content-asset-license-inventory.json`
- Regenerate: `review/signed-updater-plan.json`
- Regenerate: `review/public-distribution-rehearsal.json`
- Regenerate: `review/windows-code-signing-plan.json`
- Regenerate: `review/requirements-traceability.json`
- Regenerate: `output/WeatherPoem_0.2.0_READINESS.json`
- Regenerate: `review/four-week-pilot-execution-plan.json`

**Interfaces:**
- Consumes: current `package.json`, current source documents, current release evidence.
- Produces: current hashes without changing any manual gate from `partial`/`pending` to `passed`.

- [ ] **Step 1: Regenerate package-bound planning artifacts**

Run each command separately:

```powershell
npm.cmd run licenses:generate
npm.cmd run licenses:notices:generate
npm.cmd run updater:plan:generate
npm.cmd run distribution:plan:generate
npm.cmd run signing:plan:generate
```

Expected: every command exits `0`; no installer is rebuilt.

- [ ] **Step 2: Regenerate readiness before the four-week plan**

Run:

```powershell
npm.cmd run requirements:generate
```

Expected: the report remains `internal-trial-ready-only`; campus pilot and public release remain `not-ready`.

- [ ] **Step 3: Regenerate the dependent four-week plan**

Run:

```powershell
npm.cmd run pilot:four-week:generate
```

Expected: the plan binds the current readiness hash, remains blocked by the real campus gates, and does not claim recruitment started.

- [ ] **Step 4: Verify readiness and the dependent plan**

Run:

```powershell
npm.cmd run requirements:check
npm.cmd run pilot:four-week:check
```

Expected: both commands exit `0`; `RQT-22` remains `partial`, and no gate changes because of the future design.

- [ ] **Step 5: Prove no future event claim entered current traceability**

Run:

```powershell
rg -n "重要事件专题|Curated Context|实时新闻" `
  review/requirements-traceability.json `
  output/WeatherPoem_0.2.0_READINESS.json
```

Expected: either no matches, or wording that explicitly identifies the feature as future scope. There must be no `passed`, `implemented`, `enabled`, or current-MVP claim attached to it.

---

### Task 5: Preflight the Updated Requirements Document

**Files:**
- Generate temporary: `tmp/docx-important-events-preflight/WeatherPoem_需求说明书_预检.docx`
- Generate temporary: `tmp/docx-important-events-preflight/style-lint.json`
- Generate temporary: `tmp/docx-important-events-preflight/a11y.json`
- Do not overwrite: `output/WeatherPoem_项目需求与落地实施方案_v3.0.docx`

**Interfaces:**
- Consumes: updated `docs/WeatherPoem_产品设计工作稿.md`.
- Produces: structural document evidence only; visual page evidence remains pending until a rendering backend exists.

- [ ] **Step 1: Create the temporary QA directory**

Run:

```powershell
New-Item -ItemType Directory -Force `
  -Path "tmp\docx-important-events-preflight"
```

Expected: the directory exists under `E:\weatherpoem\tmp`.

- [ ] **Step 2: Build the temporary DOCX with the bundled Python runtime**

Run:

```powershell
& "C:\Users\zzh\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe" `
  "tools\build_requirements_doc.py" `
  --markdown "docs\WeatherPoem_产品设计工作稿.md" `
  --output "tmp\docx-important-events-preflight\WeatherPoem_需求说明书_预检.docx"
```

Expected: exit code `0`; the final output DOCX is not touched.

- [ ] **Step 3: Run style lint**

Run:

```powershell
& "C:\Users\zzh\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe" `
  "C:\Users\zzh\.codex\plugins\cache\openai-primary-runtime\documents\26.715.12143\skills\documents\scripts\style_lint.py" `
  "tmp\docx-important-events-preflight\WeatherPoem_需求说明书_预检.docx" `
  --json "tmp\docx-important-events-preflight\style-lint.json"
```

Expected: exit code `0`; any intentional direct formatting remains reported rather than auto-normalized.

- [ ] **Step 4: Run the accessibility audit**

Run:

```powershell
& "C:\Users\zzh\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe" `
  "C:\Users\zzh\.codex\plugins\cache\openai-primary-runtime\documents\26.715.12143\skills\documents\scripts\a11y_audit.py" `
  "tmp\docx-important-events-preflight\WeatherPoem_需求说明书_预检.docx" `
  --out_json "tmp\docx-important-events-preflight\a11y.json"
```

Expected: exit code `0` and zero high-severity findings.

- [x] **Step 5: Render with the tested local Windows adapter and inspect every page**

Run:

```powershell
& "C:\Users\zzh\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe" `
  "tools\render_docx_windows.py" `
  "tmp\docx-important-events-preflight\fixed-2\WeatherPoem_需求说明书_修正版.docx" `
  --output_dir "tmp\docx-important-events-preflight\fixed-2\rendered" `
  --emit_pdf
```

Inspect every `page-*.png` at 100% zoom. Do not spot-check.

---

### Task 6: Run Final Non-Rebuild Verification for This Integration

**Files:**
- Verify all files touched in Tasks 1–5.
- Do not run `tauri build`.

**Interfaces:**
- Consumes: integrated documentation, regenerated evidence, and the active long-run state.
- Produces: a verified requirements-only change with an honest post-pilot boundary.

- [ ] **Step 1: Run the focused documentation and readiness contracts**

Run:

```powershell
node --test `
  scripts/product-requirements-contract.test.mjs `
  scripts/project-readiness-contract.test.mjs
```

Expected: all tests pass.

- [ ] **Step 2: Run lint**

Run:

```powershell
npm.cmd run lint
```

Expected: exit code `0`, zero warnings.

- [ ] **Step 3: Run the complete project check**

Run:

```powershell
npm.cmd run check
```

Expected: exit code `0`; this may rebuild frontend `dist` but must not call `tauri build` or replace the frozen EXE.

- [ ] **Step 4: Verify the exact staged language**

Run:

```powershell
rg -n `
  "PD-09|5\\.3 后续重要事件能力边界|人工批准的重要事件专题 ＞ 节日 ＞ 天气 ＞ 节气|AI 不读取原始新闻|1\\.2 Curated Context|重要事件专题不属于当前 MVP" `
  docs/WeatherPoem_产品设计工作稿.md `
  docs/MVP_VERIFICATION.md
```

Expected: all six concepts appear; no text says the future feature is currently implemented.

- [ ] **Step 5: Recheck the eight-hour run without modifying it**

Run:

```powershell
npm.cmd run performance:eight-hour:status
```

If status remains `running`, confirm both processes are alive and the artifact SHA-256 is unchanged. If status is `completed`, immediately run:

```powershell
npm.cmd run performance:eight-hour:check
```

Only a passing formal result permits the separate post-long-run rebuild plan to begin.

- [ ] **Step 6: Record the final file hashes**

Run:

```powershell
Get-FileHash -Algorithm SHA256 `
  docs/superpowers/specs/2026-07-24-curated-important-events-design.md, `
  docs/WeatherPoem_产品设计工作稿.md, `
  docs/MVP_VERIFICATION.md, `
  scripts/product-requirements-contract.test.mjs, `
  package.json
```

Expected: five SHA-256 records. Do not attempt a Git commit.

---

## Execution Record

Tasks 1–6 were executed inline on 2026-07-24. This record closes the
requirements-integration plan only; it does not claim that the post-pilot
event capability exists at runtime.

- The first focused contract run was RED with `0/3` passing because the
  staged boundary was not yet present in the product design or MVP guide.
- After integrating the product design and correcting an over-constrained
  test expression, the intended intermediate state was `2/3` passing; only
  the missing MVP-verification boundary remained RED.
- After updating the MVP guide, the product requirements contract was GREEN
  with `3/3` passing.
- The combined product/readiness contract run was GREEN with `10/10`
  passing.
- `npm.cmd run requirements:check`, `npm.cmd run pilot:four-week:check`,
  `npm.cmd run licenses:notices:check`, `npm.cmd run lint`, and
  `npm.cmd run check` all exited `0`. The complete project check included
  `80/80` frontend Vitest tests and did not invoke `tauri build`.
- Hash-bound license, updater, distribution, signing, readiness, and
  four-week-pilot artifacts were regenerated in dependency order. Campus
  pilot and public release remained not ready; no future event topic was
  promoted into current MVP evidence.
- The temporary requirements DOCX was rebuilt under
  `tmp/docx-important-events-preflight/fixed-2`. Style lint exited `0`; the
  accessibility audit reported zero high-, medium-, and low-severity
  findings.
- The tested local Windows adapter `tools/render_docx_windows.py` rendered
  73 pages. The first render exposed split code paragraphs and narrow
  identifier columns; the second exposed a narrow three-column field table.
  Both defects were fixed in the builder through
  `tools/test_build_requirements_doc_layout.py`. The final 73-page render was
  reviewed page by page at original resolution with no clipping, overlap,
  missing glyphs, broken tables, abnormal identifier wrapping, or
  header/footer drift. Adapter coverage is in
  `tools/test_render_docx_windows.py`.
- The active eight-hour run remained healthy at the latest pre-completion
  recheck: run `9b325c9b23a949d3ad0092c722912ce4`, `469` samples, `97.744%`,
  launcher PID `77768` alive, app PID `76340` alive, and artifact SHA-256
  `830FBE885FCCECD24C43A9209085F053CA78687558DE7A3B466A00024AC310A5`.
  The frozen EXE was not rebuilt, replaced, renamed, or terminated.
- `E:\weatherpoem` remained the actual development directory.
  `D:\纯净工作台` remained an external control and audit surface.
- No Git commit was attempted because `E:\weatherpoem\.git` is not a valid
  repository.

Final file checkpoints:

| File | SHA-256 |
|---|---|
| `docs/superpowers/specs/2026-07-24-curated-important-events-design.md` | `757426FC73A631EAEBF1E85BF8088114B60DB2CE0F26D3B3F8DFDCCB825205CF` |
| `docs/WeatherPoem_产品设计工作稿.md` | `CAD0CD8A217AB26DD300A2712C005F2281BF8C7D7EE3A57EC5F6DA9C3711349B` |
| `docs/MVP_VERIFICATION.md` | `F0B62589264C6FE6B81FFFFE596285DE78A4AE1905CA3EA10F81E5EFB91B8AAD` |
| `scripts/product-requirements-contract.test.mjs` | `29368A932FA6BCE145C4062C909D29A38BBAF5950C4DDA6CC9E82ECFB2863208` |
| `package.json` | `D05F9E33C4D521CB47EC7D6DFBDB2A6ACD037599CEED7ADEA4F400BDBB71E0F2` |

---

## Completion Boundary

This plan is complete when the approved future-event design is present in the formal source requirements, explicitly excluded from the current MVP, protected by automated document contracts, reflected in the version roadmap, structurally preflighted in a temporary DOCX, and verified without changing the running candidate.

Completion of this plan does not mean:

- a news or event service exists;
- an editorial backend exists;
- AI may access news;
- an important-event topic has been published;
- the current release or campus pilot contains the feature;
- legal, content, security, or public-release approval has been granted.
