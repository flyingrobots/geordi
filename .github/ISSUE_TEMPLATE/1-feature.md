---
name: Feature
about: Use when the end state is known and only the work remains.
title: ''
labels: enhancement
assignees: ''
---

```yaml
.dag: issue-dag/1
.id: TBD
.kind: task
.type: feature
.blocked_by: []
area: <package, crate, or path>
source: <where this work came from>
```
<!-- After you create the issue, set .id to #<its number>. List blockers in .blocked_by as #N (this repository) or owner/repo#N. Keys that start with . belong to issue-dag/1 (see AGENTS.md, Work Tracking). -->

# Feature

```text
<Write the prompt for the agent that does this task, in ASD-STE100.
Tell the agent which files to read first.
Tell the agent which result to make, and which criteria the result must satisfy.
Tell the agent which checks to run before it stops.>
```

## 1. Background Context

## 2. Problem Description
## 2b. Proposed Solution
## 2c. Alternatives considered and rejected
One line each.
## 2d. Acceptance Criteria
## 2e. Test Plan
Golden:
Edges:
Known failure modes:
Fuzz and stress:

## 3. Prerequisites
- [ ]

## 4. Scope
In:
Out:

## 5. Why now
## 6. Risks
## 7. Definition of Done
## 8. Stakeholders
## 9. Related Issues
