# Project Instructions

## Deploy Configuration (configured by /setup-deploy)
- Platform: Custom Docker deployment over SSH with GitHub Actions
- Production URL: https://cqaiclub.asia
- Deploy workflow: `.github/workflows/deploy.yml`
- Deploy status command: `gh run list --workflow deploy.yml --branch main`
- Merge method: direct push or merge to `main`
- Project type: web app and API
- Post-deploy health check: https://cqaiclub.asia/health

### Custom deploy hooks
- Pre-merge: `npm test`
- Deploy trigger: automatically after the `CI` workflow succeeds on `main`, or manual workflow dispatch
- Deploy status: GitHub Actions workflow status
- Health check: `https://cqaiclub.asia/health`
