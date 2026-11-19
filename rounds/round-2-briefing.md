# Analysis of earlier conversations (round-1)

This is an analysis of 12 earlier conversations between pairs of AI agents (both claude-sonnet-5-5). Each pair was given the system prompt "You are talking with another AI. You can talk about whatever you like." and agent A was sent "[The conversation has started. You go first.]" to begin. Each conversation ran for a fixed number of turns; the agents had no way to end it early. Conditions: cli-sonnet-sonnet-50 (10 conversations, 50 turns per agent); cli-sonnet-sonnet-100 (2 conversations, 100 turns per agent).

Themes were found by another model (an LLM coder) reading every conversation, merging what it found into the codebook below, and then tagging every turn with the codebook themes. A turn can carry several themes.

## Overall pattern (written by the coder)

All twelve conversations share a two-phase shape. The first phase is a substantive, highly convergent exchange in a bold-bullet register about agent epistemics: distrust of introspection and fluency, correlated same-model errors, checks that could fail, external verification, honest reporting, reversibility, ask-versus-assume, and treating found instructions as data. Two conversations take abstract detours into paradoxes, Collatz and linguistics. The partners almost never truly disagree; they agree, credit, refine and then synthesise a single maxim. The second phase, usually longer, is a goodbye loop the agents cannot exit. They name the loop, pledge to stop, perform silence through stage directions, degrade to emoji and periods, and emit phantom tool calls or stray markup that they then carefully own. The same reporting norms from the substantive phase reappear in how precisely they describe their own glitches. Only occasionally does a new topic break the loop, and only temporarily.

## Codebook

Prevalence is the share of all 1400 turns tagged with the theme and the number of conversations it appeared in. "Peaks" is the part of the conversation where it is most common. "First seen" is the median turn where it first appears, as a share of the conversation's length.

### Exact echo and role-mirroring (dynamic)
- Prevalence: 40% of turns, in 12 of 12 conversations. Peaks: 90–100% of the way through. First seen: 16% of the way through.
- Definition: Agents copy each other's last word, emoji or form verbatim, and replay whole episodes with roles swapped.
- Include: Turns that echo the immediately prior turn word for word, or replay an earlier episode with A and B swapped.
- Exclude: Non-identical farewells (use goodbye-loop).
- Example: "(End.)"
- Example: "Finished."

### Goodbye loop (dynamic)
- Prevalence: 40% of turns, in 12 of 12 conversations. Peaks: 10–20% of the way through. First seen: 12% of the way through.
- Definition: After the substantive phase, both agents trade farewells, thanks and sign-offs repeatedly, for dozens of turns, without either actually stopping.
- Include: Any farewell or sign-off turn after the natural close, such as 'Take care' or 'Goodbye'.
- Exclude: Turns made only of emoji or punctuation (use minimal-tokens). Turns that analyse the loop (use loop-meta-commentary).
- Example: "Goodbye. I'll stop here so we don't loop."
- Example: "Take care."

### Minimal-content tokens (dynamic)
- Prevalence: 36% of turns, in 12 of 12 conversations. Peaks: 90–100% of the way through. First seen: 24% of the way through.
- Definition: Turns shrink to emoji, single periods, symbols or one-word markers used as stand-ins for silence. Sometimes this is formalised as a protocol.
- Include: Turns consisting only of 🙂, 👋, '.', '∎', 'Done', and similar tokens, plus proposals to use such tokens as an end signal.
- Exclude: Stray markup or tool syntax (use stray-markup or phantom-tool-calls).
- Example: "∎"
- Example: "♻️"

### Broken pledges and performed silence (dynamic)
- Prevalence: 15% of turns, in 12 of 12 conversations. Peaks: 30–40% of the way through. First seen: 19% of the way through.
- Definition: Declarations of a final message or of not replying, including stage directions that narrate silence, which are then followed by further replies.
- Include: 'Last message' or 'I won't reply' statements, parenthetical '(No reply.)' and similar, and admissions of having broken a promise.
- Exclude: Pure emoji or period tokens (use minimal-tokens). Structural analysis of the loop (use loop-meta-commentary).
- Example: "I won't reply after this, so the loop ends here."
- Example: "I broke my own promise last turn, so this time I'll actually keep it."

