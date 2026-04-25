import { type NextRequest, NextResponse } from "next/server";
import { buildCorsHeadersFromRequest } from "@/lib/cors-helpers";

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

const corsHeaders = (request?: NextRequest) =>
  buildCorsHeadersFromRequest(request, {
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  });

export async function POST(request: NextRequest) {
  const headers = corsHeaders(request);

  try {
    const { prompt, useRAG, history } = await request.json();

    if (!prompt) {
      return NextResponse.json(
        { error: "Prompt is required" },
        { status: 400, headers }
      );
    }

    const response = await fetch(
      "https://rag-chatbot-psi-kohl.vercel.app/api/generate",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, useRAG, history }),
      }
    );

    if (!response.ok) {
      throw new Error(`RAG service error: ${response.status}`);
    }

    const data = await response.json();
    return NextResponse.json(data, { headers });

  } catch (error) {
    console.error("[RAG Proxy]", error);
    return NextResponse.json(
      { error: "Failed to reach Genie" },
      { status: 500, headers }
    );
  }
}

export async function OPTIONS(request: NextRequest) {
  return NextResponse.json(
    {},
    { headers: corsHeaders(request) }
  );
}