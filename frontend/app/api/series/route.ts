import { NextResponse } from "next/server";
import series from "@/data/series.json";

export async function GET() {
  return NextResponse.json(series);
}
