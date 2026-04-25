export function normalizeKenyanPhoneNumber(input: string | null | undefined) {
  if (!input) {
    return null;
  }

  const cleaned = input.replace(/[^\d+]/g, "");

  if (cleaned.startsWith("+") && /^\+\d{8,15}$/.test(cleaned)) {
    return cleaned;
  }

  if (/^254\d{9}$/.test(cleaned)) {
    return `+${cleaned}`;
  }

  if (/^0\d{9}$/.test(cleaned)) {
    return `+254${cleaned.slice(1)}`;
  }

  if (/^7\d{8}$/.test(cleaned) || /^1\d{8}$/.test(cleaned)) {
    return `+254${cleaned}`;
  }

  return null;
}

export function maskPhoneNumber(phoneNumber: string | null | undefined) {
  if (!phoneNumber) {
    return "Not set";
  }

  const normalized = normalizeKenyanPhoneNumber(phoneNumber);
  if (!normalized) {
    return "Invalid number";
  }

  return `${normalized.slice(0, 7)}•••${normalized.slice(-2)}`;
}
