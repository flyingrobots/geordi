---
name: Decision
about: Use when the facts are known and the open item is which option, and who says so.
title: ''
labels: decision
assignees: ''
---

```yaml
.dag: issue-dag/1
.id: TBD
.kind: task
.type: decision
.blocked_by: []
area: <package, crate, or path>
source: <where this work came from>
```
<!-- After you create the issue, set .id to #<its number>. List blockers in .blocked_by as #N (this repository) or owner/repo#N. Keys that start with . belong to issue-dag/1 (see AGENTS.md, Work Tracking). -->

# Decision

```text
<Write the prompt for the agent that does this task, in ASD-STE100.
Tell the agent which files to read first.
Tell the agent which result to make, and which criteria the result must satisfy.
Tell the agent which checks to run before it stops.>
```

## 1. Background Context

## 2. The choice
A question with named options.
## 2b. Options and consequences
One line each.
## 2c. Rests on
Evidence, cited by something immutable, or a person, named.
## 2d. Who decides, and by when
## 2e. What is blocked until then
## 2f. Reversible

## 3. Prerequisites
- [ ]

## 4. Scope
In:
Out:

## 5. Why now
## 6. Risks
## 7. Definition of Done
Recorded where the next reader will find it, which is usually not only this card.
## 8. Stakeholders
## 9. Related Issues
