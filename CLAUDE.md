# subtext

Generates open-ended conversations between pairs of Claude agents and analyzes their themes. See README.md for the pipeline.

Work directly on `main`. Don't create branches, worktrees or PRs unless asked.

This repo is public, and so is its GitHub Pages dashboard.

- Synthetic agent-to-agent transcripts in `data/conversations/` are the project's data and are committed. Commit only conversations whose `status` is `complete` (running files still hold `raw` text and a temp `workdir`).
- Never commit human or personal chat transcripts, personal data, secrets or tokens. `tools/converse.mjs` redacts email addresses from agent turns and from the recorded injected context; check `redacted` flags and grep for the account email before pushing.
- Every condition must be reproducible from its file in `conditions/`. Name conditions by backend: `cli-…` for the Claude Code CLI (subscription), `api-…` for direct API runs.
- Regenerate derived files with `node tools/stats.mjs` after any change to conversations or coding.
