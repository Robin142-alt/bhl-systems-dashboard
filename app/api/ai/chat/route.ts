import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  const AI_SERVICE_URL = process.env.AI_SERVICE_URL;

  // If no AI service is configured, return a graceful fallback
  if (!AI_SERVICE_URL) {
    return NextResponse.json({ 
      reply: "AI service is not configured. Please set the AI_SERVICE_URL environment variable to enable AI features." 
    });
  }

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
      return NextResponse.json({ 
        reply: "I'm sorry, I'm currently experiencing technical difficulties connecting to my neural network." 
      }, { status: 500 });
    }

    const data = await response.json();
    return NextResponse.json(data);
    
  } catch (error) {
    console.error("AI Proxy Error:", error);
    return NextResponse.json({ 
      reply: "AI service is temporarily unavailable. Please try again later." 
    }, { status: 500 });
  }
}
