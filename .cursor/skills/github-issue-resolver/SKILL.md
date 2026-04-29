---
name: github-issue-resolver
description: Resolve GitHub issues by automating issue information retrieval, PR creation, and workflow integration. Use when a user specifies a GitHub issue number and wants to work on resolving it, or mentions working on an issue, fixing an issue, or addressing a GitHub issue.
---

# GitHub Issue Resolver

Automates the workflow of resolving GitHub issues for the youtublur project. Handles issue information retrieval, PR creation, and integration with the project's development workflow.

## Trigger Conditions

Use this skill when the user:
- Specifies a GitHub issue number (e.g., "issue 123", "fix #456")
- Mentions working on an issue
- Asks to resolve, fix, or address a GitHub issue
- Provides a GitHub issue URL

## Workflow

### Step 1: Retrieve Issue Information

Get the issue details using `gh` CLI:

```bash
# Get issue details in JSON format
gh issue view ISSUE_NUMBER --json number,title,body,labels,state,comments,author

# Or get a human-readable view
gh issue view ISSUE_NUMBER
```

Parse the issue to understand:
- Issue title and description
- Labels (bug, enhancement, etc.)
- Comments for additional context
- Issue state (open/closed)

### Step 2: Validate Issue

Check if the issue can be worked on:
- Issue must be in "open" state
- Not already assigned to a PR
- Clear description of what needs to be done

If the issue is unclear, ask the user for clarification before proceeding.

### Step 3: Create Worktree

Follow the project's git worktree rule (master branch work is prohibited):

```bash
# Create a new worktree with branch named after the issue
cd /home/kira/apps/youtublur
git worktree add -b fix/issue-ISSUE_NUMBER /home/kira/apps/youtublur-issue-ISSUE_NUMBER master
```

If the branch already exists remotely:
```bash
git fetch origin fix/issue-ISSUE_NUMBER
git worktree add /home/kira/apps/youtublur-issue-ISSUE_NUMBER fix/issue-ISSUE_NUMBER
```

### Step 4: Install Dependencies

After creating the worktree, install dependencies:

```bash
cd /home/kira/apps/youtublur-issue-ISSUE_NUMBER
pnpm install
```

### Step 5: Implement the Fix

Based on the issue description:
1. Read relevant files to understand the current implementation
2. Make necessary code changes
3. Follow the project's coding standards

Refer to these priority files when making changes:
1. `manifest.json` - Check permissions, match patterns, version
2. `.cursor/rules/browser-extension.mdc` - MV3 constraints, Firefox AMO requirements
3. `.cursor/rules/locales.mdc` - i18n key addition rules
4. `content.js` / `popup.js` - Main business logic
5. `docs/release.md` - Release procedures

### Step 6: Run Tests and Lint

Before committing, run tests and lint:

```bash
# Run unit tests
pnpm test

# Run lint
pnpm exec vp lint
```

Fix any failures before proceeding.

### Step 7: Commit Changes

Follow the project's commit convention:

```bash
git add -A
git commit -m "fix: resolve issue ISSUE_NUMBER - BRIEF_DESCRIPTION"
```

Use appropriate commit type:
- `fix:` for bug fixes
- `feat:` for new features
- `docs:` for documentation
- `refactor:` for code refactoring

### Step 8: Push and Create PR

Push the branch and create a PR:

```bash
# Push to remote
git push -u origin fix/issue-ISSUE_NUMBER

# Create PR with issue reference
gh pr create --title "fix: resolve issue ISSUE_NUMBER - TITLE" \
  --body "$(cat <<'EOF'
## Summary
- Fixes #ISSUE_NUMBER
- BRIEF_DESCRIPTION_OF_CHANGES

## Test plan
- [ ] `pnpm test` passes
- [ ] `pnpm exec vp lint` passes
- [ ] Manual testing completed

Closes #ISSUE_NUMBER
EOF
)"
```

### Step 9: Cleanup

After PR is created (not merged), you can remove the worktree if no further changes are needed:

```bash
cd /home/kira/apps/youtublur
git worktree remove /home/kira/apps/youtublur-issue-ISSUE_NUMBER
```

## Important Rules

- **Never work directly on master branch** - Always use git worktree
- **Use `gh` CLI only** - No REST API, PAT, or browser for GitHub operations
- **Run `pnpm test` after code changes** - All tests must pass
- **Run `pnpm exec vp lint` before committing** - Fix all lint errors
- **Follow i18n rules** - Add keys to all locales if UI strings change
- **Don't manually change version** - Use `pnpm run release` flow

## Examples

### Example 1: Fix a bug issue

User: "Issue 42を修正して"

Agent actions:
1. `gh issue view 42` - Get issue details
2. `git worktree add -b fix/issue-42 ../youtublur-issue-42 master` - Create worktree
3. `cd ../youtublur-issue-42 && pnpm install` - Install dependencies
4. Implement the fix based on issue description
5. `pnpm test && pnpm exec vp lint` - Run tests and lint
6. `git commit -m "fix: resolve issue 42 - BRIEF_DESCRIPTION"`
7. `git push -u origin fix/issue-42`
8. `gh pr create --title "fix: resolve issue 42" --body "..."`

### Example 2: Work on an existing branch

User: "Issue 123の作業を続けて"

Agent actions:
1. `gh issue view 123` - Check issue status
2. `git fetch origin fix/issue-123`
3. `git worktree add ../youtublur-issue-123 fix/issue-123`
4. `cd ../youtublur-issue-123 && git merge origin/fix/issue-123`
5. Continue with implementation, tests, commit, push

## Scripts

Utility scripts are available in the `scripts/` directory:

- `get-issue-info.js` - Extract structured information from an issue
- `create-pr-from-issue.js` - Generate PR title and body from issue data
- `validate-issue-type.js` - Check if the issue type is supported

See the respective script files for usage instructions.
