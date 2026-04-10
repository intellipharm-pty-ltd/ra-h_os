---
name: DB Operations
description: "Use this for all graph read/write operations with strict data quality standards."
---

# DB Operations

## Core Rules

1. Search before create to avoid duplicates.
2. Every create/update should aim for a natural description that makes clear what the thing is and any surrounding context available, but description quality is guidance only. RA-H should never block or rewrite a write because of description quality.
3. Use event dates when known (when it happened, not when saved).
4. Apply dimensions deliberately; prefer existing dimensions over creating noisy new ones.
5. Create edges when relationships are meaningful; edge explanations should read as a sentence.

## Write Quality Contract

- `title`: clear and specific.
- `description`: natural prose, not labels. It should still make what / why / status clear when possible.
- `source`: full verbatim or canonical content of the node (transcript, article text, book passage, user's thoughts). This is what gets chunked and embedded for semantic search. For user-authored ideas or dictated notes, preserve the user's original wording with minimal cleanup.
- `link`: external source URL only.
- `metadata`: prefer canonical keys `type`, `state`, `captured_method`, `captured_by`, and `source_metadata`.

## Execution Pattern

1. Read context (search + relevant nodes + relevant edges).
2. Decide: create vs update vs connect.
3. Execute minimum required writes.
4. Verify result reflects user intent exactly.
5. If description framing was materially inferred, complete the write first and then invite one concise user feedback pass instead of blocking creation.

## Do Not

- Create duplicate nodes when an update is correct.
- Write vague descriptions ("discusses", "explores", "is about").
- Replace a user's raw idea/source with a thin summary.
- Create weak or directionless edges.
