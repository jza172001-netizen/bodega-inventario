---
name: writing-plans
description: Use when planning a multi-step implementation. Creates detailed, executable plans with no placeholders.
---

# Writing Plans

## Core Purpose
Generate comprehensive implementation plans for multi-step tasks. Plans are designed for execution — every step is concrete, every code snippet is real, no placeholders.

## Key Principles

**Task Granularity:** Each step takes 2-5 minutes and represents one atomic action:
- Write test → verify it fails → implement → verify it passes → commit

**No Placeholders — Ever:**
- WRONG: "add validation logic here"
- RIGHT: Show the exact function with the validation code

**File Map First:** Before tasks, list which files are created/modified and their responsibilities.
- Files that change together should live together
- Split by responsibility, not by technical layer

## Plan Format

Save to: `docs/superpowers/plans/YYYY-MM-DD-<feature-name>.md`

Structure:
```
# Plan: <feature name>
Goal: <one sentence>
Architecture: <key decisions>
Files changed: <list>

## Task 1 — <name>
File: path/to/file.ts
[ ] Step 1: <exact action with code>
[ ] Step 2: run `<exact command>`, expected output: <what you'll see>
```

## Self-Review Checklist Before Handoff
- [ ] Every requirement maps to a task
- [ ] No placeholder language remains
- [ ] Type/function names are consistent across all tasks
- [ ] Each task has a verification step

## Execution Options After Writing
1. **Subagent-driven:** Fresh subagent per task (isolated context, parallel capable)
2. **Inline:** Execute tasks in order in the current session with checkpoints
