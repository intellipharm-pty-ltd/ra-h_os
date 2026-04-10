import { NextRequest, NextResponse } from 'next/server';
import { contextService } from '@/services/database';

export const runtime = 'nodejs';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const contextId = parseInt(id, 10);
    if (Number.isNaN(contextId)) {
      return NextResponse.json({ success: false, error: 'Invalid context ID' }, { status: 400 });
    }

    const context = await contextService.getContextById(contextId);
    if (!context) {
      return NextResponse.json({ success: false, error: 'Context not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: context });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Failed to fetch context' }, { status: 500 });
  }
}
