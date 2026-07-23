---
applyTo: ".github/workflows/**/*.yml,.github/workflows/**/*.yaml"
---

# GitHub Actions Rules

- Declare explicit least-privilege `permissions` on every workflow, or per job. Default deny; grant only what the job uses (`deploy-azure.yml` needs `packages: write` for GHCR; nothing else does).
- Pin every third-party action to a full-length commit SHA with a version comment, e.g. `uses: actions/checkout@8f4b7f84864484a7bf31766abe9204da3cbe65b3 # v4.1.1`.
- Never use `pull_request_target` unless the task explicitly requires it and a human reviewer is named; never check out or execute untrusted PR code in a privileged context.
- Quote and validate all inputs interpolated into `run:` steps. Prefer environment variables over inline `${{ }}` interpolation in shell.
- Secrets (`AZURE_CREDENTIALS`, `ANTHROPIC_API_KEY`, `AUDIT_SALT`, `GHCR_PULL_TOKEN`): reference only via `secrets.*` in protected environments with required reviewers. Never echo secrets; never write them to artifacts or logs.
- Prefer OIDC federation over long-lived cloud credentials; the Azure service principal in `AZURE_CREDENTIALS` is the current exception — do not widen its scope beyond the resource group.
- Set `timeout-minutes` on every job. Add `concurrency` groups to cancel superseded runs on PR branches.
- `deploy-azure.yml` deploys production — it requires the `production` environment protection rules and a rollback note in the PR for any change.
- New or changed workflows must be listed in the PR description with a one-line purpose statement.
