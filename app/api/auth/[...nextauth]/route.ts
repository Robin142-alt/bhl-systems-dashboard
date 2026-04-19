import NextAuth, { NextAuthOptions, DefaultSession } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";

// --- TYPE AUGMENTATIONS ---
// We define 'id' and 'role' so the app knows these exist on our users
declare module "next-auth" {
  interface Session {
    user: {
      id?: string;   
      role?: string; 
    } & DefaultSession["user"];
  }

  interface User {
    id?: string;   
    role?: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;   
    role?: string;
  }
}
// ----------------------------------------


export const authOptions: NextAuthOptions = {
  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "text" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null;
        }

        try {
          const user = await prisma.user.findUnique({
            where: { email: credentials.email },
          });

          if (!user) return null;

          const isPasswordCorrect = await bcrypt.compare(credentials.password, user.password);

          if (isPasswordCorrect) {
            return {
              id: user.id.toString(),
              email: user.email,
              role: user.role,
            };
          }
        } catch (err) {
          console.error('[AUTH] Error during authorize:', err);
        }
        
        return null;
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;     
        token.role = user.role; 
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id;     
        session.user.role = token.role as string; 
      }
      return session;
    },
  },
  pages: {
    signIn: "/login",
  },
  secret: process.env.NEXTAUTH_SECRET,
  // Mirror the secureCookie logic in middleware.ts exactly.
  // VERCEL=1 is auto-injected on all Vercel deployments (prod + preview),
  // ensuring the API route and middleware always agree on the cookie name:
  //   Vercel  → __Secure-next-auth.session-token
  //   Local   → next-auth.session-token
  useSecureCookies: process.env.VERCEL === "1",
  debug: process.env.NODE_ENV === "development",
};

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };