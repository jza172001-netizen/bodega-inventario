---
name: finishing-a-development-branch
description: Use when a feature branch is complete. Verifies tests, detects environment, and presents merge/PR options.
---

# Finishing a Development Branch

**Core flow: Verify tests → Detect environment → Present options → Execute → Clean up.**

## Step 1 — Verify Tests Pass
```bash
npm run build   # or the project's test command
npm run lint
```
**Stop if tests fail.** Never merge unverified code.

## Step 2 — Detect Environment
```bash
git status
git branch
git log --oneline -5
```
Determine: normal repo or worktree? Named branch or detached HEAD?

## Step 3 — Determine Base Branch
```bash
git remote show origin | grep "HEAD branch"
# Usually main or master
```

## Step 4 — Present Options

**For a normal repo on a named branch:**
1. Merge into base branch locally
2. Create pull request
3. Keep branch as-is (push only)
4. Discard changes (requires typing "discard" to confirm)

**For detached HEAD:**
1. Create new branch + PR
2. Create new branch + merge
3. Discard (requires typing "discard")

## Step 5 — Execute Choice
- Options 1/2: merge or PR
- Option 3: `git push -u origin <branch>`
- Option 4: requires explicit "discard" typed by user

## Step 6 — Clean Up
- Only remove worktrees under `.worktrees/` or provenance-tracked paths
- Run `git worktree prune` after removal
- Never delete a branch before removing its worktree

## Critical Rules
- Never merge with failing tests
- Never skip the typed "discard" confirmation
- Always run from the main repo root for worktree operations
