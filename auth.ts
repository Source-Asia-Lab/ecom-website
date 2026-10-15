import NextAuth from "next-auth";
import Google from "next-auth/providers/google";

const googleConfigured = Boolean(
  process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET,
);

function isStaffEmail(email: string | null | undefined): boolean {
  if (!email) return false;

  const staffEmails = new Set(
    (process.env.AUTH_STAFF_EMAILS ?? "")
      .split(",")
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean),
  );

  return staffEmails.has(email.toLowerCase());
}

export const { handlers, auth } = NextAuth({
  providers: googleConfigured
    ? [
        Google({
          clientId: process.env.AUTH_GOOGLE_ID!,
          clientSecret: process.env.AUTH_GOOGLE_SECRET!,
        }),
      ]
    : [],
  secret: process.env.AUTH_SECRET,
  trustHost: process.env.AUTH_TRUST_HOST === "true",
  session: {
    strategy: "jwt",
    maxAge: 8 * 60 * 60,
  },
  callbacks: {
    signIn({ account, profile }) {
      return account?.provider === "google" &&
        profile?.email_verified === true &&
        typeof profile.email === "string";
    },
    jwt({ token, profile }) {
      token.role = isStaffEmail(token.email) ? "staff" : "customer";
      if (profile && "email_verified" in profile) {
        token.email_verified = Boolean(profile.email_verified);
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = token.sub ?? "";
        session.user.role = token.role === "staff" ? "staff" : "customer";
        session.user.email_verified = token.email_verified === true;
      }
      return session;
    },
  },
});