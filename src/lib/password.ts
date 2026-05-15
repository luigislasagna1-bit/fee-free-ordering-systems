// Shared password complexity validator. Used by /api/auth/register and
// /api/auth/reset-password so the rules stay identical across flows.

export function validatePassword(pw: string): string | null {
  if (typeof pw !== "string") return "Password is required";
  if (pw.length < 10) return "Password must be at least 10 characters";
  if (!/[A-Z]/.test(pw)) return "Password must contain at least one uppercase letter";
  if (!/[0-9]/.test(pw)) return "Password must contain at least one number";
  if (!/[^A-Za-z0-9]/.test(pw)) return "Password must contain at least one special character";
  return null;
}
