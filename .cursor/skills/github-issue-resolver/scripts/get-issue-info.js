#!/usr/bin/env node

/**
 * Get GitHub issue information and output in structured format
 * Usage: node get-issue-info.js ISSUE_NUMBER [--format=json|text] [--field=title|body|labels|all]
 */

const { execFileSync } = require('child_process');

// Parse command line arguments
const args = process.argv.slice(2);
if (args.length === 0) {
  console.error('Usage: node get-issue-info.js ISSUE_NUMBER [--format=json|text] [--field=title|body|labels|all]');
  process.exit(1);
}

const issueNumber = args[0];
if (!/^\d+$/.test(issueNumber)) {
  console.error('Error: ISSUE_NUMBER must be a numeric value.');
  process.exit(1);
}
let format = 'text';
let field = 'all';

for (const arg of args.slice(1)) {
  if (arg.startsWith('--format=')) {
    format = arg.split('=')[1];
  } else if (arg.startsWith('--field=')) {
    field = arg.split('=')[1];
  }
}

try {
  // Get issue information using gh CLI
  const issueJson = execFileSync('gh', ['issue', 'view', issueNumber, '--json', 'number,title,body,labels,state,author,comments,createdAt,updatedAt'], {
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe']
  });

  const issue = JSON.parse(issueJson);

  // Extract labels
  const labels = issue.labels ? issue.labels.map(label => label.name) : [];

  // Prepare output based on field
  if (field === 'title') {
    console.log(issue.title);
  } else if (field === 'body') {
    console.log(issue.body || '');
  } else if (field === 'labels') {
    console.log(labels.join(', '));
  } else if (field === 'all') {
    if (format === 'json') {
      console.log(JSON.stringify({
        number: issue.number,
        title: issue.title,
        body: issue.body || '',
        labels: labels,
        state: issue.state,
        author: issue.author ? issue.author.login : 'unknown',
        commentsCount: issue.comments ? issue.comments.totalCount || 0 : 0,
        createdAt: issue.createdAt,
        updatedAt: issue.updatedAt
      }, null, 2));
    } else {
      console.log(`Issue #${issue.number}: ${issue.title}`);
      console.log(`State: ${issue.state}`);
      console.log(`Author: ${issue.author ? issue.author.login : 'unknown'}`);
      console.log(`Labels: ${labels.join(', ') || 'none'}`);
      console.log(`Created: ${issue.createdAt}`);
      console.log(`Updated: ${issue.updatedAt}`);
      console.log('\nDescription:');
      console.log(issue.body || 'No description provided.');
    }
  }
} catch (error) {
  console.error(`Error fetching issue #${issueNumber}:`, error.message);
  process.exit(1);
}
