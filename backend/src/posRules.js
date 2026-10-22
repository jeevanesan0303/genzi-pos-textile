export function fail(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  throw error;
}

export const MAX_CENTS = 999999999999;

export function cents(value, label = "Amount") {
  if (!["string", "number"].includes(typeof value)) {
    fail(`${label} is invalid.`);
  }

  const text = String(value);

  if (!/^\d{1,10}(\.\d{1,2})?$/.test(text)) {
    fail(`${label} must have at most two decimals.`);
  }

  const [whole, fraction = ""] = text.split(".");
  const result =
    Number(whole) * 100 +
    Number(fraction.padEnd(2, "0"));

  if (!Number.isSafeInteger(result) || result > MAX_CENTS) {
    fail(`${label} is too large.`);
  }

  return result;
}

export function decimal(value) {
  if (
    !Number.isSafeInteger(value) ||
    value < 0 ||
    value > MAX_CENTS
  ) {
    fail("Invalid money total.");
  }

  return `${Math.floor(value / 100)}.${String(
    value % 100
  ).padStart(2, "0")}`;
}

export function uuid(value, label = "ID") {
  if (
    typeof value !== "string" ||
    !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(
      value
    )
  ) {
    fail(`Invalid ${label}.`);
  }

  return value.toLowerCase();
}

export function readLines(items) {
  if (
    !Array.isArray(items) ||
    !items.length ||
    items.length > 100
  ) {
    fail("Choose 1 to 100 different products.");
  }

  const seen = new Set();

  return items.map(item => {
    const productId = uuid(item?.productId, "product ID");

    if (seen.has(productId)) {
      fail("Duplicate product in bill.");
    }

    seen.add(productId);

    if (
      !Number.isInteger(item.quantity) ||
      item.quantity < 1 ||
      item.quantity > 1000000
    ) {
      fail(
        "Quantity must be a whole number from 1 to 1,000,000."
      );
    }

    return {
      productId,
      quantity: item.quantity,
      expectedPrice: cents(item.expectedPrice, "Unit price")
    };
  });
}

export function calculate(lines, discount) {
  let subtotal = 0;

  for (const line of lines) {
    const lineTotal = line.price * line.quantity;

    if (!Number.isSafeInteger(lineTotal)) {
      fail("Bill is too large.");
    }

    subtotal += lineTotal;

    if (
      !Number.isSafeInteger(subtotal) ||
      subtotal > MAX_CENTS
    ) {
      fail("Bill is too large.");
    }
  }

  if (discount > subtotal) {
    fail("Discount cannot exceed subtotal.");
  }

  return {
    subtotal,
    discount,
    total: subtotal - discount
  };
}

export function payment(total, body) {
  const method = body?.method;

  if (!["Cash", "Card", "Split"].includes(method)) {
    fail("Select Cash, Card or Split.");
  }

  const cardPaid =
    method === "Card"
      ? total
      : method === "Split"
        ? cents(body.cardPaid, "Card amount")
        : 0;

  if (
    method === "Split" &&
    (cardPaid <= 0 || cardPaid >= total)
  ) {
    fail(
      "Split card amount must be greater than zero and less than the total."
    );
  }

  const cashPaid = total - cardPaid;

  const cashReceived =
    method === "Card"
      ? 0
      : cents(body.cashReceived, "Cash received");

  if (cashReceived < cashPaid) {
    fail("Cash received is less than the cash amount due.");
  }

  return {
    method,
    cardPaid,
    cashPaid,
    cashReceived,
    changeDue: cashReceived - cashPaid
  };
}