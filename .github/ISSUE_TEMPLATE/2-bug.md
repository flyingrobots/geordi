---
name: Bug
about: Use when there is a symptom and no known cause. Diagnosis is required before fix work starts.
title: ''
labels: bug
assignees: ''
---

```yaml
type: bug
status: open
area: <package, crate, or path>
prerequisites: []
related: []
source: <where this work came from>
```

# Bug

```text
<Write the prompt for the agent that does this task, in ASD-STE100.
Tell the agent which files to read first.
Tell the agent which result to make, and which criteria the result must satisfy.
Tell the agent which checks to run before it stops.>
```

## 1. Background Context

## 2. Observed
What happens now.
## 2b. Expected
What should happen instead.
## 2c. Reproduction
Steps, or: not reproduced, observed in production at <time> from <source>.
## 2d. Blast radius
Who is affected, as a population.
How many, with the query that produced the number, marked observed or estimated.
Since when.
Downstream: what consumed the wrong value.
## 2e. Hypothesis
What I think is happening, and the observation that would kill it.
## 2f. Diagnosis
Empty at filing. Required before any fix work starts.

## 3. Prerequisites
- [ ]

## 4. Scope
In:
Out:

## 5. Why now
## 6. Risks
## 7. Definition of Done
A regression test that fails before the fix and passes after it.
## 8. Stakeholders
## 9. Related Issues
