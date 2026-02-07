import { DefaultSession, DefaultUser } from 'next-auth';
import { JWT, DefaultJWT } from 'next-auth/jwt';

declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      tier: 'FREE' | 'ULTRA';
      email: string;
      name?: string | null;
    } & DefaultSession['user'];
  }

  interface User extends DefaultUser {
    id: string;
    tier: 'FREE' | 'ULTRA';
  }
}

declare module 'next-auth/jwt' {
  interface JWT extends DefaultJWT {
    id: string;
    tier: 'FREE' | 'ULTRA';
  }
}
