const SEND_URL = "https://www.ugsms.com/api/v2/sms/send";

export async function sendSmsCode(localNumber, code) {
  const apiKey = String(process.env.UGSMS_API_KEY || "").trim();
  if (!apiKey) {
    const err = new Error("SMS is not set up. Add UGSMS_API_KEY to backend/.env.");
    err.status = 503;
    throw err;
  }

  const transactionId = `afriresq-${localNumber}-${Date.now()}`;
  const response = await fetch(SEND_URL, {
    method: "POST",
    headers: {
      "X-API-Key": apiKey,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      numbers: localNumber,
      message_body: `AfriResQ code: ${code}. It expires in 10 minutes.`,
      sender_id: process.env.UGSMS_SENDER_ID || "AfriResQ",
      transaction_id: transactionId,
    }),
  });

  const body = await response.json().catch(() => ({}));
  if (response.ok && body.success !== false && !body.error) return body;

  const detail = String(body.error || body.message || "");
  if (response.status === 401 || /api key/i.test(detail)) {
    const err = new Error("UGSMS rejected the API key. Generate a new key under Settings, then API Settings.");
    err.status = 502;
    throw err;
  }
  const err = new Error(detail || "The SMS could not be sent. Try again in a moment.");
  err.status = 502;
  throw err;
}
