export type FieldDefinition = { key: string; label: string; section: string; tab: string; type: string; required?: boolean; maxLength?: number; wide?: boolean; min?: number; step?: string; options?: { value: string; label: string }[] }
export const CONTACT_FIELDS: FieldDefinition[]
export const LEAD_FIELDS: FieldDefinition[]
export const CONTACT_STAGES: { value: string; label: string }[]
export const LEAD_STATUSES: { value: string; label: string }[]
export const LEAD_PRIORITIES: { value: string; label: string }[]
