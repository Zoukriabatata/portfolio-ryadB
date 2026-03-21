import { DefaultSession, DefaultUser } from 'next-auth';
import { JWT, DefaultJWT } from 'next-auth/jwt';

declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      email: string;
      name: string | null;
      image?: string | null;
      tier: 'FREE' | 'ULTRA';
      deviceId: string;
      sessionId: string;
      hasResearchPack: boolean;
    };
  }

  interface User extends DefaultUser {
    id: string;
    tier: 'FREE' | 'ULTRA';
    deviceId?: string;
    sessionId?: string;
    hasResearchPack?: boolean;
  }
}

declare module 'next-auth/jwt' {
  interface JWT extends DefaultJWT {
    id: string;
    email: string;
    name: string | null;
    picture?: string | null;
    tier: 'FREE' | 'ULTRA';
    deviceId: string;
    sessionId: string;
    hasResearchPack: boolean;
  }
}
