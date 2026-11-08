---
name: Milestone
about: Container card. It groups other issues and is never a pull request.
title: 'Milestone: '
labels: milestone
assignees: ''
---

```yaml
.dag: issue-dag/1
.id: TBD
.kind: container
.children: []
area: <what the milestone covers>
source: <where this work came from>
```
<!-- After you create the issue, set .id to #<its number>. List member issues in .children in work order, as #N or owner/repo#N. A container never blocks and is never blocked. -->

# Milestone

```text
This is a container card. Do not open a pull request for it.
Work its children in dependency order. Start with a child that has no open blockers.
Close this card when every child is closed and the exit criteria are true.
```

## 1. Background Context

## 2. Goal
## 2b. Exit criteria
## 2c. Work order

## 3. Prerequisites
- [ ]

## 4. Scope
In:
Out:

## 5. Why now
## 6. Risks
## 7. Definition of Done
Every child is closed and the exit criteria are true.
## 8. Stakeholders
## 9. Related Issues
