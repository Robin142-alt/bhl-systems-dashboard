import { normalizeKenyanPhoneNumber } from "@/lib/phone";

interface WhatsAppMessageOptions {
  phoneNumber: string;
  message: string;
}

interface WhatsAppSendResult {
  success: boolean;
  providerMessageId?: string;
  errorMessage?: string;
}

function getRequiredEnv(name: string) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`${name} is not configured.`);
  }

  return value;
}

function getWhatsAppApiUrl() {
  const baseUrl = process.env.AFRICAS_TALKING_WHATSAPP_BASE_URL || "https://chat.africastalking.com";
  const path = process.env.AFRICAS_TALKING_WHATSAPP_MESSAGE_PATH || "/message/send";

  return `${baseUrl.replace(/\/+$/, "")}${path.startsWith("/") ? path : `/${path}`}`;
}

export function isWhatsAppMessagingConfigured() {
  return Boolean(
    process.env.AFRICAS_TALKING_USERNAME &&
      process.env.AFRICAS_TALKING_API_KEY &&
      process.env.AFRICAS_TALKING_WHATSAPP_NUMBER,
  );
}

export async function sendAfricasTalkingWhatsAppMessage(
  options: WhatsAppMessageOptions,
): Promise<WhatsAppSendResult> {
  if (!isWhatsAppMessagingConfigured()) {
    return {
      success: false,
      errorMessage: "Africa's Talking WhatsApp credentials are missing.",
    };
  }

  const recipient = normalizeKenyanPhoneNumber(options.phoneNumber);

  if (!recipient) {
    return {
      success: false,
      errorMessage: "Recipient phone number is invalid.",
    };
  }

  try {
    const response = await fetch(getWhatsAppApiUrl(), {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        apiKey: getRequiredEnv("AFRICAS_TALKING_API_KEY"),
      },
      body: JSON.stringify({
        username: getRequiredEnv("AFRICAS_TALKING_USERNAME"),
        waNumber: getRequiredEnv("AFRICAS_TALKING_WHATSAPP_NUMBER"),
        phoneNumber: recipient,
        body: {
          type: "text",
          message: options.message,
        },
      }),
    });

    const payload = (await response.json().catch(() => null)) as
      | {
          data?: { id?: string; messageId?: string; status?: string };
          error?: string;
          description?: string;
          message?: string;
        }
      | null;

    if (!response.ok) {
      return {
        success: false,
        errorMessage:
          payload?.error ||
          payload?.description ||
          payload?.message ||
          `Provider returned ${response.status}.`,
      };
    }

    return {
      success: true,
      providerMessageId: payload?.data?.id || payload?.data?.messageId,
    };
  } catch (error) {
    return {
      success: false,
      errorMessage: error instanceof Error ? error.message : "WhatsApp send failed.",
    };
  }
}
