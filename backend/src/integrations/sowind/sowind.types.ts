export type SowindBrandCode = "GP" | "UN";
export type IntegrationTrigger = "AUTO" | "ADMIN" | "RETRY_JOB";

export type SowindLeadInput = {
  brand: SowindBrandCode;
  sku?: string | null;
  email: string;
  salutation: string;
  firstname: string;
  lastname: string;
  phone?: string | null;
  preferredContact: string;
  country: string;
  city?: string | null;
  ownsBrandWatch?: string | null;
  processingConsent: boolean;
  marketingOptIn: boolean;
  birthday?: string | Date | null;
  purchaseMethod?: string | null;
  retailer?: string | null;
};

export type SowindField = { objectTypeId: "0-1"; name: string; value: string };

export type SowindBusinessPayload = {
  fields: SowindField[];
  context: { pageUri: string; pageName: string };
  legalConsentOptions: {
    consent: {
      consentToProcess: true;
      text: string;
      communications?: Array<{ value: true; subscriptionTypeId: number; text: string }>;
    };
  };
};

export type SowindGatewayRequest = SowindBusinessPayload & { accessKey: string };

export type GatewayResponseBody = {
  status?: string;
  ref?: string;
  brand?: string;
  error?: string;
  detail?: string;
  retryAfterSeconds?: number;
  [key: string]: unknown;
};

export type GatewayDeliveryResult = {
  ok: boolean;
  httpStatus: number | null;
  body: GatewayResponseBody;
  errorCode: string | null;
  errorMessage: string | null;
  retryable: boolean;
  retryAfterSeconds: number | null;
  permanent: boolean;
  durationMs: number;
};
