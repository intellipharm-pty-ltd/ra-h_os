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
| [Troubleshooting](./TROUBLESHOOTING.md) | Common issues and fixes |

## Start Here

If you just want RA-H OS working:
1. Use the MCP quick install below if you mainly want agent access.
2. Use the local app quick start if you also want the browser UI.
3. Read [Full Local](./10_full-local.md) if you want a more local-first or community setup.

## MCP Quick Install

```bash
npx -y ra-h-mcp-server@latest setup --client claude-code --yes
```

Run `doctor` after setup or whenever MCP feels stale:

```bash
npx -y ra-h-mcp-server@latest doctor
```

## Local App Quick Start

```bash
git clone https://github.com/bradwmorris/ra-h_os.git
cd ra-h_os
npm install
npm run setup:local
npm run dev
```

Open http://localhost:3000

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

The setup command creates the default database if it does not exist. The standalone MCP server can write nodes without the app running, but the app owns chunking and embedding from node source: readable `chunks`, full-text indexes, `vec_nodes`, and `vec_chunks`. See [MCP docs](./8_mcp.md) for the full install, verify, memory-file, and troubleshooting path.

## Questions?

Open an issue on [GitHub](https://github.com/bradwmorris/ra-h_os).
