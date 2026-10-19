# Aspire Claude Code Multi-Agent Setup

This setup is designed for the **existing** `aspire-web/` Next.js 16 + Tailwind CSS 4 project. It adds Claude Code project instructions and specialist subagents; it does not rebuild the app.

## Install
1. Back up or commit your current work before adding these files.
2. Copy the contents of this package into the root of your `aspire-web/` repository.
3. If `CLAUDE.md` or `.claude/agents/` already exists, merge carefully; do not overwrite useful existing instructions.
4. Open the repository root in VS Code and start an interactive Claude Code session.
5. Paste `docs/START_HERE_PROMPT.md` into Claude Code.
6. Ask Claude to inspect and plan first. Review its plan before authorizing code changes.

## Agent setup
Specialist agents are defined in `.claude/agents/` and are available to Claude Code as subagents:
- `content-researcher.md`
- `homepage-ux-designer.md`
- `frontend-engineer.md`
- `qa-auditor.md`
- `content-integrity-reviewer.md`

The main Claude Code session acts as **orchestrator/tech lead**. It should delegate read-only analysis in parallel, then assign implementation in controlled phases. Specialist subagents do not automatically mean every task runs in parallel; the lead decides when safe.

## Important
Claude Code agent teams and subagents are different features. This pack uses repository-level custom subagents, which are the lower-friction default. If you specifically want collaborative agent teams, consult the current Claude Code Agent Teams documentation and enable its experimental setting only after reviewing the limitations. Official reference: https://code.claude.com/docs/en/agent-teams

## Project guardrails
- Reference content: https://aspire2.thechunkmedia.com
- Approved visual direction: navy/white/gold, mountain-and-student hero, compact 3-step enquiry form, rich institutional showcase homepage.
- Preserve existing routes, portal previews, APIs, tests, and architecture.
- Do not publish unverified student names, results, testimonials, claims, fees, or centre information.
- Do not deploy, push, or connect live form services without explicit approval.
