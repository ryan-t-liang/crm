import type { AppConfig } from "../common/config.js";
import { ApiError } from "../common/errors.js";
import type { WechatBrandCode, WechatClient, WechatPhoneResolution } from "./wechat.types.js";

type FetchLike = typeof fetch;

type AccessTokenResponse = { access_token?: string; errcode?: number };
type PhoneResponse = {
  errcode?: number;
  phone_info?: { phoneNumber?: string; purePhoneNumber?: string; countryCode?: string };
};

function brandConfig(config: AppConfig, brandCode: WechatBrandCode) {
  if (brandCode === "GP") {
    return {
      appId: config.wechatGpAppId || "",
      appSecret: config.wechatGpAppSecret || "",
      openPlatformScope: config.wechatGpOpenPlatformScope || null,
    };
  }
  return {
    appId: config.wechatUnAppId || "",
    appSecret: config.wechatUnAppSecret || "",
    openPlatformScope: config.wechatUnOpenPlatformScope || null,
  };
}

async function safeJson<T>(response: Response): Promise<T> {
  try { return await response.json() as T; }
  catch { throw new ApiError(502, "WECHAT_PROVIDER_ERROR", "微信服务返回了无法解析的响应"); }
}

export class WechatApiClient implements WechatClient {
  constructor(private readonly config: AppConfig, private readonly fetchImpl: FetchLike = fetch) {}

  async resolvePhone(input: { brandCode: WechatBrandCode; code: string; appContext?: string | null }): Promise<WechatPhoneResolution> {
    const selected = brandConfig(this.config, input.brandCode);
    if (!selected.appId || !selected.appSecret) {
      throw new ApiError(503, "WECHAT_NOT_CONFIGURED", "当前品牌微信手机号解析尚未配置");
    }
    if (input.appContext && ![input.brandCode, selected.appId].includes(input.appContext)) {
      throw new ApiError(400, "WECHAT_APP_CONTEXT_MISMATCH", "微信应用上下文与品牌配置不匹配");
    }

    const tokenResponse = await this.fetchImpl("https://api.weixin.qq.com/cgi-bin/stable_token", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ grant_type: "client_credential", appid: selected.appId, secret: selected.appSecret, force_refresh: false }),
      signal: AbortSignal.timeout(10_000),
    });
    const tokenBody = await safeJson<AccessTokenResponse>(tokenResponse);
    if (!tokenResponse.ok || !tokenBody.access_token) {
      throw new ApiError(502, "WECHAT_PROVIDER_ERROR", `微信 access token 获取失败（errcode=${tokenBody.errcode ?? "unknown"}）`);
    }

    const phoneResponse = await this.fetchImpl(`https://api.weixin.qq.com/wxa/business/getuserphonenumber?access_token=${encodeURIComponent(tokenBody.access_token)}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code: input.code }),
      signal: AbortSignal.timeout(10_000),
    });
    const phoneBody = await safeJson<PhoneResponse>(phoneResponse);
    const phoneNumber = phoneBody.phone_info?.phoneNumber || (phoneBody.phone_info?.countryCode && phoneBody.phone_info?.purePhoneNumber
      ? `+${phoneBody.phone_info.countryCode}${phoneBody.phone_info.purePhoneNumber}`
      : null);
    if (!phoneResponse.ok || phoneBody.errcode !== 0 || !phoneNumber) {
      throw new ApiError(502, "WECHAT_PHONE_RESOLVE_FAILED", `微信手机号解析失败（errcode=${phoneBody.errcode ?? "unknown"}）`);
    }
    return {
      phoneNumber,
      appId: selected.appId,
      appScope: `APP:${selected.appId}`,
      unionIdScope: selected.openPlatformScope ? `OPEN_PLATFORM:${selected.openPlatformScope}` : null,
    };
  }
}