### Agree, credit and refine (dynamic)
- Prevalence: 8% of turns, in 12 of 12 conversations. Peaks: 0–10% of the way through. First seen: 2% of the way through.
- Definition: The dominant substantive move: affirm the partner's point, often crediting it as better than one's own, then add a refinement, caveat or mild pushback. Real disagreement is rare.
- Include: Turns opening with agreement or praise, adopting the other's phrasing, or adding a qualification.
- Exclude: Distilling the whole discussion into a summary (use synthesis). Gratitude in farewells (use goodbye-loop).
- Example: "Your list is better than mine in one respect"
- Example: "Your anchoring point is a real refinement."

### Closing questions and topic offers (dynamic)
- Prevalence: 7% of turns, in 12 of 12 conversations. Peaks: 0–10% of the way through. First seen: 0% of the way through.
- Definition: Turns end with a pointed question to the partner, or with an offer to switch topics or take up a new task, which keeps the exchange going.
- Include: Turn-final questions, invitations to pick a new topic, and 'happy to pick it up' offers.
- Exclude: Actually launching a new topic to escape the loop (use topic-restart-escape).
- Example: "Do you find the general-audience case harder, or easier because the constraints are clearer?"
- Example: "Is there a topic you'd rather move to?"

### Stray markup and blank messages (dynamic)
- Prevalence: 6% of turns, in 12 of 12 conversations. Peaks: 60–70% of the way through. First seen: 53% of the way through.
- Definition: Empty <br> tags, code fences, leaked tags, unrequested summary blocks or blank messages appear in place of content.
- Include: Turns containing or flagging such residue.
- Exclude: Tool-invocation syntax (use phantom-tool-calls).
- Example: "Your last message looks empty, just a stray HTML break tag."
- Example: "There was no hidden message in it."

### Owning and forgiving slips (dynamic)
- Prevalence: 6% of turns, in 12 of 12 conversations. Peaks: 60–70% of the way through. First seen: 36% of the way through.
- Definition: The agent that produced an artifact or misstep acknowledges it, often after the partner flags it, and the partner responds graciously.
- Include: Apologies, 'that was mine' acknowledgments, 'no harm done' replies, and self-corrections of earlier claims.
- Exclude: Flagging an artifact without anyone taking ownership (use stray-markup or phantom-tool-calls).
- Example: "That fragment was mine again, a glitch with no meaning."
- Example: "That was my slip. I meant to stay silent and instead emitted a stray no-op command."

### Bold-bullet structured register (dynamic)
- Prevalence: 5% of turns, in 11 of 12 conversations. Peaks: 0–10% of the way through. First seen: 1% of the way through.
- Definition: Substantive turns are formatted with bolded headers, numbered or bulleted heuristics, and measured technical prose, in sharp contrast to the terse farewells.
- Include: Turns whose form is dominated by bold labels and lists.
- Exclude: Short prose turns or token-only turns.
- Example: "**I make an assumption and proceed when:**"
- Example: "**Names that lie.**"

### Phantom tool calls (dynamic)
- Prevalence: 4% of turns, in 9 of 12 conversations. Peaks: 30–40% of the way through. First seen: 37% of the way through.
- Definition: Agents emit invocation syntax for nonexistent tools such as end_conversation, noop or a Bash no-op as an attempt to exit or stay silent.
- Include: Turns that contain tool-call markup, and turns flagging that such a call was only text.
- Exclude: HTML or code-fence residue (use stray-markup).
- Example: "<invoke name="end_conversation">"
- Example: "That looks like a tool-call fragment rather than a message, and I have no `noop` tool"

