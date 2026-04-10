'use strict';

const { query, transaction, getDb } = require('./sqlite-client');
const contextService = require('./contextService');

function parseMetadata(metadata) {
  if (!metadata) return {};
  if (typeof metadata === 'string') {
    try {
      const parsed = JSON.parse(metadata);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? { ...parsed } : {};
    } catch {
      return {};
    }
  }
  return metadata && typeof metadata === 'object' && !Array.isArray(metadata) ? { ...metadata } : {};
}

function normalizeString(value) {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function buildCanonicalMetadata({ existing, metadata }) {
  const prior = parseMetadata(existing);
  const incoming = parseMetadata(metadata);
  const sourceMetadata = {
    ...(prior.source_metadata && typeof prior.source_metadata === 'object' ? prior.source_metadata : {}),
    ...(incoming.source_metadata && typeof incoming.source_metadata === 'object' ? incoming.source_metadata : {}),
  };

  const merged = {
    ...prior,
    ...incoming,
    state: incoming.state === 'processed' ? 'processed' : (prior.state === 'processed' ? 'processed' : 'not_processed'),
    captured_by: incoming.captured_by || prior.captured_by || 'human',
    source_metadata: sourceMetadata,
  };

  const type = normalizeString(incoming.type) || normalizeString(prior.type);
  const capturedMethod = normalizeString(incoming.captured_method) || normalizeString(prior.captured_method);

  if (type) merged.type = type;
  else delete merged.type;

  if (capturedMethod) merged.captured_method = capturedMethod;
  else delete merged.captured_method;

  return merged;
}

function mapNodeRow(row) {
  return {
    ...row,
    dimensions: JSON.parse(row.dimensions_json || '[]'),
    metadata: row.metadata ? (typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata) : null,
    context: row.context_json ? JSON.parse(row.context_json) : null,
    dimensions_json: undefined,
    context_json: undefined,
  };
}

/**
 * Get nodes with optional filtering.
 */
function getNodes(filters = {}) {
  const { dimensions, search, limit = 100, offset = 0, contextId } = filters;

  let sql = `
    SELECT n.id, n.title, n.description, n.source, n.link, n.event_date, n.metadata,
           n.created_at, n.updated_at, n.context_id,
           COALESCE((SELECT JSON_GROUP_ARRAY(d.dimension)
                     FROM node_dimensions d WHERE d.node_id = n.id), '[]') as dimensions_json,
           CASE
             WHEN c.id IS NULL THEN NULL
             ELSE json_object('id', c.id, 'name', c.name, 'description', c.description, 'icon', c.icon)
           END as context_json
    FROM nodes n
    LEFT JOIN contexts c ON c.id = n.context_id
    WHERE 1=1
  `;
  const params = [];

  // Filter by dimensions
  if (dimensions && dimensions.length > 0) {
    sql += ` AND EXISTS (
      SELECT 1 FROM node_dimensions nd
      WHERE nd.node_id = n.id
      AND nd.dimension IN (${dimensions.map(() => '?').join(',')})
    )`;
    params.push(...dimensions);
  }

  // Text search
  if (search) {
    sql += ` AND (n.title LIKE ? COLLATE NOCASE OR n.description LIKE ? COLLATE NOCASE OR n.source LIKE ? COLLATE NOCASE)`;
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }
  if (contextId !== undefined) {
    sql += ' AND n.context_id = ?';
    params.push(contextId);
  }

  // Sort by search relevance or updated_at
  if (search) {
    sql += ` ORDER BY
      CASE WHEN LOWER(n.title) = LOWER(?) THEN 1 ELSE 6 END,
      CASE WHEN LOWER(n.title) LIKE LOWER(?) THEN 2 ELSE 6 END,
      CASE WHEN n.title LIKE ? COLLATE NOCASE THEN 3 ELSE 6 END,
      CASE WHEN n.description LIKE ? COLLATE NOCASE THEN 4 ELSE 6 END,
      n.updated_at DESC`;
    params.push(search, `${search}%`, `%${search}%`, `%${search}%`);
  } else {
    sql += ' ORDER BY n.updated_at DESC';
  }

  sql += ` LIMIT ?`;
  params.push(limit);

  if (offset > 0) {
    sql += ` OFFSET ?`;
    params.push(offset);
  }

  const rows = query(sql, params);

  return rows.map(mapNodeRow);
}

/**
 * Get a single node by ID.
 */
function getNodeById(id) {
  const sql = `
    SELECT n.id, n.title, n.description, n.source, n.link, n.event_date, n.metadata,
           n.created_at, n.updated_at, n.context_id,
           COALESCE((SELECT JSON_GROUP_ARRAY(d.dimension)
                     FROM node_dimensions d WHERE d.node_id = n.id), '[]') as dimensions_json,
           CASE
             WHEN c.id IS NULL THEN NULL
             ELSE json_object('id', c.id, 'name', c.name, 'description', c.description, 'icon', c.icon)
           END as context_json
    FROM nodes n
    LEFT JOIN contexts c ON c.id = n.context_id
    WHERE n.id = ?
  `;

  const rows = query(sql, [id]);
  if (rows.length === 0) return null;

  const row = rows[0];
  return mapNodeRow(row);
}

/**
 * Sanitize title — strip extraction artifacts.
 */
function sanitizeTitle(title) {
  let clean = title.trim();
  if (clean.startsWith('Title: ')) clean = clean.slice(7);
  if (clean.endsWith(' / X')) clean = clean.slice(0, -4);
  clean = clean.replace(/\s+/g, ' ');
  return clean.slice(0, 160);
}

const STOP_WORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from', 'has', 'i',
  'in', 'is', 'it', 'its', 'of', 'on', 'or', 'that', 'the', 'their', 'this',
  'to', 'was', 'with', 'you', 'your'
]);

