/**
 * Normalize Supabase email links before Expo Router selects its initial route.
 * A custom-scheme URL such as `recordam://auth-callback` uses the route as the
 * URL host on Android, so its tokens must be explicitly routed to this screen.
 */
export function redirectSystemPath({ path }: { path: string; initial: boolean }): string {
  try {
    const [pathAndQuery, fragment = ''] = path.split('#', 2);
    const [routePart, query = ''] = pathAndQuery.split('?', 2);
    const authPayload = [query, fragment].filter(Boolean).join('&');
    const lowerRoute = routePart.toLowerCase();
    const isAuthLink =
      lowerRoute.includes('auth-callback') ||
      lowerRoute.includes('reset-password') ||
      /(?:^|&)(?:code|access_token|refresh_token|token_hash|type|error)=/.test(authPayload);

    if (!isAuthLink) {
      return path;
    }

    // Supabase uses query parameters for PKCE and a hash fragment for implicit
    // flow. Expo Router does not expose fragments consistently, so preserve
    // both as query parameters for the callback screen.
    const hasFlow = /(?:^|&)flow=/.test(authPayload);
    const inferredFlow =
      /(?:^|&)type=recovery(?:&|$)/.test(authPayload) || lowerRoute.includes('reset-password')
        ? 'recovery'
        : /(?:^|&)type=signup(?:&|$)/.test(authPayload)
          ? 'signup'
          : 'login';
    const callbackParams = [authPayload, hasFlow ? '' : `flow=${inferredFlow}`].filter(Boolean).join('&');
    return callbackParams ? `/auth-callback?${callbackParams}` : '/auth-callback';
  } catch {
    // Native intent processing must never prevent the app from launching.
    return path;
  }
}
