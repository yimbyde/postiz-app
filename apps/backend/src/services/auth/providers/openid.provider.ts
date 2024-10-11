import { ProvidersInterface } from '@gitroom/backend/services/auth/providers.interface';

export class OpenIDProvider implements ProvidersInterface {
  private clientId: string = process.env.OAUTH_CLIENT_ID!;
  private clientSecret: string = process.env.OAUTH_CLIENT_SECRET!;
  private redirectUri: string = encodeURIComponent(`${process.env.FRONTEND_URL}/settings`);
  private authUrl: string = process.env.OAUTH_AUTH_URL!;
  private tokenUrl: string = process.env.OAUTH_TOKEN_URL!;
  private userInfoUrl: string = process.env.OPENID_USER_INFO_URL!;

  generateLink(): string {
    return `${this.authUrl}?client_id=${this.clientId}&response_type=code&scope=openid%20email&redirect_uri=${this.redirectUri}&state=`;
  }

  async getToken(code: string): Promise<string> {
    const response = await (
      await fetch(this.tokenUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': `Basic ${this.clientSecret}`,
        },
        body: new URLSearchParams({
          client_id: this.clientId,
          code: code,
          grant_type: 'authorization_code',
          redirect_uri: this.redirectUri,
        }).toString(),
      })
    )
    
    // Check if the response is OK before parsing
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to fetch token: ${response.status} ${response.statusText} - ${errorText}`);
    }

    const { access_token } = await response.json();

    if (!access_token) {
      throw new Error('Access token not found in response');
    }

    return access_token;
  }

  async getUser(access_token: string): Promise<{ email: string; id: string }> {
    const data = await (
      await fetch(this.userInfoUrl, {
        headers: {
          Authorization: `Bearer ${access_token}`,
        },
      })
    ).json();

    return {
      email: data.email,
      id: String(data.sub || data.id),
    };
  }
}
