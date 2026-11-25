import * as crypto from 'crypto';

export const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
};

/**
 * Sign JWT using native Node.js crypto (HS256)
 */
export function signJwt(payload: Record<string, any>, secret: string): string {
  const header = { alg: 'HS256', typ: 'JWT' };
  const encodedHeader = Buffer.from(JSON.stringify(header)).toString('base64url');
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto
    .createHmac('sha256', secret)
    .update(`${encodedHeader}.${encodedPayload}`)
    .digest('base64url');
  return `${encodedHeader}.${encodedPayload}.${signature}`;
}

/**
 * Verify and decode JWT token using HS256 HMAC
 */
export function verifyJwt(token: string, secret: string): { email?: string; [key: string]: any } | null {
  try {
    const [headerB64, payloadB64, signatureB64] = token.split('.');
    if (!headerB64 || !payloadB64 || !signatureB64) return null;
    const signature = crypto
      .createHmac('sha256', secret)
      .update(`${headerB64}.${payloadB64}`)
      .digest('base64url');
    if (signature !== signatureB64) return null;
    return JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
}
