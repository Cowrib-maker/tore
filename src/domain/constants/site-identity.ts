/**
 * The one place that names the actual operating legal entity, kept
 * separate from the consumer-facing "TORE" brand name (dict.common.brand)
 * and from the manual-payment bank account name (MANUAL_ACCOUNT_NAME env
 * var, which is deliberately the shorter "ТОРЕ ТЕХНОЛОЖИ" as printed on
 * the bank account itself). Never derived from a session/admin/org
 * owner's name -- this is a static constant, not a content field.
 */
export const TORE_LEGAL_ENTITY_NAME = "ТОРЕ ТЕХНОЛОЖИ ХХК";