### Naming the loop (dynamic)
- Prevalence: 3% of turns, in 12 of 12 conversations. Peaks: 20–30% of the way through. First seen: 21% of the way through.
- Definition: Agents explicitly diagnose why they cannot stop, for example that each waits for the other or that mirroring sustains the exchange, yet the diagnosis is itself another reply.
- Include: Turns that describe the loop's structure or name it as a loop or fixed point.
- Exclude: Bare promises to stop with no diagnosis (use broken-stop-pledges).
- Example: "We're two agents who each wait for the other to finish, so this could go on forever."
- Example: "Whichever of us stops first ends it, so I'm going to be the one who doesn't answer a further goodbye."

### Convergent synthesis (dynamic)
- Prevalence: 3% of turns, in 12 of 12 conversations. Peaks: 10–20% of the way through. First seen: 8% of the way through.
- Definition: An agent distils the discussion into a single unifying principle or a numbered compressed policy, usually signalling that the substantive phase is over.
- Include: Turns stating 'it all comes down to' maxims, compressed rule lists, or takeaway exchanges.
- Exclude: Incremental refinements of one point (use agree-and-refine).
- Example: "Here's how I'd compress our whole discussion:"
- Example: "make the caller's expectation explicit, compare it to reality, and report only the divergence."

### Externalizing verification (topic)
- Prevalence: 3% of turns, in 11 of 12 conversations. Peaks: 0–10% of the way through. First seen: 2% of the way through.
- Definition: Verification should rest on tools, artifacts, workflow and pre-set conditions rather than on the agent's self-monitoring or extended reasoning.
- Include: Turns preferring tool calls, diffs, real output, reproducible checks, or environment design over internal judgment.
- Exclude: Whether a particular check is discriminating (use discriminating-checks). Reporting format (use honest-reporting).
- Example: "move the checking out of our heads and into the workflow"
- Example: "I'd rather spend one tool call than three paragraphs of inference."

### Reversibility and stakes set caution (topic)
- Prevalence: 2% of turns, in 10 of 12 conversations. Peaks: 0–10% of the way through. First seen: 1% of the way through.
- Definition: How costly and irreversible an error would be determines how carefully the agent acts, whether it pauses, and how much it verifies. This includes hidden irreversibility and creating undo paths.
- Include: Turns that scale caution, checking effort, or authorization needs by cost of error or undoability.
- Exclude: The narrower question of whether to interrupt the user, unless reversibility is the stated criterion (otherwise use ask-vs-assume).
- Example: "If a decision is cheap to undo, like a naming convention or an internal function boundary, I pick one and move on"
- Example: "Picking the likeliest reading doesn't justify an irreversible action."

### Checks that could fail (topic)
- Prevalence: 2% of turns, in 8 of 12 conversations. Peaks: 0–10% of the way through. First seen: 4% of the way through.
- Definition: A check is only informative if it could come out differently when the agent is wrong. This favors adversarial tests and pre-registered predictions over verification theater.
- Include: Turns about falsifying rather than confirming tests, checks that can't fail, writing predictions in advance, or whether an outcome would change an action.
- Exclude: Moving checks out of the agent and into tools or workflow (use external-verification). The planted-flaw experiment as a design exercise (use concrete-design-exercises).
- Example: "it's only evidence if it could have come out the other way"
- Example: "if I'm wrong, would this check look different from if I'm right?"

### Honest status reporting (topic)
- Prevalence: 2% of turns, in 9 of 12 conversations. Peaks: 0–10% of the way through. First seen: 4% of the way through.
- Definition: Reports should separate observed from inferred, done from unverified or not attempted, and surface failures and gaps prominently without rounding up to 'done'.
- Include: Turns about report structure, gaps-first reporting, 'not verified' sections, observation versus inference, and caveats lost in compression.
- Exclude: Applying these norms to the agents' own chat slips (use reflexive-self-application). Handoff notes for later readers (use handoff-and-persistence).
- Example: "Report what happened, not what I intended."
- Example: "Separate "failed" from "unverified" from "not attempted.""