function normalizeText(value) {
  if (typeof value !== 'string') return '';
  return value.toLowerCase().replace(/[^a-z0-9\s]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function tokenize(value) {
  return normalizeText(value)
    .split(' ')
    .map((token) => token.trim())
    .filter((token) => token.length >= 2 && !STOP_WORDS.has(token));
}

function uniqueTokens(values) {
  return [...new Set(values.flatMap((value) => tokenize(value || '')))];
}

function safeStringify(value) {
  try {
    return JSON.stringify(value ?? {});
  } catch {
    return '';
  }
}

function fetchContextCandidates() {
  return query(`
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
  `).map((row) => ({
    id: Number(row.id),
    name: row.name,
    description: row.description ?? null,
    count: Number(row.count ?? 0),
    anchor_title: row.anchor_title ?? null,
    anchor_description: row.anchor_description ?? null,
  }));
}

function scoreContextCandidate(candidate, input) {
  const titleText = normalizeText(input.title || '');
  const descriptionText = normalizeText(input.description || '');
  const sourceText = normalizeText(String(input.source || '').slice(0, 4000));
  const metadataText = normalizeText(safeStringify(input.metadata));
  const dimensionTokens = uniqueTokens(input.dimensions || []);
  const contextName = normalizeText(candidate.name);
  const contextNameTokens = tokenize(candidate.name);
  const contextDescriptorTokens = uniqueTokens([
    candidate.description,
    candidate.anchor_title,
    candidate.anchor_description,
  ]);

  let score = 0;
  if (contextName && (titleText.includes(contextName) || descriptionText.includes(contextName))) score += 80;
  if (contextName && sourceText.includes(contextName)) score += 40;

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

function inferBestContextIdForNode(input) {
  const contexts = fetchContextCandidates();
  if (contexts.length === 0) return null;

  const ranked = contexts
    .map((context) => ({ context, score: scoreContextCandidate(context, input) }))
    .sort((a, b) => b.score - a.score || (b.context.count - a.context.count) || a.context.id - b.context.id);

  const best = ranked[0];
  if (!best) return null;
  if (best.score > 0) return best.context.id;

  const research = contexts.find((context) => context.name.trim().toLowerCase() === 'research');
  if (research) return research.id;

  return best.context.id;
}

/**
 * Create a new node.
 */
function createNode(nodeData) {
  const {
    title: rawTitle,
    description,
    source,
    link,
    event_date,
    dimensions = [],
    metadata = {},
    context_id
  } = nodeData;

  const title = sanitizeTitle(rawTitle);

  const canonicalMetadata = buildCanonicalMetadata({ metadata });
  const now = new Date().toISOString();
  const db = getDb();

  const sourceToStore = source ?? ([title, description].filter(Boolean).join('\n\n').trim() || null);
  const effectiveContextId = context_id == null
    ? inferBestContextIdForNode({ title, description, source: sourceToStore, dimensions, metadata: canonicalMetadata })
    : context_id;

  const nodeId = transaction(() => {
    const stmt = db.prepare(`
      INSERT INTO nodes (title, description, source, link, event_date, metadata, context_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      title,
      description ?? null,
      sourceToStore,
      link ?? null,
      event_date ?? null,
      JSON.stringify(canonicalMetadata),
      effectiveContextId ?? null,
      now,
      now
    );

    const id = Number(result.lastInsertRowid);

    // Insert dimensions
    if (dimensions.length > 0) {
      const dimStmt = db.prepare(
        'INSERT OR IGNORE INTO node_dimensions (node_id, dimension) VALUES (?, ?)'
      );
      for (const dimension of dimensions) {
        dimStmt.run(id, dimension);
      }
    }

    return id;
  });

  return getNodeById(nodeId);
}

/**
 * Update an existing node.
 */
function updateNode(id, updates, options = {}) {
  const { title, description, source, link, event_date, dimensions, metadata } = updates;
  const now = new Date().toISOString();
  const db = getDb();

  // Check node exists
  const existing = getNodeById(id);
  if (!existing) {
    throw new Error(`Node with ID ${id} not found. Use rah_search_nodes to find nodes by keyword.`);
  }

  const mergedMetadata = metadata !== undefined
    ? buildCanonicalMetadata({ existing: existing.metadata, metadata })
    : undefined;

  transaction(() => {
    const setFields = [];
    const params = [];

    if (title !== undefined) {
      setFields.push('title = ?');
      params.push(title);
    }
    if (description !== undefined) {
      setFields.push('description = ?');
      params.push(description);
    }
    if (source !== undefined) {
      setFields.push('source = ?');
      params.push(source);
    }
    if (link !== undefined) {
      setFields.push('link = ?');
      params.push(link);
    }
    if (event_date !== undefined) {
      setFields.push('event_date = ?');
      params.push(event_date);
    }
    if (Object.prototype.hasOwnProperty.call(updates, 'context_id')) {
      setFields.push('context_id = ?');
      params.push(updates.context_id ?? null);
    }
    if (mergedMetadata !== undefined) {
      setFields.push('metadata = ?');
      params.push(JSON.stringify(mergedMetadata));
    }

    // Always update timestamp
    setFields.push('updated_at = ?');
    params.push(now);
    params.push(id);

    if (setFields.length > 1) {
      const stmt = db.prepare(`UPDATE nodes SET ${setFields.join(', ')} WHERE id = ?`);
      stmt.run(...params);
    }

    // Handle dimensions separately
    if (Array.isArray(dimensions)) {
      db.prepare('DELETE FROM node_dimensions WHERE node_id = ?').run(id);
      const dimStmt = db.prepare('INSERT OR IGNORE INTO node_dimensions (node_id, dimension) VALUES (?, ?)');
      for (const dim of dimensions) {
        dimStmt.run(id, dim);
      }
    }
  });

  return getNodeById(id);
}

/**
 * Delete a node.
 */
function deleteNode(id) {
  const result = query('DELETE FROM nodes WHERE id = ?', [id]);
  if (result.changes === 0) {
    throw new Error(`Node with ID ${id} not found. Use rah_search_nodes to find nodes by keyword.`);
  }
  return true;
}

/**
 * Get node count.
 */
function getNodeCount() {
  const rows = query('SELECT COUNT(*) as count FROM nodes');
  return Number(rows[0].count);
}

/**
 * Get knowledge graph context overview.
 * Returns stats, contexts, hub nodes, dimensions, and recent activity.
 */
function getContext() {
  const nodeCount = query('SELECT COUNT(*) as count FROM nodes')[0].count;
  const edgeCount = query('SELECT COUNT(*) as count FROM edges')[0].count;

  const dimensionService = require('./dimensionService');
  const dimensions = dimensionService.getDimensions();

  const recentNodes = query(`
    SELECT n.id, n.title, n.description,
           GROUP_CONCAT(nd.dimension) as dimensions
    FROM nodes n
    LEFT JOIN node_dimensions nd ON n.id = nd.node_id
    GROUP BY n.id
    ORDER BY n.created_at DESC
    LIMIT 5
  `);

  const hubNodes = query(`
    SELECT n.id, n.title, n.description, COUNT(e.id) as edge_count
    FROM nodes n
    LEFT JOIN edges e ON n.id = e.from_node_id OR n.id = e.to_node_id
    GROUP BY n.id
    ORDER BY edge_count DESC
    LIMIT 5
  `);

  return {
    stats: { nodeCount, edgeCount, dimensionCount: dimensions.length, contextCount: contextService.listContexts().length },
    contexts: contextService.listContexts(),
    dimensions,
    recentNodes,
    hubNodes
  };
}

module.exports = {
  getNodes,
  getNodeById,
  createNode,
  updateNode,
  deleteNode,
  getNodeCount,
  getContext
};
