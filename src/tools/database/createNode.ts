import { tool } from 'ai';
import { z } from 'zod';
import { getInternalApiBaseUrl } from '@/services/runtime/apiBase';
import { formatNodeForChat } from '../infrastructure/nodeFormatter';
import { normalizeDimensions } from '@/services/database/quality';

function extractTextFromMessageContent(content: unknown): string {
  if (typeof content === 'string') {
    return content;
  }

  if (!Array.isArray(content)) {
    return '';
  }

  return content
    .map((part) => {
      if (!part || typeof part !== 'object') return '';
      const candidate = part as Record<string, unknown>;
      if (typeof candidate.text === 'string') return candidate.text;
      if (candidate.type === 'text' && typeof candidate.value === 'string') return candidate.value;
      return '';
    })
    .filter(Boolean)
    .join('\n');
}

function inferSourceFromContext(params: { title: string; description?: string; source?: string }, context: any): string | undefined {
  if (typeof params.source === 'string' && params.source.trim()) {
    return params.source.trim();
  }

  const messages = Array.isArray(context?.messages) ? context.messages : [];
  const latestUserMessage = [...messages].reverse().find((message: any) => message?.role === 'user');
  if (!latestUserMessage) {
    return undefined;
  }

  const rawUserText = extractTextFromMessageContent(latestUserMessage.content).trim();
  if (!rawUserText) {
    return undefined;
  }

  if (/^https?:\/\//i.test(rawUserText)) {
    return undefined;
  }

  const normalized = rawUserText.replace(/\r\n/g, '\n').trim();
  const descriptionLength = typeof params.description === 'string' ? params.description.trim().length : 0;
  const isSubstantialCapture = normalized.length >= Math.max(280, descriptionLength + 120) || normalized.includes('\n');

  if (!isSubstantialCapture) {
    return undefined;
  }

  return normalized;
}

export const createNodeTool = tool({
  description: 'Create node. Set the primary context explicitly when it is clear; otherwise the server will infer the best-fit context automatically so the node is not left unscoped. Infer a clean title, dimensions, and natural description with best effort. When the node comes from the user\'s own idea, note, or dictated thought, preserve their actual wording in source with only minimal cleanup instead of flattening it into a summary. Do not block creation if the description is incomplete. If the description framing is materially inferred, create the node first and then invite one concise user correction pass.',
  inputSchema: z.object({
    title: z.string().describe('The title of the node'),
    description: z.string().max(500).optional().describe('Optional natural description. If you have enough context, describe what this is, why it belongs in Brad\'s graph, and its current workflow status in normal prose. Do not use labels like WHAT:, WHY:, or STATUS:.'),
    source: z.string().optional().describe('Canonical source content for embedding. For external content, store the actual transcript/article/document text. For user-authored ideas or dictated notes, store the user\'s original wording as fully as possible with only minimal cleanup such as obvious whitespace or transcription artifacts. Do not replace raw user thinking with a thin summary.'),
    link: z.string().optional().describe('A URL link to the source'),
    event_date: z.string().optional().describe('When the thing actually happened (ISO 8601). Not when it was added to the graph.'),
    context_id: z.number().int().positive().nullable().optional().describe('Optional primary context ID. Use when the node clearly belongs to a known context.'),
    context_name: z.string().optional().describe('Optional convenience context name. Resolved to a stable context_id before persistence.'),
    dimensions: z
      .array(z.string())
      .max(5)
      .optional()
      .describe('Optional secondary dimension tags to apply to this node (0-5 items).'),
    metadata: z.record(z.any()).optional().describe('Optional node metadata. Use canonical keys when known: type, state, captured_method, captured_by, and source_metadata. Source-specific facts belong inside source_metadata.')
  }),
  execute: async (params, context) => {
    console.log('🎯 CreateNode tool called with params:', JSON.stringify(params, null, 2));
    try {
      const trimmedDimensions = normalizeDimensions(params.dimensions || [], 5);
      const canonicalSource = inferSourceFromContext(params, context);

      const response = await fetch(`${getInternalApiBaseUrl()}/api/nodes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...params, source: canonicalSource, dimensions: trimmedDimensions })
      });

      const result = await response.json();

      if (!response.ok) {
        return {
          success: false,
          error: result.error || 'Failed to create node',
          data: null
        };
      }

      return {
        success: true,
        data: result.data,
        message: `Created: ${formatNodeForChat(result.data)}`
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to create node',
        data: null
      };
    }
  }
});

export const createItemTool = createNodeTool;
