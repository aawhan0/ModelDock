# Security Policy

## Supported Versions

Security fixes are applied to the current version of ModelDock on the main branch. Older commits, forks, and unreleased development versions may not receive security fixes.

## Reporting a Vulnerability

Please do not publicly disclose a suspected vulnerability in an issue or pull request.

Use GitHub's private vulnerability reporting or security advisory features for this repository when available. If those features are unavailable, contact the maintainer privately through the GitHub profile associated with this repository.

When reporting a vulnerability, include:

- A clear description of the issue.
- The affected component or endpoint.
- Steps to reproduce the issue.
- The potential impact.
- Any suggested mitigation, if known.

Please avoid including real secrets, credentials, personal data, or destructive proof-of-concept payloads.

## Scope

Security reports are especially relevant to artifact upload and storage, restricted Python runtime execution, authentication and API key handling, deployment and inference endpoints, database access, and container or host interactions.

ModelDock's restricted Python execution layer is not a complete sandbox for hostile arbitrary Python. Do not treat it as a security boundary for untrusted code without additional isolation.
