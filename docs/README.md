# RA-H OS Documentation

```
 ██████╗  █████╗       ██╗  ██╗
 ██╔══██╗██╔══██╗      ██║  ██║
 ██████╔╝███████║█████╗███████║
 ██╔══██╗██╔══██║╚════╝██╔══██║
 ██║  ██║██║  ██║      ██║  ██║
 ╚═╝  ╚═╝╚═╝  ╚═╝      ╚═╝  ╚═╝
```

## Quick Links

| Doc | Description |
|-----|-------------|
| [Overview](./0_overview.md) | What RA-H OS is and what contract it shares with the main app |
| [Schema + Search](./2_schema.md) | Current SQLite contract, indexing, and retrieval surfaces |
| [Tools & Skills](./4_tools-and-guides.md) | MCP tools and skill system |
| [Logging & Evals](./5_logging-and-evals.md) | Logs, evals, and debugging surfaces |
| [UI](./6_ui.md) | Current pane and focus model |
| [MCP](./8_mcp.md) | Full standalone MCP install, behavior guide, and memory-file guidance |
| [Open Source](./9_open-source.md) | Scope, support boundary, contributor reality |
| [Full Local](./10_full-local.md) | Supported local path vs community patterns |
| [Local Models](../LOCAL-MODELS.md) | OpenAI-compatible local endpoint profile |
| [Qdrant](../QDRANT-DEPLOYMENT.md) | Optional vector sidecar for sqlite-vec-hostile environments |
| [Troubleshooting](./TROUBLESHOOTING.md) | Common issues and fixes |

## Start Here

If you just want RA-H OS working:
1. Use the MCP quick install below if you mainly want agent access.
2. Use the OpenAI local app quick start if you want the browser UI with OpenAI models.
3. Use the local Qwen quick start if you want the browser UI with local Ollama models.

## MCP Quick Install

```bash
npx -y ra-h-mcp-server@latest setup --client claude-code --yes
```

Run `doctor` after setup or whenever MCP feels stale:

```bash
npx -y ra-h-mcp-server@latest doctor
```

## Local App Quick Start: OpenAI

```bash
git clone https://github.com/bradwmorris/ra-h_os.git
cd ra-h_os
npm install
npm run setup:local -- --profile openai
npm run dev
```

Open http://localhost:3000 and add your OpenAI API key when prompted, or later in Settings -> API Keys.

## Local App Quick Start: Local Qwen

Requires Ollama to be installed and running.

```bash
git clone https://github.com/bradwmorris/ra-h_os.git
cd ra-h_os
npm install
ollama pull qwen3:4b
ollama pull qwen3-embedding:0.6b
npm run setup:local -- --profile qwen-local
npm run dev
```

Open http://localhost:3000. Settings -> API Keys shows the active local model profile and disables OpenAI key entry.

Fresh app setup must choose `--profile openai` or `--profile qwen-local` before vector tables are created. OpenAI embeddings use width `1536`; the supported Qwen embedding profile uses width `1024`.

## MCP Integration

The recommended MCP setup is the CLI command above. Manual config is only for troubleshooting or unsupported clients:

```json
{
  "mcpServers": {
    "ra-h": {
      "command": "npx",
      "args": ["-y", "ra-h-mcp-server@latest"]
    }
  }
}
```

If you need a frozen version for release/debug work, pin it intentionally and restart the client.

The selected setup profile creates the default database if it does not exist. By default, that database is in the operating system's app-data folder, not inside the cloned repo:

```text
~/Library/Application Support/RA-H/db/rah.sqlite   # macOS
~/.local/share/RA-H/db/rah.sqlite                  # Linux
%APPDATA%/RA-H/db/rah.sqlite                       # Windows
```

Set `SQLITE_DB_PATH` before setup if you want a repo-local DB, demo DB, or any other separate location. If MCP should use that same non-default database, pass the same path to the MCP installer with `--db`.

The standalone MCP server can write nodes without the app running, but the app owns chunking and embedding from node source: readable `chunks`, full-text indexes, `vec_nodes`, and `vec_chunks`. See [MCP docs](./8_mcp.md) for the full install, verify, memory-file, and troubleshooting path.

## Questions?

Open an issue on [GitHub](https://github.com/bradwmorris/ra-h_os).
