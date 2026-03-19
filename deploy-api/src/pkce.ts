// PKCE helpers using Web Crypto API (CF Workers compatible)

import { base64UrlEncode } from "./base64url.ts";

export async function generateCodeVerifier(): Promise<string> {
  const buffer = new Uint8Array(32);
  crypto.getRandomValues(buffer);
  return base64UrlEncode(buffer.buffer);
}

export async function generateCodeChallenge(verifier: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return base64UrlEncode(digest);
}
