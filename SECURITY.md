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

### Serialized model artifacts

Scikit-learn artifacts are loaded with joblib.load(). Joblib uses Python serialization and must therefore be treated as trusted code execution input. Only load model artifacts from sources you trust.

Do not expose artifact upload to untrusted users or networks unless you have added an appropriate isolation boundary around model loading and inference.

### API keys and the web UI

API authentication is enabled by default. The admin API key is a server-side credential and must never be exposed to the browser or committed to source control.

The current web UI can use a browser-visible API key through a NEXT_PUBLIC_* environment variable. Such a key is exposed to browser JavaScript and must not be an admin key. Use a dedicated key for the UI and assume that it can be read by anyone who can access the browser application.

A stronger multi-user deployment should place ModelDock behind an authenticated reverse proxy or add an identity-aware authentication layer. Scoped, server-mediated UI authentication is preferred over distributing privileged API keys to browsers.
