import NextAuth from 'next-auth';
import Keycloak from 'next-auth/providers/keycloak';
import Credentials from 'next-auth/providers/credentials';

const isDevMode = process.env.DEV_MODE === 'true';

// In dev mode, use a simple credentials provider that auto-logs in
const devProvider = Credentials({
  name: 'Development',
  credentials: {},
  async authorize() {
    return {
      id: 'dev-user',
      name: 'Developer',
      email: 'dev@localhost',
    };
  },
});

// In production, use Keycloak
const keycloakProvider = Keycloak({
  clientId: process.env.KEYCLOAK_CLIENT_ID || '',
  clientSecret: process.env.KEYCLOAK_CLIENT_SECRET || '',
  issuer: process.env.KEYCLOAK_URL && process.env.KEYCLOAK_REALM
    ? `${process.env.KEYCLOAK_URL}/realms/${process.env.KEYCLOAK_REALM}`
    : undefined,
});

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: isDevMode ? [devProvider] : [keycloakProvider],
  callbacks: {
    async jwt({ token, profile, user }) {
      if (profile) {
        token.name = profile.name || profile.preferred_username;
        token.email = profile.email;
      }
      // For dev mode credentials provider
      if (user) {
        token.name = user.name;
        token.email = user.email;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.name = token.name as string;
        session.user.email = token.email as string;
      }
      return session;
    },
  },
  pages: {
    signIn: '/login',
  },
  trustHost: true,
});
