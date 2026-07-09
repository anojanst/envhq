import { NextResponse } from "next/server";

export function json<T>(data: T, status = 200) {
  return NextResponse.json(data, { status });
}

export function apiError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export const unauthorized = () => apiError("Unauthorized", 401);
export const notFound = (what = "Not found") => apiError(what, 404);
export const badRequest = (message: string) => apiError(message, 400);
export const conflict = (message: string) => apiError(message, 409);
