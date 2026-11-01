import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    state: "done",
    message: "Pre-computed 10-year Nifty 50 analysis ready",
    log: ["Dataset: Nifty 50 (2015–2025)", "Models: GARCH(1,1), EGARCH(1,1)"],
    started: null,
    finished: null,
  });
}
