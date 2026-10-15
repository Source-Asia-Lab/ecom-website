import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: DefaultSession["user"] & {
      id: string;
      role: "customer" | "staff";
      email_verified?: boolean;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    role?: "customer" | "staff";
    email_verified?: boolean;
  }
}