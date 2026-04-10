import { getSQLiteClient } from '@/services/database/sqlite-client';

type ContextCandidate = {
  id: number;
  name: string;
  description: string | null;
  count: number;
  anchor_title: string | null;
  anchor_description: string | null;
};

type InferContextInput = {
  title?: string | null;
  description?: string | null;
  source?: string | null;
  dimensions?: string[] | null;
  metadata?: unknown;
};

const STOP_WORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from', 'has', 'i',
  'in', 'is', 'it', 'its', 'of', 'on', 'or', 'that', 'the', 'their', 'this',
  'to', 'was', 'with', 'you', 'your'
]);

function normalizeText(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9\s]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function tokenize(value: string | null | undefined): string[] {
  if (!value) return [];
  return normalizeText(value)
    .split(' ')
    .map((token) => token.trim())
    .filter((token) => token.length >= 2 && !STOP_WORDS.has(token));
}

function uniqueTokens(values: Array<string | null | undefined>): string[] {
  return Array.from(new Set(values.flatMap((value) => tokenize(value))));
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value ?? {});
  } catch {
    return '';
  }
}

function fetchContextCandidates(): ContextCandidate[] {
  const sqlite = getSQLiteClient();
  return sqlite.query<ContextCandidate>(`
    WITH context_counts AS (
      SELECT c.id, c.name, c.description, COUNT(n.id) AS count
      FROM contexts c
      LEFT JOIN nodes n ON n.context_id = c.id
      GROUP BY c.id
    ),
    ranked_anchors AS (
      SELECT
        c.id AS context_id,
        n.title AS anchor_title,
        n.description AS anchor_description,
        ROW_NUMBER() OVER (
          PARTITION BY c.id
          ORDER BY COUNT(e.id) DESC, n.updated_at DESC, n.id ASC
        ) AS anchor_rank
      FROM contexts c
      LEFT JOIN nodes n ON n.context_id = c.id
      LEFT JOIN edges e ON (e.from_node_id = n.id OR e.to_node_id = n.id)
      GROUP BY c.id, n.id
    )
    SELECT
      cc.id,
      cc.name,
      cc.description,
      cc.count,
      ra.anchor_title,
      ra.anchor_description
    FROM context_counts cc
    LEFT JOIN ranked_anchors ra
      ON ra.context_id = cc.id
     AND ra.anchor_rank = 1
    ORDER BY cc.name COLLATE NOCASE ASC
  `).rows.map((row) => ({
    id: Number(row.id),
    name: row.name,
    description: row.description ?? null,
    count: Number(row.count ?? 0),
    anchor_title: row.anchor_title ?? null,
    anchor_description: row.anchor_description ?? null,
  }));
}

function scoreContextCandidate(candidate: ContextCandidate, input: InferContextInput): number {
  const titleText = normalizeText(input.title || '');
  const descriptionText = normalizeText(input.description || '');
  const sourceText = normalizeText((input.source || '').slice(0, 4000));
  const metadataText = normalizeText(safeStringify(input.metadata));
  const dimensionTokens = uniqueTokens(input.dimensions ?? []);
  const contextName = normalizeText(candidate.name);
  const contextNameTokens = tokenize(candidate.name);
  const contextDescriptorTokens = uniqueTokens([
    candidate.description,
    candidate.anchor_title,
    candidate.anchor_description,
  ]);

  let score = 0;

  if (contextName && (titleText.includes(contextName) || descriptionText.includes(contextName))) {
    score += 80;
  }
  if (contextName && sourceText.includes(contextName)) {
    score += 40;
  }

  for (const token of contextNameTokens) {
    if (dimensionTokens.includes(token)) score += 30;
    if (titleText.includes(token)) score += 16;
    if (descriptionText.includes(token)) score += 12;
    if (sourceText.includes(token)) score += 6;
    if (metadataText.includes(token)) score += 4;
  }

  for (const token of contextDescriptorTokens) {
    if (dimensionTokens.includes(token)) score += 8;
    if (titleText.includes(token)) score += 4;
    if (descriptionText.includes(token)) score += 3;
    if (sourceText.includes(token)) score += 2;
  }

  return score;
}

export async function inferBestContextIdForNode(input: InferContextInput): Promise<number | null> {
  const contexts = fetchContextCandidates();
  if (contexts.length === 0) {
    return null;
  }

  const ranked = contexts
    .map((context) => ({
      context,
      score: scoreContextCandidate(context, input),
    }))
    .sort((a, b) =>
      b.score - a.score ||
      (b.context.count - a.context.count) ||
      a.context.id - b.context.id
    );

  const best = ranked[0];
  if (!best) {
    return null;
  }

  if (best.score > 0) {
    return best.context.id;
  }

  const research = contexts.find((context) => context.name.trim().toLowerCase() === 'research');
  if (research) {
    return research.id;
  }

  return ranked[0].context.id;
}
