import { NextRequest } from 'next/server';
import { jsonOk, jsonError } from '@/lib/helpers';

// ── POST /api/auth — Admin login ──
// Body: { password: "admin" }
// Returns a session token (the API_SECRET_KEY) for subsequent admin requests.
export async function POST(request: NextRequest) {
  let body: any;
  try { body = await request.json(); } catch { return jsonError('Invalid JSON', 400); }

  const password = body.password || '';
  const adminPassword = process.env.ADMIN_PASSWORD || 'admin';

  if (password !== adminPassword) {
    return jsonError('Invalid password', 401);
  }

  // Return the API secret as a session token for admin API calls
  return jsonOk({
    success: true,
    token: process.env.API_SECRET_KEY || 'dev-token',
    message: 'Authenticated',
  });
}
