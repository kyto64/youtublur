#!/usr/bin/env node

/**
 * Create a GitHub PR from an issue
 * Usage: node create-pr-from-issue.js ISSUE_NUMBER [--create] [--commit-type=fix|feat|docs|refactor]
 */

const { execSync } = require('child_process');

// Parse command line arguments
const args = process.argv.slice(2);
if (args.length === 0) {
  console.error('Usage: node create-pr-from-issue.js ISSUE_NUMBER [--create] [--commit-type=fix|feat|docs|refactor]');
  process.exit(1);
}

const issueNumber = args[0];
let shouldCreate = false;
let commitType = 'fix'; // default

for (const arg of args.slice(1)) {
  if (arg === '--create') {
    shouldCreate = true;
  } else if (arg.startsWith('--commit-type=')) {
    commitType = arg.split('=')[1];
  }
}

try {
  // Get issue information
  const issueJson = execSync(`gh issue view ${issueNumber} --json number,title,body,labels`, {
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe']
  });

  const issue = JSON.parse(issueJson);
  
  // Generate branch name
  const branchName = `fix/issue-${issueNumber}`;
  
  // Generate PR title
  const prTitle = `${commitType}: resolve issue ${issueNumber} - ${issue.title}`;
  
  // Generate PR body
  const prBody = `## Summary
- Fixes #${issueNumber}
- ${issue.title}

## Description
${issue.body ? issue.body.substring(0, 500) : 'No description provided.'}

## Test plan
- [ ] \`pnpm test\` passes
- [ ] \`pnpm exec vp lint\` passes
- [ ] Manual testing completed

Closes #${issueNumber}`;

  if (shouldCreate) {
    // Create the PR using gh CLI
    const createCommand = `gh pr create --title "${prTitle}" --body "${prBody.replace(/"/g, '\\"')}" --head "${branchName}"`;
    
    try {
      const prUrl = execSync(createCommand, {
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe']
      });
      console.log('PR created successfully:');
      console.log(prUrl);
    } catch (createError) {
      console.error('Error creating PR:', createError.message);
      process.exit(1);
    }
  } else {
    // Just output what would be created
    console.log('Branch name:', branchName);
    console.log('\nPR Title:');
    console.log(prTitle);
    console.log('\nPR Body:');
    console.log(prBody);
    console.log('\nTo create this PR, run with --create flag:');
    console.log(`node create-pr-from-issue.js ${issueNumber} --create --commit-type=${commitType}`);
  }
  
} catch (error) {
  console.error(`Error processing issue #${issueNumber}:`, error.message);
  process.exit(1);
}
