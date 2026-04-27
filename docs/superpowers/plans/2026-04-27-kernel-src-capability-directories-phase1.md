# Kernel Src Capability Directories Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Start the `kernel/src` capability-directory refactor with low-risk file moves and import updates.

**Architecture:** Phase 1 creates the first target capability directories without touching runtime behavior. It moves low-coupling utilities and protocol helpers into `shared/`, `observable/`, and `executable/`, then updates imports directly.

**Tech Stack:** TypeScript, Bun, git, `bun run typecheck`, `bun test`.

---

## File Structure

Create:

- `kernel/src/shared/logging.ts`
- `kernel/src/shared/utils/serial-queue.ts`
- `kernel/src/shared/integrations/feishu.ts`
- `kernel/src/observable/server/events.ts`
- `kernel/src/executable/protocol/xml.ts`
- `kernel/src/executable/protocol/virtual-path.ts`

Remove after moving:

- `kernel/src/logging.ts`
- `kernel/src/utils/serial-queue.ts`
- `kernel/src/integrations/feishu.ts`
- `kernel/src/server/events.ts`
- `kernel/src/thread/xml.ts`
- `kernel/src/thread/virtual-path.ts`

Modify imports in files that reference the moved modules. Do not change public behavior or exported symbol names.

---

### Task 1: Move Shared Utilities

**Files:**
- Move: `kernel/src/logging.ts` → `kernel/src/shared/logging.ts`
- Move: `kernel/src/utils/serial-queue.ts` → `kernel/src/shared/utils/serial-queue.ts`
- Move: `kernel/src/integrations/feishu.ts` → `kernel/src/shared/integrations/feishu.ts`

- [ ] **Step 1: Move files with git**

Run:

```bash
mkdir -p src/shared/utils src/shared/integrations
git mv src/logging.ts src/shared/logging.ts
git mv src/utils/serial-queue.ts src/shared/utils/serial-queue.ts
git mv src/integrations/feishu.ts src/shared/integrations/feishu.ts
```

- [ ] **Step 2: Update imports**

Run:

```bash
rg -n "logging|serial-queue|integrations/feishu" src tests
```

Replace old imports with:

```ts
import { consola } from "../shared/logging.js";
import { SerialQueue } from "../shared/utils/serial-queue.js";
import { FeishuClient } from "../shared/integrations/feishu.js";
```

Use the correct relative path from each importing file.

- [ ] **Step 3: Verify**

Run:

```bash
bun run typecheck
```

Expected: exit code 0.

---

### Task 2: Move Observable Server Events

**Files:**
- Move: `kernel/src/server/events.ts` → `kernel/src/observable/server/events.ts`
- Modify: imports that referenced `src/server/events.ts`

- [ ] **Step 1: Move file**

Run:

```bash
mkdir -p src/observable/server
git mv src/server/events.ts src/observable/server/events.ts
```

- [ ] **Step 2: Update imports**

Known import to update:

```ts
import { eventBus, type SSEEvent } from "../observable/server/events.js";
```

For files already inside `src/server/`, use:

```ts
import { eventBus, type SSEEvent } from "../observable/server/events.js";
```

- [ ] **Step 3: Verify server/event tests**

Run:

```bash
bun test tests/thread-title.test.ts tests/thread-engine.test.ts tests/server-user-inbox.test.ts
```

Expected: all selected tests pass.

---

### Task 3: Move Executable Protocol Helpers

**Files:**
- Move: `kernel/src/thread/xml.ts` → `kernel/src/executable/protocol/xml.ts`
- Move: `kernel/src/thread/virtual-path.ts` → `kernel/src/executable/protocol/virtual-path.ts`
- Modify: imports in context/command/server tests and implementation

- [ ] **Step 1: Move files**

Run:

```bash
mkdir -p src/executable/protocol
git mv src/thread/xml.ts src/executable/protocol/xml.ts
git mv src/thread/virtual-path.ts src/executable/protocol/virtual-path.ts
```

- [ ] **Step 2: Update imports**

Known replacements:

```ts
from "./xml.js" -> from "../executable/protocol/xml.js"
from "../src/thread/xml.js" -> from "../src/executable/protocol/xml.js"
from "./virtual-path.js" -> from "../executable/protocol/virtual-path.js"
from "../src/thread/virtual-path.js" -> from "../src/executable/protocol/virtual-path.js"
```

Use the correct relative path for each file.

- [ ] **Step 3: Verify protocol tests**

Run:

```bash
bun test tests/thread-engine-xml-structure.test.ts tests/virtual-path.test.ts tests/open-files.test.ts
```

Expected: all selected tests pass. If `tests/virtual-path.test.ts` does not exist, run the test file that imports `virtual-path`.

---

### Task 4: Final Phase 1 Verification and Commit

**Files:**
- All moved files and import updates from Tasks 1-3.

- [ ] **Step 1: Run full typecheck**

Run:

```bash
bun run typecheck
```

Expected: exit code 0.

- [ ] **Step 2: Run full tests**

Run:

```bash
bun test
```

Expected: all non-skipped tests pass.

- [ ] **Step 3: Check diff hygiene**

Run:

```bash
git diff --check
git status --short
```

Expected: no whitespace errors; only intended moved files and import updates are dirty.

- [ ] **Step 4: Commit**

Run:

```bash
git add -A
git commit -m "refactor: start capability directory layout"
```

Expected: one kernel commit containing Phase 1 moves only.

