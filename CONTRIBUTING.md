# Contributing to ModelDock

Thanks for taking an interest in ModelDock.

ModelDock is a self-hostable ML model serving platform. Contributions that improve correctness, security, documentation, developer experience, or maintainability are welcome.

## Before You Start

- Check existing issues and pull requests before starting substantial work.
- For larger changes, open an issue first so the approach can be discussed.
- Keep pull requests focused on one change.
- Do not include secrets, credentials, private data, or generated build artifacts.

## Development

Clone the repository and start the local services using the setup documented in README.md.

## Verification

Before opening a pull request, run the relevant backend tests, backend compile check, frontend typecheck, and frontend production build. Also run markdownlint and git diff --check for documentation changes.

## Pull Requests

Please include a short explanation of what changed, why it changed, and how it was verified. Update documentation when behavior or public APIs change.

Pull requests should pass the required CI checks before merging.

## Code Style

Prefer small, readable changes that follow the existing project structure and conventions. Avoid unrelated refactors in feature or bug-fix pull requests.

For security-sensitive changes, explain the security impact without publishing exploit details in the pull request.

## Questions

If you are unsure about an implementation detail, open an issue or discussion before making a large change.
