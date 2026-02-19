/**
 * Builds session cookie string with conditional Secure flag for production.
 * Includes both Max-Age and Expires for cross-browser consistency.
 * @param token Session token value
 * @param maxAge Max-Age in seconds (0 for logout)
 * @returns Complete Set-Cookie header value
 */
export function buildSessionCookie(token: string, maxAge: number = 604800): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  const expiresDate = new Date(Date.now() + maxAge * 1000).toUTCString();
  return `session=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}; Expires=${expiresDate}${secure}`;
}
