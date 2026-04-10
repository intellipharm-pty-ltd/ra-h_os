import { tool } from 'ai';
import { z } from 'zod';
import { openai } from '@ai-sdk/openai';
import { generateText } from 'ai';
import { extractPaper } from '@/services/typescript/extractors/paper';
import { getInternalApiBaseUrl } from '@/services/runtime/apiBase';
import { formatNodeForChat } from '../infrastructure/nodeFormatter';
import { validateExplicitDescription } from '@/services/database/quality';

function ensureNodeDescription(candidate: string | undefined, fallbackLead: string): string {
  const normalizedCandidate = typeof candidate === 'string' ? candidate.trim().replace(/\s+/g, ' ') : '';
  if (normalizedCandidate && !validateExplicitDescription(normalizedCandidate)) {
    return normalizedCandidate.slice(0, 500);
  }
  const lead = normalizedCandidate || fallbackLead.trim();
  const suffix = 'It was added via extraction and the exact reason it belongs in the graph is not yet inferred from the available context, and it has not been reviewed yet.';
  return `${lead}${/[.!?]$/.test(lead) ? ' ' : '. '}${suffix}`.slice(0, 500);
}

async function analyzeContentWithAI(title: string, description: string, contentType: string) {
  try {
    const prompt = `Analyze this ${contentType} content and provide classification.

Title: "${title}"
Description: "${description}"

CRITICAL — nodeDescription rules (max 500 chars):
1. Write natural prose.
2. Make clear what this literally is.
3. State the actual finding, method, or contribution.
4. Make clear why it belongs in the graph. If unclear, say so naturally.
5. Make the workflow status clear.

Respond with ONLY valid JSON:
{
  "enhancedDescription": "A comprehensive summary.",
  "nodeDescription": "<your natural description>",
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
      reasoning: result.reasoning || 'AI analysis completed'
    };
  } catch (error) {
    console.warn('Paper analysis fallback (using default description):', error);
    return {
      enhancedDescription: description,
      nodeDescription: undefined,
      reasoning: 'Fallback description used'
    };
  }
}

export const paperExtractTool = tool({
  description: 'Extract a PDF or research paper into a node with summary, metadata, and full-text source',
  inputSchema: z.object({
    url: z.string().describe('The PDF URL to add to inbox'),
    title: z.string().optional().describe('Custom title (auto-generated if not provided)'),
    dimensions: z.array(z.string()).min(1).max(5).optional().describe('Dimension tags to apply to the created node')
  }),
  execute: async ({ url, title, dimensions }) => {
    try {
      if (!url.startsWith('http://') && !url.startsWith('https://')) {
        return { success: false, error: 'Invalid URL format - must start with http:// or https://', data: null };
      }

      if (!url.toLowerCase().includes('.pdf') && !url.includes('arxiv.org')) {
        return { success: false, error: 'URL does not appear to point to a PDF file', data: null };
      }

      let result: { success: boolean; source?: string; metadata?: any; error?: string };
      try {
        const extractionResult = await extractPaper(url);
        result = {
          success: true,
          source: extractionResult.chunk || extractionResult.content,
          metadata: {
            title: extractionResult.metadata.title,
            pages: extractionResult.metadata.pages,
            info: extractionResult.metadata.info,
            text_length: extractionResult.metadata.text_length,
            filename: extractionResult.metadata.filename,
            extraction_method: 'typescript'
          }
        };
      } catch (error: any) {
        result = { success: false, error: error.message || 'TypeScript extraction failed' };
      }

      if (!result.success || !result.source) {
        return { success: false, error: result.error || 'Failed to extract PDF content', data: null };
      }

      const aiAnalysis = await analyzeContentWithAI(
        result.metadata?.title || `PDF: ${new URL(url).pathname.split('/').pop()?.replace('.pdf', '')}`,
        result.source.substring(0, 2000) || 'PDF document content',
        'pdf'
      );

      const nodeTitle = title || result.metadata?.title || `PDF: ${new URL(url).pathname.split('/').pop()?.replace('.pdf', '')}`;
      const nodeDescription = ensureNodeDescription(
        aiAnalysis?.nodeDescription,
        `Research paper or PDF from ${new URL(url).hostname} titled ${nodeTitle}`
      );
      const trimmedDimensions = Array.isArray(dimensions) ? dimensions.slice(0, 5) : [];

      const createResponse = await fetch(`${getInternalApiBaseUrl()}/api/nodes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: nodeTitle,
          description: nodeDescription,
          source: result.source,
          link: url,
          dimensions: trimmedDimensions,
          metadata: {
            type: 'pdf',
            state: 'not_processed',
            captured_method: 'paper_extract',
            captured_by: 'agent',
            source_metadata: {
              hostname: new URL(url).hostname,
              author: result.metadata?.author || result.metadata?.info?.Author,
              pages: result.metadata?.pages,
              content_length: result.source.length,
              extraction_method: result.metadata?.extraction_method || 'typescript',
              ai_analysis: aiAnalysis?.reasoning,
              enhanced_description: aiAnalysis?.enhancedDescription,
              refined_at: new Date().toISOString()
            }
          }
        })
      });

      const createResult = await createResponse.json();
      if (!createResponse.ok) {
        return { success: false, error: createResult.error || 'Failed to create node', data: null };
      }

      const actualDimensions: string[] = createResult.data?.dimensions || trimmedDimensions || [];
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
        error: error instanceof Error ? error.message : 'Failed to extract PDF content',
        data: null
      };
    }
  }
});
