import type { AppConfig } from "../../common/config.js";
import type { SowindBrandCode } from "./sowind.types.js";

export type SowindBrandConfig = {
  code: SowindBrandCode;
  endpoint: string;
  businessUnitForms: string;
  ownershipField: string;
  ownershipRequired: boolean;
  subscriptionTypeId: number;
  processingConsentText: string;
  marketingConsentText: string;
  websiteBase: string;
  responseBrand: string;
};

export function sowindBrandConfig(config: AppConfig): Record<SowindBrandCode, SowindBrandConfig> {
  return {
    GP: {
      code: "GP",
      endpoint: config.sowindGatewayGpUrl,
      businessUnitForms: "girard_perregaux",
      ownershipField: "do_you_own_a_girard_perregaux_",
      ownershipRequired: false,
      subscriptionTypeId: 370626181,
      processingConsentText: "我同意 Girard-Perregaux 存储并处理我的个人信息。",
      marketingConsentText: "我同意接收 Girard-Perregaux 的其他通讯。",
      websiteBase: "https://www.girard-perregaux.com",
      responseBrand: "gp",
    },
    UN: {
      code: "UN",
      endpoint: config.sowindGatewayUnUrl,
      businessUnitForms: "ulysse_nardin",
      ownershipField: "do_you_own_an_ulysse_nardin_",
      ownershipRequired: true,
      subscriptionTypeId: 5186585,
      processingConsentText: "我同意 Ulysse Nardin 存储和处理我的个人数据。",
      marketingConsentText: "我同意接收来自 Ulysse Nardin 的电邮。",
      websiteBase: "https://www.ulysse-nardin.com",
      responseBrand: "un",
    },
  };
}
