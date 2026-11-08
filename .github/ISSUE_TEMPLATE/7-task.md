---
name: Task
about: Plain nine-section card. Use when no typed card fits.
title: ''
labels: task
assignees: ''
---

```yaml
type: task
status: open
area: <package, crate, or path>
prerequisites: []
related: []
source: <where this work came from>
```

# Task

```text
<Write the prompt for the agent that does this task, in ASD-STE100.
Tell the agent which files to read first.
Tell the agent which result to make, and which criteria the result must satisfy.
Tell the agent which checks to run before it stops.>
```

## 1. Background Context
What this concerns.

## 2. Problem Description
What is broken or missing.

## 3. Proposed Solution
How to fix it.

## 4. Prerequisites
Before we start, these must be true.
- [ ]

## 5. Scope
In:
Out:

## 6. Acceptance Criteria
What must be true before this is considered finished.

## 7. Definition of Done
How to know when to stop.

## 8. Test Plan
Golden:
Edges:
Known failure modes:
Fuzz and stress:

## 9. Stakeholders
Named people or teams who care about this issue, and why.

<!--
Acceptance Criteria and Definition of Done are different. Acceptance Criteria is what the result must satisfy. Definition of Done is the signal to stop, which usually includes recording the result.
Write "none" or "not applicable, because X" instead of padding a section.
Stakeholders names people where the record supports a name, and says why each cares.
-->
