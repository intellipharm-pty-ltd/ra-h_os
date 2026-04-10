---
name: Node Context Enrichment
description: "Use to rewrite thin node descriptions into natural prose that still makes what, why, and status clear, with dimension review and edge suggestions."
---

# Node Context Enrichment

Use this when a node already exists but its description is thin, generic, or missing personal context.

This skill should not silently rewrite and move on when contextual framing is inferred. If the enrichment depends on interpretation, update the node and then explicitly invite the user to correct or refine the contextual framing.

## Goal

Replace weak descriptions with a single clean natural description that captures:

1. What the artifact literally is
2. Why it is in Brad's graph
3. Status in Brad's workflow

Also review whether the node needs dimension fixes or obvious edge suggestions.

## Workflow

1. Load the node and inspect title, description, source, link, metadata, dimensions, and nearby edges.
2. Search for adjacent context before rewriting.
3. Infer the best available "why" from that context.
4. Rewrite the full description from scratch in natural prose. Do not append to the old text or use labels like WHAT:, WHY:, or STATUS:.
5. Review dimensions.
6. Suggest 1-3 high-signal edges when obvious.
7. Update the node once the description is strong enough to be useful.
8. After the update, tell the user what changed and ask whether they want to refine the important framing:
   - what it is
   - why it belongs in the graph
   - status / current relevance / workflow position

The user feedback pass is required whenever the enriched "why" or status was inferred rather than directly stated in the node/source.
