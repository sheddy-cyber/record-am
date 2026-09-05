# Authentication setup

The hosted Supabase project is configured for password sign-in, account confirmation, and password recovery.

## Applied hosted configuration

- Email/password authentication is enabled and email confirmation is required before password sign-in.
- Redirects are limited to `recordam://auth-callback**`; the site URL is `recordam://auth-callback`.
- Passwords require at least **8 characters**. The app also requires a letter and a number or symbol.
- Email OTPs are **6 digits** and expire in **15 minutes**.
- Confirmation and recovery emails include both `{{ .ConfirmationURL }}` and `{{ .Token }}`.
- Refresh-token rotation, secure email changes, password-change alerts, and email-change alerts are enabled.
- OTP verification is limited to 10 attempts per interval.

For Expo Go/development, add the exact development callback URL printed by `Linking.createURL('auth-callback')` to the hosted redirect allowlist before testing email links there.

## Remaining production prerequisites

Two controls cannot be enabled without account-level information that is not in this workspace:

- **Custom SMTP:** no SMTP provider credentials are configured. Add a verified production sender before inviting real users; the default Supabase sender is not suitable for production delivery.
- **CAPTCHA/bot protection:** enabling hCaptcha or Turnstile requires that provider's secret key.

While the built-in Supabase mailer is in use, signup confirmations and password-reset emails share a project-wide limit of **two emails per hour**. The app's 60-second resend timer prevents accidental repeats but cannot override that hosted limit. Configure custom SMTP when you are ready to test email flows more frequently.

Breached-password protection was not enabled because this Supabase project is not on a plan that includes the HaveIBeenPwned integration.

## Link and code emails

The app accepts either a secure email link or a six-digit verification code. In **Authentication → Email Templates**, configure the **Confirm signup** and **Reset Password** templates to include the appropriate link and, if code entry is wanted, the code token.

```html
<a href="{{ .ConfirmationURL }}">Verify securely</a>
<p>Your verification code: <strong>{{ .Token }}</strong></p>
```

The token is short-lived and must never be logged or stored by the app. If a template contains only the confirmation link, the flow still works; the code field is simply an optional fallback for templates that include `{{ .Token }}`.

## Security behavior in the app

- Cached profile and business data no longer authorizes a user when their Supabase session is absent.
- Resending is throttled in the UI for 60 seconds; Supabase enforces its own rate limits too.
- Reset links/codes must establish a recovery session before the password-update screen is available.
- Mobile email links use PKCE, so the one-time recovery code is returned in the callback URL query and can be exchanged securely by the app.
