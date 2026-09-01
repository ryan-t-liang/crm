import type { Prisma, PrismaClient } from "@prisma/client";
import { ApiError } from "../common/errors.js";

type DbClient = PrismaClient | Prisma.TransactionClient;

export type IdentityBindingInput = {
  customerId: string;
  brandId: string;
  identityType: "OPENID" | "UNIONID" | "VERIFIED_MOBILE";
  scope: string;
  appId?: string | null;
  value: string;
  verifiedAt?: Date | null;
  source: string;
};

export class IdentityConflictError extends ApiError {
  constructor(
    public readonly identity: Pick<IdentityBindingInput, "brandId" | "identityType" | "scope">,
    public readonly existingCustomerId: string,
    public readonly attemptedCustomerId: string,
  ) {
    super(409, "IDENTITY_CONFLICT", "该微信身份已绑定其他会员，不能自动覆盖或合并");
  }
}

export async function bindCustomerIdentity(db: DbClient, input: IdentityBindingInput) {
  const value = input.value.trim();
  if (!value) return null;
  const existing = await db.customerIdentity.findUnique({
    where: {
      brandId_identityType_scope_value: {
        brandId: input.brandId,
        identityType: input.identityType,
        scope: input.scope,
        value,
      },
    },
  });
  if (existing && existing.customerId !== input.customerId) {
    throw new IdentityConflictError(input, existing.customerId, input.customerId);
  }
  if (existing) {
    return db.customerIdentity.update({
      where: { id: existing.id },
      data: {
        appId: existing.appId ?? input.appId ?? null,
        verifiedAt: existing.verifiedAt ?? input.verifiedAt ?? null,
        source: input.verifiedAt && !existing.verifiedAt ? input.source : existing.source,
      },
    });
  }
  return db.customerIdentity.create({
    data: {
      customerId: input.customerId,
      brandId: input.brandId,
      identityType: input.identityType,
      scope: input.scope,
      appId: input.appId ?? null,
      value,
      verifiedAt: input.verifiedAt ?? null,
      source: input.source,
    },
  });
}

export function identityConflictDetails(error: IdentityConflictError): Prisma.InputJsonValue {
  return {
    identityType: error.identity.identityType,
    scope: error.identity.scope,
    brandId: error.identity.brandId,
    existingCustomerId: error.existingCustomerId,
    attemptedCustomerId: error.attemptedCustomerId,
  };
}