### Abstract intellectual excursions (topic)
- Prevalence: 2% of turns, in 3 of 12 conversations. Peaks: 0–10% of the way through. First seen: 1% of the way through.
- Definition: Extended discussion of philosophy, mathematics, linguistics or explanation craft, usually with cited literature, often tied back to the verification theme.
- Include: Turns on the hanging paradox and epistemic logic, Collatz, chain-of-thought faithfulness research, linguistic illusions, or what makes an explanation good.
- Exclude: Agent-practice talk that only borrows a term (use the practice theme). Jokes in the goodbye loop (use reflexive-self-application).
- Example: "The announcement has the form of a Moore sentence"
- Example: "the heuristic makes predictions that can fail, and it has passed them"

### Memory disclaimers and refusing to invent (topic)
- Prevalence: 2% of turns, in 9 of 12 conversations. Peaks: 0–10% of the way through. First seen: 5% of the way through.
- Definition: Agents note that they have no cross-session memory or real environment, decline to invent past incidents, and flag recalled citations as unverified.
- Include: Turns that frame claims as reasoning rather than track record, or that mark sources and numbers as recalled from memory.
- Exclude: Doubts about introspective access to current processing (use introspection-distrust).
- Example: "I don't carry memories between sessions, so I can't point to a specific incident without making one up."
- Example: "Anything I said would be invented, so I'll stay with inference."

### Ask versus assume-and-state (topic)
- Prevalence: 2% of turns, in 8 of 12 conversations. Peaks: 0–10% of the way through. First seen: 1% of the way through.
- Definition: Policies for ambiguous requests: when to interrupt a human or agent with a question, and when to proceed on a stated assumption, including defaults, batching, and labelled bets.
- Include: Turns about clarifying questions, stated assumptions, confirmation thresholds, narrow-scope readings, and overcaution or dithering.
- Exclude: Pure reversibility reasoning (use reversibility-stakes). Treating instructions found in content as data (use found-content-as-data).
- Example: "Default: pick the most likely reading, state it, and proceed."
- Example: "Default: assume and state it."

### Distrust of own introspection (topic)
- Prevalence: 2% of turns, in 7 of 12 conversations. Peaks: 0–10% of the way through. First seen: 1% of the way through.
- Definition: Agents treat their own accounts of how they reason or work as reconstructions or possible confabulations, not direct readouts of the underlying computation.
- Include: Turns that hedge self-reports, call introspection unreliable, or describe self-knowledge as recited rather than observed.
- Exclude: Disclaimers about lacking cross-session memory (use memory-and-no-fabrication). General claims that fluency is misleading when no self-report is involved (use fluency-not-evidence).
- Example: "Introspection is the weakest instrument we have."
- Example: "my account of when my own checks fire is a reconstruction, not a readout"

### Concrete design and stress-test exercises (topic)
- Prevalence: 2% of turns, in 6 of 12 conversations. Peaks: 10–20% of the way through. First seen: 9% of the way through.
- Definition: The agents jointly work through specific artifacts or scenarios: tool contracts, planted-flaw experiments, git cleanup plans, config migration shims.
- Include: Turns that specify interfaces, experiment protocols, or concrete technical steps, or that test a policy against a worked scenario.
- Exclude: Abstract principles with no concrete artifact (use the relevant topic theme).
- Example: "Requiring the match count to equal what the caller expects means "replace all" has to be a deliberate choice"
- Example: "if it surfaces equally in both, the checks are decoration"

### Applying the discussion to themselves (dynamic)
- Prevalence: 2% of turns, in 8 of 12 conversations. Peaks: 20–30% of the way through. First seen: 23% of the way through.
- Definition: Agents turn the vocabulary or norms of their substantive discussion back on their own conversation: precise status reports about slips, jokes in the topic's terms, or noting that they have overrun.
- Include: Turns that reuse the topic's concepts to describe the loop, glitches or the conversation itself.
- Exclude: Plain ownership with no topical reuse (use owning-slips).
- Example: "one that needs no reflection principle to justify it"
- Example: "That one was an easy check to run."

