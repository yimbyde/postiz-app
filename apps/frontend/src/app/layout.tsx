import interClass from '@gitroom/react/helpers/inter.font';
export const dynamic = 'force-dynamic';
import './global.scss';
import 'react-tooltip/dist/react-tooltip.css';
import '@copilotkit/react-ui/styles.css';

import LayoutContext from '@gitroom/frontend/components/layout/layout.context';
import { ReactNode } from 'react';
import { Chakra_Petch } from 'next/font/google';
import PlausibleProvider from 'next-plausible';
import clsx from 'clsx';
import { VariableContextComponent } from '@gitroom/react/helpers/variable.context';

const chakra = Chakra_Petch({ weight: '400', subsets: ['latin'] });

export default async function AppLayout({ children }: { children: ReactNode }) {
  return (
    <html className={interClass}>
      <head>
        <link
          rel="icon"
          href={!!process.env.IS_GENERAL ? '/favicon.png' : '/postiz-fav.png'}
          sizes="any"
        />
      </head>
      <body className={clsx(chakra.className, 'text-primary dark')}>
        <VariableContextComponent
          storageProvider={process.env.STORAGE_PROVIDER! as 'local' | 'cloudflare'}
          backendUrl={process.env.NEXT_PUBLIC_BACKEND_URL!}
          plontoKey={process.env.NEXT_PUBLIC_POLOTNO!}
          billingEnabled={!!process.env.STRIPE_PUBLISHABLE_KEY}
          discordUrl={process.env.NEXT_PUBLIC_DISCORD_SUPPORT!}
          frontEndUrl={process.env.FRONTEND_URL!}
          isGeneral={!!process.env.IS_GENERAL}
          enableOpenID={!!process.env.ENABLE_OPENID}
          uploadDirectory={process.env.NEXT_PUBLIC_UPLOAD_STATIC_DIRECTORY!}
        >
          <PlausibleProvider
            domain={!!process.env.IS_GENERAL ? 'postiz.com' : 'gitroom.com'}
          >
            <LayoutContext>{children}</LayoutContext>
          </PlausibleProvider>
        </VariableContextComponent>
      </body>
    </html>
  );
}
