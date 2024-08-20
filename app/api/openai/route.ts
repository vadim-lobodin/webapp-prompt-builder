import { NextResponse } from 'next/server';
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.NEXT_PUBLIC_OPENAI_API_KEY,
});

export async function POST(request: Request) {
  if (!process.env.NEXT_PUBLIC_OPENAI_API_KEY) {
    return NextResponse.json({ error: "OpenAI API key not configured" }, { status: 500 });
  }

  try {
    const body = await request.json();
    const { model, messages, max_tokens } = body;

    const completion = await openai.chat.completions.create({
      model,
      messages,
      max_tokens,
    });

    return NextResponse.json(completion.choices[0]);
  } catch (error: any) {
    console.error('OpenAI API error:', error);
    return NextResponse.json({ error: error.message || 'An error occurred' }, { status: 500 });
  }
}