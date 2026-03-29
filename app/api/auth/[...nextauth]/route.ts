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
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "text" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        const user = await prisma.user.findUnique({
          where: { email: credentials.email },
        });

        if (user) {
          // Check if password is correct (works for both hashed and plain text for now)
          const isPasswordCorrect = bcrypt.compareSync(credentials.password, user.password) || 
                                   credentials.password === user.password;

          if (isPasswordCorrect) {
            return {
              id: user.id.toString(),
              email: user.email,
              role: user.role,
            };
          }
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