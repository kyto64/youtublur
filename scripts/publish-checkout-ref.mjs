/**
 * Checkout ref chosen by publish.yml for a workflow_dispatch run.
 *
 * The workflow expression treats inputs.build_from_tag as truthy. The daily
 * release passes build_from_tag=true. The GitHub UI sends a boolean; `gh workflow
 * run -f build_from_tag=true` sends the string "true". Both are truthy, so the
 * extension is built from refs/tags/<tag> rather than master HEAD.
 *
 * Keep PUBLISH_CHECKOUT_REF_EXPR identical to the `ref:` expression in publish.yml.
 */

export const PUBLISH_CHECKOUT_REF_EXPR =
  "github.event_name == 'workflow_dispatch' && (inputs.build_from_tag && format('refs/tags/{0}', inputs.tag) || 'refs/heads/master') || github.ref";

function isTruthy(value) {
  return value !== false && value !== 0 && value !== '' && value != null && !Number.isNaN(value);
}

export function publishCheckoutRef({ eventName, buildFromTag, tag, githubRef }) {
  const dispatchedRef =
    eventName === 'workflow_dispatch' &&
    (isTruthy(buildFromTag) && `refs/tags/${tag}` || 'refs/heads/master');
  return dispatchedRef || githubRef;
}
