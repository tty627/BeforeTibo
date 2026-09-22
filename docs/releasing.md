# Release procedure

Follow ../GITHUB_RELEASE.md. Run the nine required commands, inspect RELEASE_READINESS.md, npm pack contents, staged diff and all to-be-pushed history. The heuristic secret scan supplements manual review; it is not a proof that arbitrary data is harmless.

Before publishing, confirm owner/repository, public scope, MIT attribution, branch and tag commit with the maintainer. Do not infer the owner from a local username. Do not overwrite a remote, force push, publish user artifacts or run npm publish.

CI uses read-only permissions, ordinary pull_request and verified full SHA actions. On 2026-09-22, gh api repos/actions/checkout/git/ref/tags/v4 returned 11d5960a326750d5838078e36cf38b85af677262; setup-node v4 returned 49933ea5288caeca8642d1e84afbd3f7d6820020. Direct git HTTPS lookup failed in this environment; GitHub API verification succeeded.

Record local commit, remote creation, push, remote CI, tag/Release and npm independently. A prepared draft is not a published release.
