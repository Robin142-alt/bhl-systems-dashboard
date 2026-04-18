import { NextResponse } from 'next/server';

const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://127.0.0.1:8000';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    
    // Forward the request to the Python AI Microservice
    const response = await fetch(`${AI_SERVICE_URL}/api/v1/chat/query`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      console.error("AI Service Error:", await response.text());
      return NextResponse.json({ reply: "I'm sorry, I'm currently experiencing technical difficulties connecting to my neural network." }, { status: 500 });
    }

    const data = await response.json();
    return NextResponse.json(data);
    
  } catch (error) {
    console.error("Next.js AI Proxy Error:", error);
    return NextResponse.json({ reply: "Error communicating with AI service." }, { status: 500 });
  }
}
