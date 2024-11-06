import {
  AuthTokenDetails,
  PostDetails,
  PostResponse,
  SocialProvider,
} from '@gitroom/nestjs-libraries/integrations/social/social.integrations.interface';
import { makeId } from '@gitroom/nestjs-libraries/services/make.is';
import sharp from 'sharp';
import { lookup } from 'mime-types';
import { readOrFetch } from '@gitroom/helpers/utils/read.or.fetch';
import { removeMarkdown } from '@gitroom/helpers/utils/remove.markdown';
import {
  BadBody,
  SocialAbstract,
} from '@gitroom/nestjs-libraries/integrations/social.abstract';
import { Integration } from '@prisma/client';

export class LinkedinProvider extends SocialAbstract implements SocialProvider {
  identifier = 'linkedin';
  name = 'LinkedIn';
  isBetweenSteps = false;
  scopes = ['openid', 'profile', 'w_member_social', 'r_basicprofile'];
  refreshWait = true;

  async refreshToken(refresh_token: string): Promise<AuthTokenDetails> {
    const {
      access_token: accessToken,
      refresh_token: refreshToken,
      expires_in,
    } = await (
      await this.fetch('https://www.linkedin.com/oauth/v2/accessToken', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token,
          client_id: process.env.LINKEDIN_CLIENT_ID!,
          client_secret: process.env.LINKEDIN_CLIENT_SECRET!,
        }),
      })
    ).json();

    const { vanityName } = await (
      await this.fetch('https://api.linkedin.com/v2/me', {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      })
    ).json();

    const {
      name,
      sub: id,
      picture,
    } = await (
      await this.fetch('https://api.linkedin.com/v2/userinfo', {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      })
    ).json();

    return {
      id,
      accessToken,
      refreshToken,
      expiresIn: expires_in,
      name,
      picture,
      username: vanityName,
    };
  }

  async generateAuthUrl() {
    const state = makeId(6);
    const codeVerifier = makeId(30);
    const url = `https://www.linkedin.com/oauth/v2/authorization?response_type=code&client_id=${
      process.env.LINKEDIN_CLIENT_ID
    }&redirect_uri=${encodeURIComponent(
      `${process.env.FRONTEND_URL}/integrations/social/linkedin`
    )}&state=${state}&scope=${encodeURIComponent(this.scopes.join(' '))}`;
    return {
      url,
      codeVerifier,
      state,
    };
  }

  async authenticate(params: {
    code: string;
    codeVerifier: string;
    refresh?: string;
  }) {
    const body = new URLSearchParams();
    body.append('grant_type', 'authorization_code');
    body.append('code', params.code);
    body.append(
      'redirect_uri',
      `${process.env.FRONTEND_URL}/integrations/social/linkedin${
        params.refresh ? `?refresh=${params.refresh}` : ''
      }`
    );
    body.append('client_id', process.env.LINKEDIN_CLIENT_ID!);
    body.append('client_secret', process.env.LINKEDIN_CLIENT_SECRET!);

    const {
      access_token: accessToken,
      expires_in: expiresIn,
      refresh_token: refreshToken,
      scope,
    } = await (
      await this.fetch('https://www.linkedin.com/oauth/v2/accessToken', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body,
      })
    ).json();

    this.checkScopes(this.scopes, scope);

    const {
      name,
      sub: id,
      picture,
    } = await (
      await this.fetch('https://api.linkedin.com/v2/userinfo', {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      })
    ).json();

    const { vanityName } = await (
      await this.fetch('https://api.linkedin.com/v2/me', {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      })
    ).json();

    return {
      id,
      accessToken,
      refreshToken,
      expiresIn,
      name,
      picture,
      username: vanityName,
    };
  }

  async company(token: string, data: { url: string }) {
    const { url } = data;
    const getCompanyVanity = url.match(
      /^https?:\/\/?www\.?linkedin\.com\/company\/([^/]+)\/$/
    );
    if (!getCompanyVanity || !getCompanyVanity?.length) {
      throw new Error('Invalid LinkedIn company URL');
    }

    const { elements } = await (
      await this.fetch(
        `https://api.linkedin.com/rest/organizations?q=vanityName&vanityName=${getCompanyVanity[1]}`,
        {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            'X-Restli-Protocol-Version': '2.0.0',
            'LinkedIn-Version': '202402',
            Authorization: `Bearer ${token}`,
          },
        }
      )
    ).json();

    return {
      options: elements.map((e: { localizedName: string; id: string }) => ({
        label: e.localizedName,
        value: `@[${e.localizedName}](urn:li:organization:${e.id})`,
      }))?.[0],
    };
  }

  protected async uploadPicture(
    fileName: string,
    accessToken: string,
    personId: string,
    picture: any,
    type = 'personal' as 'company' | 'personal'
  ) {
    try {
      const {
        value: { uploadUrl, image, video, uploadInstructions, ...all },
      } = await (
        await this.fetch(
          `https://api.linkedin.com/rest/${
            fileName.indexOf('mp4') > -1 ? 'videos' : 'images'
          }?action=initializeUpload`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Restli-Protocol-Version': '2.0.0',
              'LinkedIn-Version': '202402',
              Authorization: `Bearer ${accessToken}`,
            },
            body: JSON.stringify({
              initializeUploadRequest: {
                owner:
                  type === 'personal'
                    ? `urn:li:person:${personId}`
                    : `urn:li:organization:${personId}`,
                ...(fileName.indexOf('mp4') > -1
                  ? {
                      fileSizeBytes: picture.length,
                      uploadCaptions: false,
                      uploadThumbnail: false,
                    }
                  : {}),
              },
            }),
          }
        )
      ).json();

      const sendUrlRequest = uploadInstructions?.[0]?.uploadUrl || uploadUrl;
      const finalOutput = video || image;

      const etags = [];
      for (let i = 0; i < picture.length; i += 1024 * 1024 * 2) {
        const upload = await this.fetch(sendUrlRequest, {
          method: 'PUT',
          headers: {
            'X-Restli-Protocol-Version': '2.0.0',
            'LinkedIn-Version': '202402',
            Authorization: `Bearer ${accessToken}`,
            ...(fileName.indexOf('mp4') > -1
              ? { 'Content-Type': 'application/octet-stream' }
              : {}),
          },
          body: picture.slice(i, i + 1024 * 1024 * 2),
        });

        etags.push(upload.headers.get('etag'));
      }

      if (fileName.indexOf('mp4') > -1) {
        const a = await this.fetch(
          'https://api.linkedin.com/rest/videos?action=finalizeUpload',
          {
            method: 'POST',
            body: JSON.stringify({
              finalizeUploadRequest: {
                video,
                uploadToken: '',
                uploadedPartIds: etags,
              },
            }),
            headers: {
              'X-Restli-Protocol-Version': '2.0.0',
              'LinkedIn-Version': '202402',
              'Content-Type': 'application/json',
              Authorization: `Bearer ${accessToken}`,
            },
          }
        );
      }

      return finalOutput;
    } catch (err: any) {
      throw new BadBody('error-posting-to-linkedin', JSON.stringify(err), {
        // @ts-ignore
        fileName,
        personId,
        picture,
        type,
      });
    }
  }

  async post(
    id: string,
    accessToken: string,
    postDetails: PostDetails[],
    integration: Integration,
    type = 'personal' as 'company' | 'personal'
  ): Promise<PostResponse[]> {
    const [firstPost, ...restPosts] = postDetails;

    const uploadAll = (
      await Promise.all(
        postDetails.flatMap((p) =>
          p?.media?.flatMap(async (m) => {
            return {
              id: await this.uploadPicture(
                m.url,
                accessToken,
                id,
                m.url.indexOf('mp4') > -1
                  ? Buffer.from(await readOrFetch(m.url))
                  : await sharp(await readOrFetch(m.url), {
                      animated: lookup(m.url) === 'image/gif',
                    })
                      .resize({
                        width: 1000,
                      })
                      .toBuffer(),
                type
              ),
              postId: p.id,
            };
          })
        )
      )
    ).reduce((acc, val) => {
      if (!val?.id) {
        return acc;
      }
      acc[val.postId] = acc[val.postId] || [];
      acc[val.postId].push(val.id);

      return acc;
    }, {} as Record<string, string[]>);

    const media_ids = (uploadAll[firstPost.id] || []).filter((f) => f);

    const data = await this.fetch('https://api.linkedin.com/v2/posts', {
      method: 'POST',
      headers: {
        'X-Restli-Protocol-Version': '2.0.0',
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        author:
          type === 'personal'
            ? `urn:li:person:${id}`
            : `urn:li:organization:${id}`,
        commentary: removeMarkdown({
          text: firstPost.message.replace('\n', '𝔫𝔢𝔴𝔩𝔦𝔫𝔢'),
          except: [/@\[(.*?)]\(urn:li:organization:(\d+)\)/g],
        }).replace('𝔫𝔢𝔴𝔩𝔦𝔫𝔢', '\n'),
        visibility: 'PUBLIC',
        distribution: {
          feedDistribution: 'MAIN_FEED',
          targetEntities: [],
          thirdPartyDistributionChannels: [],
        },
        ...(media_ids.length > 0
          ? {
              content: {
                ...(media_ids.length === 0
                  ? {}
                  : media_ids.length === 1
                  ? {
                      media: {
                        id: media_ids[0],
                      },
                    }
                  : {
                      multiImage: {
                        images: media_ids.map((id) => ({
                          id,
                        })),
                      },
                    }),
              },
            }
          : {}),
        lifecycleState: 'PUBLISHED',
        isReshareDisabledByAuthor: false,
      }),
    });

    if (data.status !== 201 && data.status !== 200) {
      throw new Error('Error posting to LinkedIn');
    }

    const topPostId = data.headers.get('x-restli-id')!;

    const ids = [
      {
        status: 'posted',
        postId: topPostId,
        id: firstPost.id,
        releaseURL: `https://www.linkedin.com/feed/update/${topPostId}`,
      },
    ];
    for (const post of restPosts) {
      const { object } = await (
        await this.fetch(
          `https://api.linkedin.com/v2/socialActions/${decodeURIComponent(
            topPostId
          )}/comments`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${accessToken}`,
            },
            body: JSON.stringify({
              actor:
                type === 'personal'
                  ? `urn:li:person:${id}`
                  : `urn:li:organization:${id}`,
              object: topPostId,
              message: {
                text: removeMarkdown({
                  text: post.message.replace('\n', '𝔫𝔢𝔴𝔩𝔦𝔫𝔢'),
                  except: [/@\[(.*?)]\(urn:li:organization:(\d+)\)/g],
                }).replace('𝔫𝔢𝔴𝔩𝔦𝔫𝔢', '\n'),
              },
            }),
          }
        )
      ).json();

      ids.push({
        status: 'posted',
        postId: object,
        id: post.id,
        releaseURL: `https://www.linkedin.com/embed/feed/update/${object}`,
      });
    }

    return ids;
  }
}
