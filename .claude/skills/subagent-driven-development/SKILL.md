---
name: subagent-driven-development
description: Use when executing a multi-task plan. Dispatches a fresh agent per task with mandatory spec + quality review after each.
---

# Subagent-Driven Development

**Pattern: Fresh subagent per task → spec review → code quality review → next task.**

## When to Use
- You have a written implementation plan with mostly independent tasks
- Tasks can be executed within the current session
- Work should not require extensive human input between steps

## Workflow

### Setup
1. Load the implementation plan
2. Create a task tracking list
3. Assign model tiers (lighter model for mechanical tasks, stronger for architecture)

### Per-Task Loop
```
For each task:
  1. Dispatch implementer subagent with:
     - The specific task description
     - Relevant file paths and context
     - Expected output
  
  2. Dispatch spec-compliance reviewer:
     - Did the implementation meet the requirements?
     - Returns: PASS / FAIL with specific gaps
  
  3. If FAIL: same implementer fixes gaps, re-review
  
  4. Dispatch code-quality reviewer:
     - Is the code clean, correct, no duplication?
     - Returns: PASS / FAIL
  
  5. If PASS both: mark task complete, proceed to next
```

## Critical Rules
- **Never skip reviews** — "looks good" without review is not a review
- **Never proceed with unfixed issues** — a FAIL is a stop signal
- **Spec compliance before quality** — don't review quality if spec isn't met
- **BLOCKED status = something must change** — reassigning without changes is not a fix

## Model Efficiency
- Mechanical tasks (formatting, rename, boilerplate): lighter/faster model
- Architecture, complex logic, debugging: stronger model
- Reviews: medium model is usually sufficient
