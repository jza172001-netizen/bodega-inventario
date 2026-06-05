---
name: verification-before-completion
description: Use before claiming any task is done. Enforces running actual commands and reading real output before reporting completion.
---

# Verification Before Completion

**Rule: Never claim work is complete without running fresh verification and reading actual output.**

"Evidence before claims, always." Claiming completion without verification is dishonesty, not efficiency.

## The Gate — Before any "done" claim:

1. Identify the command that proves your assertion
2. Run the full command fresh (no cached results)
3. Read the complete output
4. Check exit codes explicitly
5. Confirm the output actually supports the claim
6. Only then state completion with evidence

## Prohibited Phrases (never use without running the command)
- "should work"
- "probably passes"
- "seems correct"
- "I believe it's fixed"
- "tests are passing" (without just running them)

## Application
- Before committing: run the build/lint
- Before saying a bug is fixed: reproduce the bug, apply the fix, confirm it no longer reproduces
- Before saying tests pass: run the tests, read the output
- Before merging: run the full test suite

## Why
Previous failures documented in this methodology:
- Undefined functions shipped
- Missing requirements shipped
- Broken trust with collaborators

Honesty requires evidence. If you lie, you'll be replaced.
