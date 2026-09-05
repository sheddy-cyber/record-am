import * as Linking from 'expo-linking';

export type AuthFlow = 'signup' | 'login' | 'recovery';

export const AUTH_CALLBACK_PATH = 'auth-callback';
export const EMAIL_CODE_LENGTH = 6;
export const AUTH_RESEND_COOLDOWN_SECONDS = 60;

export function normaliseEmail(value: string) {
  return value.trim().toLowerCase();
}

export function isValidEmail(value: string) {
  // This deliberately checks the shape only. The confirmation email is the
  // authoritative proof that an address is owned by the person using it.
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normaliseEmail(value));
}

export function getAuthCallbackUrl(flow: AuthFlow) {
  const callbackUrl = Linking.createURL(AUTH_CALLBACK_PATH);
  const separator = callbackUrl.includes('?') ? '&' : '?';
  return `${callbackUrl}${separator}flow=${flow}`;
}

export function getPasswordError(password: string) {
  if (password.length < 8) return 'Use at least 8 characters.';
  if (!/[A-Za-z]/.test(password) || !/[0-9\W_]/.test(password)) {
    return 'Include letters and a number or symbol.';
  }
  return undefined;
}

export function formatAuthError(error: unknown, fallback = 'We could not complete that request. Please try again.') {
  const message = error instanceof Error ? error.message : String(error ?? '');
  const normalized = message.toLowerCase();

  if (normalized.includes('invalid login credentials')) {
    return 'Incorrect email or password.';
  }
  if (normalized.includes('email not confirmed')) {
    return 'Confirm your email before signing in.';
  }
  if (normalized.includes('email rate limit') || normalized.includes('over_email_send_rate_limit')) {
    return 'Email sending is temporarily rate-limited. Please try again later.';
  }
  if (normalized.includes('rate limit') || normalized.includes('too many requests')) {
    return 'Too many requests were made. Please wait a minute and try again.';
  }
  if (normalized.includes('network request failed') || normalized.includes('failed to fetch')) {
    return 'Check your internet connection and try again.';
  }
  if (normalized.includes('expired') || normalized.includes('invalid otp') || normalized.includes('token has expired')) {
    return 'That code or link is invalid or has expired. Request a new one and try again.';
  }
  if (normalized.includes('password should be')) {
    return 'Your password does not meet this project’s security requirements.';
  }

  return message || fallback;
}

export function getAuthFlow(value: unknown): AuthFlow {
  return value === 'signup' || value === 'recovery' || value === 'login' ? value : 'login';
}

export function getFlowDestination(flow: AuthFlow) {
  if (flow === 'recovery') return '/(auth)/reset-password';
  return '/';
}
