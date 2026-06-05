---
name: systematic-debugging
description: Use when investigating bugs, errors, or unexpected behavior. Enforces root cause analysis before any fix attempt.
---

# Systematic Debugging

**Iron Law: NO FIXES WITHOUT ROOT CAUSE INVESTIGATION FIRST.**

Quick patches without understanding the root cause waste time and create new problems.

## Four-Phase Process

### Phase 1 — Root Cause Investigation
- Read the full error message carefully
- Reproduce the issue consistently
- Check recent changes (git log, git diff)
- Trace data flow backward to find where the problem originates
- Gather diagnostic evidence before touching code

### Phase 2 — Pattern Analysis
- Find working examples in the codebase (Grep for similar patterns)
- Compare against references completely
- Identify all differences systematically
- Understand dependencies involved

### Phase 3 — Hypothesis and Testing
- Form one specific hypothesis at a time
- Make the smallest possible change to test it
- Verify the result before moving on
- If ≥ 3 attempts fail: STOP and question the architecture

### Phase 4 — Implementation
- Create a failing test case first
- Implement a single fix that addresses the root cause
- Verify the fix works end-to-end

## Red Flags (stop if you're doing these)
- Proposing a solution before tracing data flow
- Making multiple simultaneous changes
- Attempting a 3rd fix without stepping back
- Saying "it should work" without running it

## Key Insight
Systematic debugging has a documented 95% first-time fix rate vs 40% for guess-and-check — even under time pressure, the process is faster.
