import { NextResponse } from "next/server";
import results from "@/data/results.json";

export async function GET() {
  return NextResponse.json(results);
}
