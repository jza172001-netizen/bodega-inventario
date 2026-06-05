---
name: executing-plans
description: Use when implementing a pre-written plan. Guides structured execution with checkpoints and blockers handled correctly.
---

# Executing Plans

**Principle: Stop at blockers. Verify at checkpoints. Never guess through uncertainty.**

## Phase 1 — Load and Review the Plan
1. Read the full plan before starting any task
2. Identify dependencies between tasks
3. Flag anything unclear BEFORE starting (ask, don't assume)
4. Confirm you're on the right branch (never main/master without explicit approval)

## Phase 2 — Execute Tasks

For each task:
```
[ ] Mark task as IN PROGRESS
[ ] Follow the specified steps exactly
[ ] Run the verification command specified in the plan
[ ] Read the full output
[ ] Mark task COMPLETE only after verification passes
[ ] Commit with a descriptive message referencing the task
```

## When to STOP Immediately
- A dependency is missing
- Tests fail and you don't know why
- Instructions are ambiguous (ask for clarification)
- Verification fails twice in a row
- You're about to make a change not in the plan

**Ask for clarification rather than guessing. A 2-minute pause beats 2 hours of wrong work.**

## Phase 3 — Completion
Use the `finishing-a-development-branch` skill to:
- Verify all tests pass
- Confirm all tasks are checked off
- Present merge/PR options

## Integration
Works with:
- `writing-plans` — to create the plan
- `using-git-worktrees` — for isolated workspaces
- `finishing-a-development-branch` — for the final step
