export type WechatBrandCode = "GP" | "UN";

export type WechatPhoneResolution = {
  phoneNumber: string;
  appId: string;
  appScope: string;
  openId?: string | null;
  unionId?: string | null;
  unionIdScope?: string | null;
};

export interface WechatClient {
  resolvePhone(input: { brandCode: WechatBrandCode; code: string; appContext?: string | null }): Promise<WechatPhoneResolution>;
}
