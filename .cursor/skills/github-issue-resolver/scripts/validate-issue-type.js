#!/usr/bin/env node

/**
 * Validate GitHub issue type and suggest resolution approach
 * Usage: node validate-issue-type.js ISSUE_NUMBER
 */

const { execFileSync } = require('child_process');

// Parse command line arguments
const args = process.argv.slice(2);
if (args.length === 0) {
  console.error('Usage: node validate-issue-type.js ISSUE_NUMBER');
  process.exit(1);
}

const issueNumber = args[0];
if (!/^\d+$/.test(issueNumber)) {
  console.error('Error: ISSUE_NUMBER must be a numeric value.');
  process.exit(1);
}

try {
  // Get issue information using gh CLI
  const issueJson = execFileSync('gh', ['issue', 'view', issueNumber, '--json', 'number,title,body,labels,state,comments'], {
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe']
  });

  const issue = JSON.parse(issueJson);
  
  // Check if issue is open
  if (issue.state !== 'OPEN') {
    console.log(`Issue #${issueNumber} is not open (state: ${issue.state}).`);
    console.log('Only open issues can be worked on.');
    process.exit(1);
  }
  
  // Extract labels
  const labels = issue.labels ? issue.labels.map(label => label.name.toLowerCase()) : [];
  
  // Determine issue type
  let issueType = 'unknown';
  let suggestedApproach = '';
  
  // Check labels for type hints
  if (labels.some(label => label.includes('bug') || label.includes('fix'))) {
    issueType = 'bug';
    suggestedApproach = 'Fix the bug by modifying the relevant code. Follow the project\'s coding standards.';
  } else if (labels.some(label => label.includes('enhancement') || label.includes('feature') || label.includes('feat'))) {
    issueType = 'feature';
    suggestedApproach = 'Implement the new feature. Consider backward compatibility and add tests.';
  } else if (labels.some(label => label.includes('docs') || label.includes('documentation'))) {
    issueType = 'documentation';
    suggestedApproach = 'Update documentation files. Ensure all relevant docs are updated.';
  } else if (labels.some(label => label.includes('refactor') || label.includes('cleanup') || label.includes('tech-debt'))) {
    issueType = 'refactor';
    suggestedApproach = 'Refactor code for better maintainability. Ensure all tests still pass.';
  } else if (labels.some(label => label.includes('test') || label.includes('testing'))) {
    issueType = 'test';
    suggestedApproach = 'Add or update tests. Ensure coverage is maintained or improved.';
  } else {
    // Analyze title and body for clues
    const titleAndBody = (issue.title + ' ' + (issue.body || '')).toLowerCase();
    
    if (titleAndBody.includes('bug') || titleAndBody.includes('fix') || titleAndBody.includes('error') || titleAndBody.includes('wrong')) {
      issueType = 'bug';
      suggestedApproach = 'Fix the bug by modifying the relevant code. Follow the project\'s coding standards.';
    } else if (titleAndBody.includes('feature') || titleAndBody.includes('add') || titleAndBody.includes('implement') || titleAndBody.includes('support')) {
      issueType = 'feature';
      suggestedApproach = 'Implement the new feature. Consider backward compatibility and add tests.';
    } else if (titleAndBody.includes('doc') || titleAndBody.includes('readme') || titleAndBody.includes('documentation')) {
      issueType = 'documentation';
      suggestedApproach = 'Update documentation files. Ensure all relevant docs are updated.';
    } else {
      issueType = 'general';
      suggestedApproach = 'Analyze the issue description and implement the required changes.';
    }
  }
  
  // Output validation results
  console.log(`Issue #${issueNumber} Validation Results:`);
  console.log(`Type: ${issueType}`);
  console.log(`Title: ${issue.title}`);
  console.log(`Labels: ${labels.length > 0 ? labels.join(', ') : 'none'}`);
  console.log(`\nSuggested approach:`);
  console.log(suggestedApproach);
  
  // Check if issue has enough information
  const hasDescription = issue.body && issue.body.trim().length > 20;
  const hasComments = issue.comments && issue.comments.totalCount > 0;
  
  console.log(`\nInformation check:`);
  console.log(`- Has description: ${hasDescription ? 'Yes' : 'No - consider asking for more details'}`);
  console.log(`- Has comments: ${hasComments ? 'Yes (' + issue.comments.totalCount + ' comments)' : 'No'}`);
  
  if (!hasDescription && !hasComments) {
    console.log(`\nWarning: Issue #${issueNumber} has very little information.`);
    console.log('Consider asking the user for clarification before proceeding.');
  }
  
  // Exit with appropriate code
  process.exit(0);
  
} catch (error) {
  console.error(`Error validating issue #${issueNumber}:`, error.message);
  process.exit(1);
}
