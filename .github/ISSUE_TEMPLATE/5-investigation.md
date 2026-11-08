---
name: Investigation
about: Use when a system matters but we do not yet know what questions to ask about it.
title: ''
labels: investigation
assignees: ''
---

```yaml
.dag: issue-dag/2
.id: TBD
.kind: task
.type: investigation
.blocked_by: []
area: <package, crate, or path>
source: <where this work came from>
```
<!-- After you create the issue, set .id to flyingrobots/geordi#<its number>. List blockers in .blocked_by as owner/repo#N. A bare #N is not allowed. Keys that start with . belong to issue-dag/2 (see AGENTS.md, Work Tracking). -->

# Investigation

```text
<Write the prompt for the agent that does this task, in ASD-STE100.
Tell the agent which files to read first.
Tell the agent which result to make, and which criteria the result must satisfy.
Tell the agent which checks to run before it stops.>
```

## 1. Background Context
The system, and why we are taking it on.

## 2. What we do not understand
The area, not a question. If you have one question, file Research instead.
## 2b. Where to look
Surfaces, repositories, dashboards, people.
## 2c. Time box
## 2d. Findings
Empty at filing. One line per finding, each with the card it became.

## 3. Prerequisites
- [ ]

## 4. Scope
In:
Out:

## 5. Why now
## 6. Risks
## 7. Definition of Done
The map exists and every finding has a typed card.
## 8. Stakeholders
## 9. Related Issues
