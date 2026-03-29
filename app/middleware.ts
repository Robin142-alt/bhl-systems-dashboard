import { withAuth } from "next-auth/middleware";

export default withAuth({
  // This tells the guard where the login page is
  pages: {
    signIn: "/login",
  },
});

// This tells the guard WHICH pages to protect
export const config = { 
  // This says: "Protect everything EXCEPT the login page itself"
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|login).*)"],
};