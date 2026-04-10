# RA-H MCP Server

Connect Claude Code and Claude Desktop to your RA-H knowledge base. Direct SQLite access - works without the RA-H app running.

## Install

```bash
npx ra-h-mcp-server
```

That's it. No manual setup required.

## Configure Claude Code / Claude Desktop

Add to your Claude config (`~/.claude.json` or Claude Desktop settings):

```json
{
  "mcpServers": {
    "ra-h": {
      "command": "npx",
      "args": ["ra-h-mcp-server"]
    }
  }
}
```

Restart Claude. Done.

## Requirements

- Node.js 18+
- Database is created automatically at `~/Library/Application Support/RA-H/db/rah.sqlite` on first connection

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `RAH_DB_PATH` | ~/Library/Application Support/RA-H/db/rah.sqlite | Database path |

## What to Expect

Once connected, Claude will:
- **Call `getContext` first** to orient itself (stats, contexts, hub nodes, dimensions, skills)
- **Proactively capture knowledge** — when a new insight, decision, person, or reference surfaces, it proposes a specific node (title, dimensions, description) so you can approve with minimal friction
- **Read skills for complex tasks** — skills are editable and shared across internal + external agents
- **Search before creating** to avoid duplicates

## Available Tools

| Tool | Description |
|------|-------------|
| `getContext` | Get graph overview — stats, contexts, hub nodes, dimensions, recent activity |
| `createNode` | Create a new node |
| `queryNodes` | Search nodes by keyword |
| `queryContexts` | List or inspect contexts |
| `getNodesById` | Load nodes by ID (includes chunk + metadata) |
| `updateNode` | Update an existing node |
| `createEdge` | Create connection between nodes |
| `updateEdge` | Update an edge explanation |
| `queryEdge` | Find edges for a node |
| `queryDimensions` | List all dimensions |
| `createDimension` | Create a dimension |
| `updateDimension` | Update/rename a dimension |
| `deleteDimension` | Delete a dimension |
| `listSkills` | List available skills |
| `readSkill` | Read a skill by name |
| `writeSkill` | Create or update a skill |
| `deleteSkill` | Delete a skill |
| `searchContentEmbeddings` | Search through source content (transcripts, books, articles) |
| `sqliteQuery` | Execute read-only SQL queries (SELECT/WITH/PRAGMA) |

## Skills

Skills are detailed instruction sets that teach agents how to work with your knowledge base. The default seeded skills are editable and shared by internal + external agents.

Skills are stored at `~/Library/Application Support/RA-H/skills/` and shared with the main app.

## What's NOT Included

This is a lightweight CRUD server. Advanced features are handled by the main app:

- Embedding generation
- AI-powered edge inference
- Content extraction (URL, YouTube, PDF)
- Real-time SSE events

## Testing

```bash
# Test database connection
node -e "const {initDatabase,query}=require('./services/sqlite-client');initDatabase();console.log(query('SELECT COUNT(*) as c FROM nodes')[0].c,'nodes')"

# Run the server
node index.js
```
