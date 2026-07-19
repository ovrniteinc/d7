export function formatAuthError(
  error: unknown,
  context: "login" | "password" = "login",
): string {
  const code = (error as { code?: string })?.code;

  switch (code) {
    case "auth/invalid-credential":
    case "auth/wrong-password":
    case "auth/user-not-found":
    case "auth/invalid-login-credentials":
      return context === "login"
        ? "Incorrect email or password. Check your credentials and try again."
        : "Could not update your password. Sign in again and retry.";
    case "auth/invalid-email":
      return "Enter a valid email address.";
    case "auth/user-disabled":
      return "This account has been deactivated. Contact your administrator.";
    case "auth/too-many-requests":
      return "Too many sign-in attempts. Wait a moment and try again.";
    case "auth/network-request-failed":
      return "Network error. Check your connection and try again.";
    case "auth/weak-password":
      return "Password is too weak. Use at least 8 characters.";
    case "auth/requires-recent-login":
      return "For security, sign in again and retry.";
    default:
      return context === "login"
        ? "Could not sign in. Please try again."
        : "Something went wrong. Please try again.";
  }
}
