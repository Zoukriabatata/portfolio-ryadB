import { DefaultSession, DefaultUser } from 'next-auth';
import { JWT, DefaultJWT } from 'next-auth/jwt';

declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      email: string;
      name: string | null;
      image?: string | null;
      tier: 'FREE' | 'PRO';
      deviceId: string;
      sessionId: string;
      hasResearchPack: boolean;
    };
  }

  interface User extends DefaultUser {
    id: string;
    tier: 'FREE' | 'PRO';
    deviceId?: string;
    sessionId?: string;
    hasResearchPack?: boolean;
    subscriptionEnd?: Date | null;
  }
}

declare module 'next-auth/jwt' {
  interface JWT extends DefaultJWT {
    id: string;
    email: string;
    name: string | null;
    picture?: string | null;
    tier: 'FREE' | 'PRO';
    deviceId: string;
    sessionId: string;
    hasResearchPack: boolean;
    subscriptionEnd?: string | null;
  }
}