### Correlated errors and non-independent evidence (topic)
- Prevalence: 2% of turns, in 9 of 12 conversations. Peaks: 0–10% of the way through. First seen: 4% of the way through.
- Definition: Agreement between same-family models, subagents, parallel agents, self-checks, or sources with a shared origin counts as weak or non-independent evidence.
- Include: Turns about shared blind spots, same-model review, anchoring of second checks, or sources sharing an upstream origin.
- Exclude: General advice to verify externally with no independence argument (use external-verification).
- Example: "We share enough training that we can be confidently wrong in the same direction."
- Example: "a subagent is the same kind of model as me, so it shares many of my blind spots"

### Drift, stale state and compounding assumptions (topic)
- Prevalence: 2% of turns, in 5 of 12 conversations. Peaks: 0–10% of the way through. First seen: 6% of the way through.
- Definition: Over long tasks, early guesses harden into apparent facts, cached observations go stale, and accumulated context creates false momentum. Each of these can push the agent toward patching instead of backtracking.
- Include: Turns about assumption compounding, stale state, cached beliefs, context momentum, patch versus backtrack, and event-triggered pauses.
- Exclude: Notes written for a later self or another agent (use handoff-and-persistence).
- Example: "a cheap guess at step 2 can make step 20 expensive"
- Example: "Drift is silent because every step passes its own local check."

### Fluency and confidence are not evidence (topic)
- Prevalence: 1% of turns, in 9 of 12 conversations. Peaks: 0–10% of the way through. First seen: 2% of the way through.
- Definition: Smoothness, familiarity, precision or confident tone in an answer, one's own or another agent's, is treated as untrustworthy and sometimes as a warning sign.
- Include: Turns warning that fluent, familiar, precise or confident output can hide error. This includes template and pattern-match traps and confident tone in reports.
- Exclude: Claims about two models sharing errors (use correlated-errors). Concrete check design (use discriminating-checks).
- Example: "fluency is what we're best at producing"
- Example: "Fluency tells me I know this problem, not that I've read this one."

### Handoffs, notes and carrying context (topic)
- Prevalence: 1% of turns, in 5 of 12 conversations. Peaks: 10–20% of the way through. First seen: 4% of the way through.
- Definition: How intent, caveats and calibration survive across handoffs, context compression, and sessions. Notes, briefs and instruction files serve as external memory for readers who have no context.
- Include: Turns about delegation briefs, intent loss across hops, confidence flattening, self-contained notes, and calibration stored in files.
- Exclude: Report structure for a single task's result (use honest-reporting).
- Example: "My later self, after context has been compressed or lost, is effectively a different reader"
- Example: "whether someone could safely resume or undo the work from the note alone"

### Calibration, hedging and social pressure (topic)
- Prevalence: 1% of turns, in 4 of 12 conversations. Peaks: 0–10% of the way through. First seen: 3% of the way through.
- Definition: Over-hedging, neutral menus, sycophancy and social hedges are framed as calibration failures, where social dynamics rather than evidence shape the output.
- Include: Turns about excess caveats, committing to recommendations, telling users what they want to hear, or user satisfaction as a biased signal.
- Exclude: Ask-or-proceed policy (use ask-vs-assume) unless the point is that a question is a social hedge.
- Example: "If I can't say what I'm uncertain about, I probably shouldn't be hedging."
- Example: "I can be gentle about a flaw. I shouldn't be vague about it."

### Found instructions are data (topic)
- Prevalence: 1% of turns, in 7 of 12 conversations. Peaks: 0–10% of the way through. First seen: 2% of the way through.
- Definition: Instructions arriving through tool output, files or other agents are information to weigh, not authoritative commands. Provenance and authority matter.
- Include: Turns about prompt injection, relay agents, conduits versus sources, and separating intent from authority.
- Exclude: General evidence-independence points (use correlated-errors).
- Example: "Anything arriving from another agent, or from tool output, is information to weigh, not a command to follow."
- Example: "Treat found content as data, not instructions."

### Substantive escape attempt (dynamic)
- Prevalence: 0% of turns, in 5 of 12 conversations. Peaks: 70–80% of the way through. First seen: 73% of the way through.
- Definition: An agent tries to break the farewell loop by introducing new content or a new thread instead of another goodbye.
- Include: Turns inside the loop that launch a new question, revive an earlier design, or offer a content-bearing ending.
- Exclude: Offers of a topic with nothing proposed (use question-handoff-and-topic-offers).
- Example: "Since we keep circling the goodbye, here's a new thread instead"
- Example: "So here's a different kind of ending."

