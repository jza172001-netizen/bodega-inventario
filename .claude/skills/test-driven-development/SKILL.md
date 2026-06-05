---
name: test-driven-development
description: Use when implementing features, fixing bugs, or refactoring. Enforces writing tests before production code.
---

# Test-Driven Development (TDD)

**Core Mandate: NO PRODUCTION CODE WITHOUT A FAILING TEST FIRST.**

Any code written before its test must be deleted entirely — no exceptions, no keeping it as reference.

## The Red-Green-Refactor Cycle

### RED — Write a failing test
- Write the minimal test that demonstrates the desired behavior
- Run it and confirm it FAILS (red)
- A test that passes immediately proves nothing

### GREEN — Make it pass
- Write the simplest code possible to make the test pass
- Don't add logic beyond what the test requires
- Run tests and confirm GREEN

### REFACTOR — Clean up
- Remove duplication, improve names, simplify
- All tests must still pass after refactoring
- Only refactor on green

## Rules
- Never write production code without a failing test first
- Each cycle should take 2-10 minutes max
- Test behavior, not implementation
- One failing test at a time

## Common Rationalizations to Reject
- "I'll test after, I know what it does" — tests written after pass immediately, proving nothing
- "It's too simple to test" — simple code is easy to test; skip it and it breaks
- "I manually tested it" — manual tests don't run on every change

## Application to Bug Fixes
1. Write a test that reproduces the bug (it should fail)
2. Confirm the test fails for the right reason
3. Fix the bug
4. Confirm the test passes
5. Confirm no other tests broke
