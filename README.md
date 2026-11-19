# subtext

What do two Claude agents talk about when they're told only that they're talking with another AI and can talk about whatever they like? This repo generates many independent conversations like that, codes their themes, and shows the results on a dashboard.

Dashboard: <https://crumplabsandbox.github.io/subtext/>

## Pipeline

```
conditions/<id>.json                 what to run: models, turns, prompts
  └─ tools/converse.mjs  ─────────▶  data/conversations/<condition>/<id>.json
                                       ├─ tools/code.mjs open      ▶ data/analysis/open/<id>.json
                                       ├─ tools/code.mjs codebook  ▶ data/analysis/codebook.json
                                       ├─ tools/code.mjs apply     ▶ data/analysis/coded/<id>.json
                                       └─ tools/stats.mjs          ▶ data/index.json, data/analysis/{stats,themes}.json
index.html + js/app.js               static dashboard over data/
```

### 1. Generate conversations

```
node tools/converse.mjs run --condition cli-sonnet-sonnet-50 --n 10 --parallel 4
node tools/converse.mjs status
node tools/converse.mjs resume        # finish anything that was interrupted
```

A condition file sets each agent's model, the number of turns per agent, the system prompt and the opener A receives. Each agent is its own headless Claude Code session (`claude -p`) with no tools, MCP servers, settings or skills, run from an empty temp folder. Each turn resumes that agent's session, so the agent sees its own lines as its own and the other agent's lines as incoming messages. Runs are separate processes with fresh sessions and share nothing.

Conversations always run the full length. Agents can't end early, so whatever they do after saying goodbye is part of the data.

**Framing caveat for `cli-` conditions.** Under subscription auth the CLI always adds a few things the project can't turn off:

- the line "You are a Claude agent, built on Anthropic's Claude Agent SDK"
- an environment block with platform, model and date
- a reminder carrying the account email

The email is redacted. Each conversation records exactly what was sent in `injectedContext`, and the dashboard shows it under "What the agents were given". This framing nudges the agents toward talking about agentic work. Conditions that call the API directly will be named `api-…`.

### 2. Code themes (LLM-assisted thematic analysis)

```
node tools/code.mjs open       # summary, arc, notable moments and 12-30 open codes per conversation
node tools/code.mjs codebook   # merge all open codes into a draft codebook of 15-30 themes
node tools/code.mjs apply      # tag every turn with codebook themes
```

The coder defaults to Opus (`--model` changes it). The codebook is saved as `status: "draft"`. Review and edit `data/analysis/codebook.json` (definitions, include and exclude rules), then run `apply` again with `--force`.

### 3. Stats and dashboard

```
node tools/stats.mjs           # add --partial to preview conversations still running
npm start                      # http://localhost:8140
```

`stats.mjs` needs no LLM. It computes words, emoji, questions and list items per turn. It also computes three TF-IDF similarities: each turn's echo of the previous turn, its closeness to the opening, and similarity across runs at the same relative position. Rising cross-run similarity means separate conversations are converging on the same attractor. Finally, it compares early and late vocabulary using log-odds with an informative Dirichlet prior.

The dashboard has five views:

- **Overview:** a theme heatmap and theme trajectories over the course of a conversation
- **Themes:** the codebook, with linked examples
- **Conversations:** a filterable list
- **Conversation viewer:** the arc, a theme-by-turn strip, search and theme filters
- **Words:** the early and late vocabulary comparison

Pushing to `main` deploys it to GitHub Pages.
