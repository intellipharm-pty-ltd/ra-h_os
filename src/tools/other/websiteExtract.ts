import { tool } from 'ai';
import { z } from 'zod';
import { openai } from '@ai-sdk/openai';
import { generateText } from 'ai';
import { extractWebsite } from '@/services/typescript/extractors/website';
import { getInternalApiBaseUrl } from '@/services/runtime/apiBase';
import { formatNodeForChat } from '../infrastructure/nodeFormatter';
import { validateExplicitDescription } from '@/services/database/quality';

interface ExistingDimension {
  name: string;
  description: string | null;
}

function ensureNodeDescription(candidate: string | undefined, fallbackLead: string): string {
  const normalizedCandidate = typeof candidate === 'string' ? candidate.trim().replace(/\s+/g, ' ') : '';
  if (normalizedCandidate && !validateExplicitDescription(normalizedCandidate)) {
    return normalizedCandidate.slice(0, 500);
  }
  const lead = normalizedCandidate || fallbackLead.trim();
  const suffix = 'It was added via extraction and the exact reason it belongs in the graph is not yet inferred from the available context, and it has not been reviewed yet.';
  return `${lead}${/[.!?]$/.test(lead) ? ' ' : '. '}${suffix}`.slice(0, 500);
}

function inferWebsiteContentType(url: string): 'website' | 'tweet' {
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    return hostname === 'x.com' || hostname.endsWith('.x.com') || hostname === 'twitter.com' || hostname.endsWith('.twitter.com')
      ? 'tweet'
      : 'website';
  } catch {
    return 'website';
  }
}

async function fetchExistingDimensions(): Promise<ExistingDimension[]> {
  try {
    const response = await fetch(`${getInternalApiBaseUrl()}/api/dimensions/popular`);
    if (!response.ok) return [];
    const result = await response.json();
    if (!Array.isArray(result.data)) return [];
    return result.data
      .map((dimension: { dimension?: unknown; description?: unknown }) => ({
        name: typeof dimension.dimension === 'string' ? dimension.dimension.trim() : '',
        description: typeof dimension.description === 'string' ? dimension.description.trim() : null
      }))
      .filter((dimension: ExistingDimension) => dimension.name.length > 0);
  } catch (error) {
    console.warn('Website dimension fetch fallback (no dimension context):', error);
    return [];
  }
}

function selectExistingDimensions(selected: unknown, existingDimensions: ExistingDimension[], max = 5): string[] {
  if (!Array.isArray(selected) || existingDimensions.length === 0) return [];
  const byLowerName = new Map(existingDimensions.map((dimension) => [dimension.name.toLowerCase(), dimension.name]));
  const normalized: string[] = [];
  const seen = new Set<string>();
  for (const value of selected) {
    if (typeof value !== 'string') continue;
    const matched = byLowerName.get(value.trim().toLowerCase());
    if (!matched) continue;
    const key = matched.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    normalized.push(matched);
    if (normalized.length >= max) break;
  }
  return normalized;
}

async function analyzeContentWithAI(title: string, description: string, contentType: string, existingDimensions: ExistingDimension[]) {
  try {
    const availableDimensionsBlock = existingDimensions.length > 0
      ? existingDimensions.map((dimension) => `- ${dimension.name}${dimension.description ? `: ${dimension.description}` : ''}`).join('\n')
      : '- No existing dimensions available. Return an empty dimensions array.';
    const prompt = `Analyze this ${contentType} content and provide classification.

Title: "${title}"
Description: "${description}"

CRITICAL — nodeDescription rules (max 500 chars):
1. Write natural prose, not labels or a checklist.
2. Make clear what this literally is using explicit entity words only.
3. Name the author/site if known from the metadata.
4. State the actual claim or thesis.
5. Make clear why it belongs in the graph. If that remains unclear, say so naturally.
6. Make workflow status clear.

Available dimensions:
${availableDimensionsBlock}

Respond with ONLY valid JSON:
{
  "enhancedDescription": "A comprehensive summary.",
  "nodeDescription": "<your natural description>",
  "dimensions": ["existing-dimension-1"],
  "reasoning": "Brief explanation"
}`;
    const response = await generateText({
      model: openai('gpt-4o-mini'),
      prompt,
      maxOutputTokens: 800
    });
    const content = (response.text || '{}').replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    const result = JSON.parse(content);
    return {
      enhancedDescription: result.enhancedDescription || description,
      nodeDescription: typeof result.nodeDescription === 'string' ? result.nodeDescription.slice(0, 500) : undefined,
      dimensions: selectExistingDimensions(result.dimensions, existingDimensions, 5),
      reasoning: result.reasoning || 'AI analysis completed'
    };
  } catch (error) {
    console.warn('Website analysis fallback (using default description):', error);
    return { enhancedDescription: description, nodeDescription: undefined, dimensions: [], reasoning: 'Fallback description used' };
  }
}

