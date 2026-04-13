# Contributing to TikTok-Quantum

## Push flow for ChatGPT Codex and Claude

Use dedicated branch prefixes so AI-generated changes are easy to track:

- ChatGPT: `chatgpt/<short-task-name>`
- Codex: `codex/<short-task-name>`
- Claude: `claude/<short-task-name>`

## Recommended workflow

1. Create a new branch with the correct prefix.
2. Add/update files.
3. Commit with a clear message.
4. Push branch to `origin`.
5. Open a pull request for review and merge.

## Why this setup

- Keeps AI-generated changes organized by source.
- Triggers the AI intake GitHub Action on push.
- Makes review and auditing straightforward.
