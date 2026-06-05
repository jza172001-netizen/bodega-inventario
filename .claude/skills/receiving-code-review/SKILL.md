---
name: receiving-code-review
description: Use when you receive code review feedback. Guides evaluation and response with technical rigor, not performative compliance.
---

# Receiving Code Review

**Core Principle: Verify before implementing. Ask before assuming. Technical correctness over social comfort.**

## Before Acting on Feedback

1. Read ALL feedback before implementing ANY of it (items may be interdependent)
2. Understand each item technically — what exactly is being asked?
3. Check if the suggestion fits this codebase's patterns
4. Verify it won't break existing functionality

## Response Protocol

**For clear, correct feedback:**
- Implement it
- No need to say "Great point!" — just fix it and reference the line

**For unclear feedback:**
- Ask for clarification before starting
- "I want to understand — are you suggesting X or Y?"
- Don't implement what you think they mean and hope for the best

**For incorrect/inappropriate feedback:**
- Push back with technical reasoning
- "This would break X because Y. Alternative: Z"
- Not defensiveness — technical correctness

## Prohibited Phrases
- "Great point!"
- "You're absolutely right!"
- "I see what you mean!"
(Express agreement through code, not flattery)

## Implementation Order
1. Clarify ambiguous items first (pause entirely until resolved)
2. Fix blocking/Critical issues
3. Fix Important issues
4. Note Minor issues for later

## Red Flags
- Implementing feedback you don't understand
- Partial implementation because "some items are unclear"
- Accepting suggestions that violate existing architecture without pushback