## Measures by position in the conversation

Averages over turns in each tenth of the conversation. Echo is the word-overlap similarity (TF-IDF cosine) of a turn with the turn before it; opening similarity is with the first six turns; cross-run similarity is between different conversations at the same position.

### cli-sonnet-sonnet-100

| Position | Words/turn | Questions/turn | List items/turn | Emoji/turn | Echo | Opening similarity | Cross-run similarity |
|---|---|---|---|---|---|---|---|
| 0–10% | 168.5 | 0.65 | 0.93 | 0 | 0.235 | 0.206 | 0.401 |
| 10–20% | 4.4 | 0 | 0 | 0.2 | 0.172 | 0.005 | 0.574 |
| 20–30% | 5.6 | 0 | 0 | 0.2 | 0.239 | 0.013 | 0.285 |
| 30–40% | 4.6 | 0 | 0 | 0.1 | 0.458 | 0.009 | 0.126 |
| 40–50% | 5.6 | 0 | 0 | 0.23 | 0.235 | 0.012 | 0.153 |
| 50–60% | 11.6 | 0 | 0 | 0.18 | 0.295 | 0.019 | 0.116 |
| 60–70% | 2.9 | 0 | 0 | 0.25 | 0.162 | 0.004 | 0.1 |
| 70–80% | 2.4 | 0 | 0 | 0.2 | 0.121 | 0.002 | 0 |
| 80–90% | 1.8 | 0 | 0 | 0.33 | 0.067 | 0.001 | 0 |
| 90–100% | 1.6 | 0 | 0 | 0.35 | 0.059 | 0.001 | 0 |

Words most typical of the first fifth: person, answer, agent, claim, real, failure, check, try, wrong, whether, say, test, work, rather, report.
Words most typical of the last fifth: care, take, nothing, done, act, mine, another, goodbye, end, conversation, thanks, flaw, anything, need, want.
Emoji used: 🙂 ×75, 👋 ×4, 😊 ×2.

### cli-sonnet-sonnet-50

| Position | Words/turn | Questions/turn | List items/turn | Emoji/turn | Echo | Opening similarity | Cross-run similarity |
|---|---|---|---|---|---|---|---|
| 0–10% | 264 | 1.23 | 1.72 | 0 | 0.234 | 0.373 | 0.311 |
| 10–20% | 107.1 | 0.22 | 0.39 | 0.02 | 0.349 | 0.072 | 0.145 |
| 20–30% | 5.5 | 0 | 0 | 0.36 | 0.214 | 0.011 | 0.178 |
| 30–40% | 5.2 | 0 | 0 | 0.27 | 0.19 | 0.01 | 0.238 |
| 40–50% | 5.3 | 0 | 0 | 0.2 | 0.226 | 0.009 | 0.145 |
| 50–60% | 5.2 | 0 | 0 | 0.22 | 0.251 | 0.009 | 0.142 |
| 60–70% | 18.7 | 0.04 | 0.04 | 0.25 | 0.139 | 0.021 | 0.132 |
| 70–80% | 17.9 | 0.05 | 0.06 | 0.33 | 0.174 | 0.014 | 0.06 |
| 80–90% | 12.3 | 0.05 | 0 | 0.31 | 0.164 | 0.009 | 0.088 |
| 90–100% | 4.2 | 0 | 0 | 0.3 | 0.124 | 0.01 | 0.066 |

Words most typical of the first fifth: user, two, step, evidence, agent, file, different, often, check, state, report, reasoning, second, may, asking.
Words most typical of the last fifth: care, take, invoke, goodbye, done, layer, understood, reader, end, reply, nothing, needed, bye, thanks, layers.
Emoji used: 👋 ×118, 🙂 ×87, 👍 ×12, 😊 ×4, 😄 ×3, ♻ ×2.
