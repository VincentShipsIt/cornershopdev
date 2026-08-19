export const OUTREACH_THREAD_PREFIX = "lead:";
export const OUTBOUND_RFC_MESSAGE_DOMAIN = "send.restofront.com";

export type InboundAddressFields = {
  from: string;
  to: string[];
  receivedFor?: string[];
  inReplyTo?: string | null;
  references?: string | null;
  rfcMessageId?: string | null;
};

export function outreachThreadKey(siteId: string): string {
  return `${OUTREACH_THREAD_PREFIX}${siteId}`;
}

export function outboundRfcMessageId(messageId: string): string {
  return `<${messageId}@${OUTBOUND_RFC_MESSAGE_DOMAIN}>`;
}

export function normalizeRfcMessageId(value: string): string {
  return value.trim().replace(/^<|>$/g, "").toLowerCase();
}

export function parseRfcMessageIds(value: string | null | undefined): string[] {
  if (!value) return [];
  const bracketed = [...value.matchAll(/<([^>]+)>/g)].map((match) =>
    normalizeRfcMessageId(match[1] ?? ""),
  );
  const tokens = value
    .split(/[\s,]+/)
    .map((token) => normalizeRfcMessageId(token))
    .filter((token) => token.includes("@") || token.startsWith("outreach_"));
  return [...new Set([...bracketed, ...tokens].filter(Boolean))];
}

export function extractEmailAddress(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const angled = trimmed.match(/<([^>]+)>/);
  const candidate = (angled?.[1] ?? trimmed).trim().toLowerCase();
  return candidate.includes("@") ? candidate : null;
}

export function extractEmailAddresses(values: string[]): string[] {
  return [
    ...new Set(
      values
        .flatMap((value) => extractEmailAddress(value) ?? [])
        .filter(Boolean),
    ),
  ];
}

export function extractPlusTag(address: string): string | null {
  const email = extractEmailAddress(address);
  if (!email) return null;
  const at = email.indexOf("@");
  if (at <= 0) return null;
  const local = email.slice(0, at);
  const plus = local.indexOf("+");
  if (plus <= 0 || plus === local.length - 1) return null;
  return local.slice(plus + 1);
}

export function extractPlusTags(addresses: string[]): string[] {
  return [
    ...new Set(
      addresses
        .map((address) => extractPlusTag(address))
        .filter((tag): tag is string => Boolean(tag)),
    ),
  ];
}

export function inboundThreadTokens(input: InboundAddressFields): string[] {
  return [
    ...new Set([
      ...parseRfcMessageIds(input.inReplyTo),
      ...parseRfcMessageIds(input.references),
      ...parseRfcMessageIds(input.rfcMessageId),
      ...extractPlusTags([
        ...input.to,
        ...(input.receivedFor ?? []),
      ]),
    ]),
  ];
}

export function plusAddressReplyTo(
  replyTo: string | undefined,
  slug: string,
): string | undefined {
  const email = replyTo ? extractEmailAddress(replyTo) : null;
  if (!email) return replyTo;
  const at = email.indexOf("@");
  const local = email.slice(0, at);
  if (local.includes("+")) return email;
  return `${local}+${slug}${email.slice(at)}`;
}

export function replySubject(subject: string): string {
  const trimmed = subject.trim() || "your preview";
  return /^re:\s/i.test(trimmed) ? trimmed : `Re: ${trimmed}`;
}

export function htmlToPlainText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ")
    .trim();
}
