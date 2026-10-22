export const DEFAULT_SETTINGS = Object.freeze({
  store: "GEN ZI CORNER",
  phone: "",
  address: "",
  tagline: "",

  receiptPrinter: "",
  receiptWidth: 80,
  footer: "Thank you for shopping with us!",
  instagramUrl: "@genzicorner",
  instagramQr: "",
  showLogo: true,
  showContact: true,
  autoPrint: false,

  labelPrinter: "",
  labelWidth: 38,
  labelHeight: 25,
  labelColumns: 1,
  labelGap: 0,
  labelFormat: "Roll"
});

function fail(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  throw error;
}

function text(value, label, max, required = false) {
  if (typeof value !== "string") {
    fail(`${label} must be text.`);
  }

  const result = value.trim();

  if (required && !result) {
    fail(`${label} is required.`);
  }

  if (result.length > max) {
    fail(`${label} must not exceed ${max} characters.`);
  }

  return result;
}

function number(value, label, min, max, integer = false) {
  if (
    !["number", "string"].includes(typeof value) ||
    String(value).trim() === ""
  ) {
    fail(`${label} is required.`);
  }

  const result = Number(value);

  if (
    !Number.isFinite(result) ||
    result < min ||
    result > max ||
    (integer && !Number.isInteger(result))
  ) {
    fail(`${label} must be ${min}–${max}${integer ? " whole numbers" : ""}.`);
  }

  // Dimensions and gaps support up to two decimal places.
  if (Math.abs(result * 100 - Math.round(result * 100)) > 0.000001) {
    fail(`${label} supports up to two decimal places.`);
  }

  return result;
}

function boolean(value, label) {
  if (typeof value !== "boolean") {
    fail(`${label} must be true or false.`);
  }

  return value;
}

function qrImage(value) {
  if (value === "") return "";

  if (typeof value !== "string") {
    fail("Invalid Instagram QR image.");
  }

  const match =
    /^data:image\/(png|jpeg);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);

  if (!match) {
    fail("Upload a PNG or JPEG QR image.");
  }

  const buffer = Buffer.from(match[2], "base64");

  if (!buffer.length || buffer.length > 500000) {
    fail("Choose a QR image below 500 KB.");
  }

  if (buffer.toString("base64") !== match[2]) {
    fail("Invalid QR image encoding.");
  }

  const png =
    buffer.length >= 8 &&
    buffer.subarray(0, 8).equals(
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
    );

  const jpeg =
    buffer.length >= 3 &&
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff;

  if (
    (match[1] === "png" && !png) ||
    (match[1] === "jpeg" && !jpeg)
  ) {
    fail("The QR image does not match its file type.");
  }

  return value;
}

export function validateSettings(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    fail("Settings are required.");
  }

  const result = {
    store: text(input.store, "Store name", 100, true),
    phone: text(input.phone, "Phone number", 30),
    address: text(input.address, "Address", 500),
    tagline: text(input.tagline, "Tagline", 150),

    receiptPrinter: text(
      input.receiptPrinter,
      "Receipt printer name",
      150
    ),
    receiptWidth: number(input.receiptWidth, "Receipt width", 58, 80),
    footer: text(input.footer, "Receipt footer", 500),
    instagramUrl: text(input.instagramUrl, "Instagram link", 500),
    instagramQr: qrImage(input.instagramQr),
    showLogo: boolean(input.showLogo, "Show logo"),
    showContact: boolean(input.showContact, "Show contact"),
    autoPrint: boolean(input.autoPrint, "Automatic print"),

    labelPrinter: text(input.labelPrinter, "Label printer name", 150),
    labelWidth: number(input.labelWidth, "Label width", 25, 100),
    labelHeight: number(input.labelHeight, "Label height", 25, 100),
    labelColumns: number(input.labelColumns, "Label columns", 1, 4, true),
    labelGap: number(input.labelGap, "Label gap", 0, 10),
    labelFormat: input.labelFormat
  };

  if (![58, 80].includes(result.receiptWidth)) {
    fail("Receipt width must be 58 or 80 mm.");
  }

  if (
    result.phone &&
    !/^(?:0\d{9}|\+94\d{9})$/.test(
      result.phone.replace(/[\s()-]/g, "")
    )
  ) {
    fail("Use a 10-digit local phone number or +94 followed by 9 digits.");
  }

  if (!["Roll", "A4 sheet"].includes(result.labelFormat)) {
    fail("Choose Roll or A4 sheet.");
  }

  if (
    result.labelFormat === "A4 sheet" &&
    result.labelColumns * result.labelWidth +
      (result.labelColumns - 1) * result.labelGap > 200
  ) {
    fail("The selected columns and gaps exceed the 200 mm A4 print area.");
  }

  return result;
}

export async function readStoreSettings(db) {
  const [rows] = await db.execute(
    `SELECT settings_json, version
     FROM store_settings
     WHERE id = 1`
  );

  if (!rows.length) {
    fail("Store settings are missing. Run 009_store_settings.sql.", 409);
  }

  const saved = typeof rows[0].settings_json === "string"
    ? JSON.parse(rows[0].settings_json)
    : rows[0].settings_json;

  return {
    settings: {
      ...DEFAULT_SETTINGS,
      ...saved,
      showLogo: Boolean(saved.showLogo ?? DEFAULT_SETTINGS.showLogo),
      showContact: Boolean(
        saved.showContact ?? DEFAULT_SETTINGS.showContact
      ),
      autoPrint: Boolean(saved.autoPrint ?? DEFAULT_SETTINGS.autoPrint)
    },
    version: Number(rows[0].version)
  };
}