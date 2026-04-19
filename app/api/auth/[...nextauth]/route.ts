import NextAuth, { NextAuthOptions, DefaultSession } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";



// --- TEACHING THE COMPUTER NEW WORDS ---
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
  },
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "text" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        console.log('[AUTH] authorize called with email:', credentials?.email);
        if (!credentials?.email || !credentials?.password) {
          console.log('[AUTH] Missing credentials');
          return null;
        }

        try {
          const user = await prisma.user.findUnique({
            where: { email: credentials.email },
          });

          console.log('[AUTH] User found:', !!user, user ? `role=${user.role}` : '');

          if (user) {
            const isPasswordCorrect = await bcrypt.compare(credentials.password, user.password);
            console.log('[AUTH] Password match:', isPasswordCorrect);

            if (isPasswordCorrect) {
              return {
                id: user.id.toString(),
                email: user.email,
                role: user.role,
              };
            }
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
        // We use @ts-expect-error because NextAuth's default types are a bit stubborn
        
      
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
};

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };