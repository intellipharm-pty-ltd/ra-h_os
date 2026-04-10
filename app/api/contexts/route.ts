import { NextRequest, NextResponse } from 'next/server';
import { contextService } from '@/services/database';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const contexts = await contextService.listContexts();
    return NextResponse.json({ success: true, data: contexts });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Failed to fetch contexts' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const context = await contextService.createContext({
      name: body.name,
      description: body.description,
      icon: body.icon,
    });
    return NextResponse.json({ success: true, data: context }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Failed to create context' }, { status: 400 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    if (typeof body.id !== 'number' || !Number.isInteger(body.id) || body.id <= 0) {
      return NextResponse.json({ success: false, error: 'Context id is required' }, { status: 400 });
    }

    const context = await contextService.updateContext({
      id: body.id,
      name: body.name,
      description: body.description,
      icon: body.icon,
    });

    return NextResponse.json({ success: true, data: context });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Failed to update context' }, { status: 400 });
  }
}
