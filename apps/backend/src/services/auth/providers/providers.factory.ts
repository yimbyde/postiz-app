import { Provider } from '@prisma/client';
import { GithubProvider } from '@gitroom/backend/services/auth/providers/github.provider';
import { ProvidersInterface } from '@gitroom/backend/services/auth/providers.interface';
import { GoogleProvider } from '@gitroom/backend/services/auth/providers/google.provider';
import { OpenIDProvider } from '@gitroom/backend/services/auth/providers/openid.provider';

export class ProvidersFactory {
  static loadProvider(provider: Provider): ProvidersInterface {
    switch (provider) {
      case Provider.GITHUB:
        return new GithubProvider();
      case Provider.GOOGLE:
        return new GoogleProvider();
      case Provider.OPENID:
        return new OpenIDProvider();
    }
  }
}
