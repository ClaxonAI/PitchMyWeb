// Small pure predicates shared by the scoring engine and the service
// recommendation engine so "does this business have a website/social/
// contact info" is defined exactly once.

export type BusinessSignalFields = {
  website?: string | null;
  instagram?: string | null;
  facebook?: string | null;
  phone?: string | null;
  email?: string | null;
};

const isFilled = (value: string | null | undefined): boolean => typeof value === "string" && value.trim().length > 0;

export function hasWebsite(business: Pick<BusinessSignalFields, "website">): boolean {
  return isFilled(business.website);
}

export function hasSocialPresence(business: Pick<BusinessSignalFields, "instagram" | "facebook">): boolean {
  return isFilled(business.instagram) || isFilled(business.facebook);
}

export function socialPresenceCount(business: Pick<BusinessSignalFields, "instagram" | "facebook">): 0 | 1 | 2 {
  return (Number(isFilled(business.instagram)) + Number(isFilled(business.facebook))) as 0 | 1 | 2;
}

export function hasContactInfo(business: Pick<BusinessSignalFields, "phone" | "email">): boolean {
  return isFilled(business.phone) || isFilled(business.email);
}

export function contactChannelCount(business: Pick<BusinessSignalFields, "phone" | "email">): 0 | 1 | 2 {
  return (Number(isFilled(business.phone)) + Number(isFilled(business.email))) as 0 | 1 | 2;
}
