# Aspire Ops: back-office agent in the Claude Console

A read-only analyst for the owner and the marketing and admissions team. It runs on Anthropic's Claude Console (Managed Agents) and reads Aspire's data through the site's MCP server.

- **Ask it questions** in the Console, for example: "How many NEET leads came from Kangra this week?", "Which leads have had no call yet?", "Which source brings the most visits?"
- **Daily summary** at 08:30 IST and a **weekly review** (spreadsheet plus one-page summary) on Mondays at 09:00 IST. Each run's report is in the Console under the deployment's runs.
- **It cannot change anything or contact anyone.** Its token is read-only, and only read tools are switched on. It never sees the payment, WhatsApp or calling systems.
- **Cost:** it runs on Claude Haiku 5.5, the cheapest model, because the CRM's `crm_report` tool calculates the figures on the server and the agent only reports them. You pay Claude usage plus $0.08 per hour of running time. Each daily run is capped at $0.50 and each weekly run at $1 (the `budget` lines in the deployment files). If answers ever look wrong, change `model` in `agent.md` to `claude-sonnet-5-5` and run `ant apply` on it.

The WhatsApp admissions agent is separate and runs inside the website (see `docs/admissions-agent-plan.md`).

## Files

| File | What it creates |
|---|---|
| `agent.md` | The agent: model, tools, Aspire MCP server, instructions |
| `environment.yaml` | Its sandbox: no internet, only Aspire's MCP server |
| `vault.yaml` | The vault that holds the read-only MCP token (the token is never in this repo) |
| `deployment-daily.yaml` | The 08:30 IST daily summary |
| `deployment-weekly.yaml` | The Monday 09:00 IST weekly review |

`ant apply` records each created resource's ID in `claude-lock.json` (in `aspire-web/`). Commit that file; without it the next apply creates duplicates.

## One-time setup

Run these in Git Bash from `C:\Users\ADMIN\aspire-2\aspire-web`.

1. **Install the Anthropic CLI (`ant`, version 1.34 or later).** Download the Windows zip from https://github.com/anthropics/anthropic-cli/releases, unzip `ant.exe` into a folder on your PATH, then check with `ant --version`.
2. **Sign in:** `ant auth login`. A browser opens; choose Aspire's organization and workspace. `ant auth status` shows which one is active.
3. **Preview, then create the agent, sandbox and vault:**
   ```sh
   ant apply --dry-run agents/aspire-ops          # must list exactly: agent, environment, vault, 2 deployments
   ant apply --dry-run -v agents/aspire-ops/agent.md agents/aspire-ops/environment.yaml agents/aspire-ops/vault.yaml
   ant apply agents/aspire-ops/agent.md agents/aspire-ops/environment.yaml agents/aspire-ops/vault.yaml
   ```
4. **Create the token** in the website's admin console at `/admin/mcp`. Name it "Claude Console ops agent" and give it **Site: read, Content: read, CRM: read** and nothing else (CRM is off by default; tick it on purpose). Copy the token once. Do not paste it into chat or into any file.
5. **Put the token in the vault.** Either:
   - In the Claude Console: open the `aspire-ops` vault, add an MCP bearer-token credential for `https://aspire.thechunkmedia.com/api/mcp`, and paste the token there; or
   - In Git Bash (the token is typed at a hidden prompt and never saved):
     ```sh
     VAULT_ID=$(node -p 'require("./claude-lock.json").resources["./agents/aspire-ops/vault.yaml"].id')
     read -rs ASPIRE_MCP_TOKEN && export ASPIRE_MCP_TOKEN
     node -e 'process.stdout.write(JSON.stringify({display_name: "Aspire MCP (read-only)", auth: {type: "static_bearer", mcp_server_url: "https://aspire.thechunkmedia.com/api/mcp", token: process.env.ASPIRE_MCP_TOKEN}}))' \
       | ant beta:vaults:credentials create --vault-id "$VAULT_ID"
     unset ASPIRE_MCP_TOKEN
     ```
6. **Turn on the schedules.** Replace `YOUR_VAULT_ID` in both deployment files with the vault ID (`echo $VAULT_ID`, or the `vlt_...` value for `vault.yaml` in `claude-lock.json`), then:
   ```sh
   ant apply --dry-run -v agents/aspire-ops/deployment-daily.yaml agents/aspire-ops/deployment-weekly.yaml
   ant apply agents/aspire-ops/deployment-daily.yaml agents/aspire-ops/deployment-weekly.yaml
   ```
7. **Test now** rather than waiting for 08:30: in the Console, open the daily deployment and choose **Run now**. Open the run's session to watch it and read the report.

## Everyday use

- **Chat:** in the Console, start a new session with agent `aspire-ops`, its environment and the `aspire-ops` vault, then ask your question.
- **Change its instructions or schedule:** edit the file, then run `ant apply` on that file. The agent gets a new version; running sessions are not affected.
- **Pause a schedule:** pause the deployment in the Console (reversible). Avoid "archive", which is permanent.

## When the domain changes at go-live

Update the MCP `url` in `agent.md`, add a new vault credential for the new URL (step 5), and run `ant apply` on `agent.md`. Then revoke the old token at `/admin/mcp`.
