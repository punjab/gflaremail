// FormMailer for Google Scripts
// Version 1.0.0
const SUBJECT_PREFIX = "[Website Form]";

function doPost(e) {
  try {
    const SHARED_SECRET = PropertiesService.getScriptProperties().getProperty("SHARED_SECRET"); // must match Worker
    const TO_EMAIL = PropertiesService.getScriptProperties().getProperty("TO_EMAIL"); // where you want submissions to arrive

    if (!e || !e.postData || !e.postData.contents) {
      return json_({ ok: false, error: "Missing body" });
    }

    const data = JSON.parse(e.postData.contents);

    if (data.secret !== SHARED_SECRET) {
      return json_({ ok: false, error: "Unauthorized" });
    }

    const name = (data.name || "").trim();
    const email = (data.email || "").trim();
    const company = (data.company || "").trim();
    const type = (data.type || "").trim();
    const message = (data.message || "").trim();

    if (!name || !email || !message) {
      return json_({ ok: false, error: "Missing required fields" });
    }

    if (message.length > 5000) {
      return json_({ ok: false, error: "Message too long" });
    }

    const subject = `${SUBJECT_PREFIX} ${name}`;
    const body =
`New form submission:

Name: ${name}
Email: ${email}
Company: ${company || "-"}
Type: ${type || "-"}

Message:
${message}

---
Meta:
IP: ${data.ip || "unknown"}
User-Agent: ${data.ua || "unknown"}
Timestamp: ${new Date().toISOString()}
`;

    GmailApp.sendEmail(TO_EMAIL, subject, body, { replyTo: email });

    return json_({ ok: true });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
