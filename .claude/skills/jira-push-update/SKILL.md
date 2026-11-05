---
name: jira-push-update
description: After pushing code to GitHub, post a progress comment on the Jira issue tied to the branch (what was done, what changed, what's missing, next step), log work time from commit timestamps, and suggest a status transition. Use this every time Claude runs `git push` or finishes pushing a branch, even if the user doesn't mention Jira, as long as the branch name contains a Jira key like AKOS-123.
---

# Jira update after a push

Every push is a checkpoint. Whoever opens the Jira issue next (a teammate, a client, or future-you) should be able to read the latest comment and know where the work stands without opening the code. This skill turns each push into that update.

Run it right after a successful `git push`. If the push failed, there is nothing to report yet.

## 1. Find the issue

Take the Jira key from the current branch name:

```bash
git rev-parse --abbrev-ref HEAD
```

A key is an uppercase project prefix, a hyphen and a number (`AKOS-123` in `feature/AKOS-123-login`). Match it with `[A-Z][A-Z0-9]+-\d+`. If the branch has more than one, use the first.

If there is no key, or the issue doesn't exist in Jira, stop and ask the user which issue this push belongs to. Don't guess and don't search for a "similar" ticket: a comment on the wrong issue is worse than no comment.

Then load the issue (summary, description, status, existing comments) with the Jira tools. On the Atlassian connector that means getting the `cloudId` from `getAccessibleAtlassianResources`, then `getJiraIssue`. You need the issue for two things: its language and what it asks for, so you can say what's still missing.

## 2. Gather what this push contains

Work out which commits this push sent. The safest range is between the remote tip before the push and the new HEAD. If you don't have the old tip, use the commits on the branch that aren't on the base branch:

```bash
git log --format='%h %ad %s' --date=iso <base>..HEAD
git diff --stat <base>..HEAD
```

`<base>` is usually `main` or `develop`; check which one the branch came from. Read the diff where needed to understand the changes: commit messages alone are often too terse to explain them.

## 3. Write the comment

Write it in the **same language as the issue** (summary and description). A ticket written in Spanish gets a Spanish comment, one in English gets English. If the issue mixes both, follow the description.

Use this structure (translate the headings to the issue's language):

```
**What was done**
1–3 sentences in plain language: the goal of this push and whether it was reached.

**What changed**
- Short description of each meaningful change
- Key files: `path/to/file.ts`, `path/to/other.ts`

**What's missing**
What the issue still needs before it can close, based on its description and acceptance criteria. If nothing is missing, say so.

**Next step**
The single next action in the chain, concrete enough to start on (e.g. "Hook the form to the /auth endpoint and add error states").
```

Guidelines:

- "What changed" is a summary plus the key files, not every file touched. Leave out lockfiles, generated files and formatting-only changes unless they matter.
- "What's missing" should come from comparing the work against the issue, not from inventing new scope. If the issue has no clear criteria, base it on what the commits left unfinished (TODOs, stubs, skipped tests).
- Be honest. If tests weren't run or something is a workaround, say it in "What's missing".

Post the comment directly with `addCommentToJiraIssue` (or the equivalent Jira tool). No need to show a draft first.

## 4. Log work time from the commits

Estimate the time from commit timestamps in this push:

- **Start:** the timestamp of the commit just before this push's first commit (the previous checkpoint). On a branch's first push, use the first commit on the branch.
- **End:** the timestamp of the last commit pushed.
- If there's only one commit and no earlier one to anchor to, there is no span to measure: ask the user for the time.
- Look for gaps over 2 hours between consecutive commits (lunch, overnight, a different day). Those are almost certainly not work time, so subtract them and say so.

Commit timestamps undercount the work done before the first commit and overcount idle time, so treat the number as an estimate. Show it to the user with how you got it, e.g. "First commit 10:05, last 13:40, minus a 1h10 gap → 2h25m. Log this?", and only call `addWorklogToJiraIssue` once they confirm or give a different number. Round to the nearest 5 minutes and use Jira's format (`2h 25m`).

## 5. Suggest a transition

Fetch the possible transitions with `getTransitionsForJiraIssue` and suggest one that fits the state of the work:

- Work finished and pushed for review → "In Review" / "Code Review"
- Still in progress → usually leave it; suggest "In Progress" only if it's still in "To Do"
- Nothing missing and it doesn't need review → "Done"

Propose it and wait for the user's OK before calling `transitionJiraIssue`. Status changes affect other people's boards, so they always need a yes. You can ask about the time log and the transition in the same message.

## 6. Report back

Tell the user in one or two lines: which issue was commented on, the time logged (if any) and the new status (if changed). Don't repeat the comment content; it's already in Jira.

## If the Jira tools aren't available

If no Jira or Atlassian tools are connected, don't stop the push flow. Write the comment as described, give it to the user to paste, and mention that connecting the Atlassian connector would let this happen automatically.