export const websiteExtractTool = tool({
  description: 'Extract website content and metadata into a node with summary, tags, and raw source text',
  inputSchema: z.object({
    url: z.string().describe('The website URL to add to knowledge base'),
    title: z.string().optional().describe('Custom title (auto-generated if not provided)'),
    dimensions: z.array(z.string()).min(1).max(5).optional().describe('Dimension tags to apply to the created node')
  }),
  execute: async ({ url, title, dimensions }) => {
    try {
      if (!url.startsWith('http://') && !url.startsWith('https://')) {
        return { success: false, error: 'Invalid URL format - must start with http:// or https://', data: null };
      }

      let result: { success: boolean; source?: string; metadata?: any; error?: string };
      try {
        const extractionResult = await extractWebsite(url);
        result = {
          success: true,
          source: extractionResult.chunk || extractionResult.content,
          metadata: {
            title: extractionResult.metadata.title,
            author: extractionResult.metadata.author,
            date: extractionResult.metadata.date,
            description: extractionResult.metadata.description,
            og_image: extractionResult.metadata.og_image,
            site_name: extractionResult.metadata.site_name,
            extraction_method: 'typescript'
          }
        };
      } catch (error: any) {
        result = { success: false, error: error.message || 'TypeScript extraction failed' };
      }

      if (!result.success || !result.source) {
        return { success: false, error: result.error || 'Failed to extract website content', data: null };
      }

      const existingDimensions = await fetchExistingDimensions();
      const aiAnalysis = await analyzeContentWithAI(
        result.metadata?.title || `Website: ${new URL(url).hostname}`,
        result.source.substring(0, 2000) || 'Website content',
        inferWebsiteContentType(url),
        existingDimensions
      );

      const nodeTitle = title || result.metadata?.title || `Website: ${new URL(url).hostname}`;
      const suppliedDimensions = Array.isArray(dimensions) ? dimensions.slice(0, 5) : [];
      const finalDimensions = suppliedDimensions.length > 0 ? suppliedDimensions : (aiAnalysis?.dimensions || []).slice(0, 5);
      const nodeDescription = ensureNodeDescription(
        aiAnalysis?.nodeDescription,
        `Website article from ${result.metadata?.site_name || new URL(url).hostname} titled ${nodeTitle}`
      );

      const createResponse = await fetch(`${getInternalApiBaseUrl()}/api/nodes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: nodeTitle,
          description: nodeDescription,
          source: result.source,
          link: url,
          dimensions: finalDimensions,
          metadata: {
            type: inferWebsiteContentType(url),
            state: 'not_processed',
            captured_method: 'website_extract',
            captured_by: 'agent',
            source_metadata: {
              hostname: new URL(url).hostname,
              author: result.metadata?.author,
              site_name: result.metadata?.site_name,
              date: result.metadata?.date,
              og_image: result.metadata?.og_image,
              extraction_method: result.metadata?.extraction_method,
              ai_analysis: aiAnalysis?.reasoning,
              refined_at: new Date().toISOString()
            }
          }
        })
      });

      const createResult = await createResponse.json();
      if (!createResponse.ok) {
        return { success: false, error: createResult.error || 'Failed to create node', data: null };
      }

      const actualDimensions: string[] = createResult.data?.dimensions || finalDimensions || [];
      const formattedNode = createResult.data?.id
        ? formatNodeForChat({ id: createResult.data.id, title: nodeTitle, dimensions: actualDimensions })
        : nodeTitle;

      return {
        success: true,
        message: `Added ${formattedNode} with dimensions: ${actualDimensions.length > 0 ? actualDimensions.join(', ') : 'none'}`,
        data: {
          nodeId: createResult.data?.id,
          title: nodeTitle,
          contentLength: result.source.length,
          url,
          dimensions: actualDimensions
        }
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to extract website content',
        data: null
      };
    }
  }
});
