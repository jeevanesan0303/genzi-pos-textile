
import React from "react";

export default function ReceiptFooter({ settings = {} }) {
  const instagramQr =
    settings.instagramQr || "/assets/instagram-qr.png";

  const instagramUrl =
    settings.instagramUrl || "@genzicorner";

  return (
    <div className="gz-receipt-footer">
      <p className="gz-footer-policy">
        <strong>
          Exchanges only within 5 days of purchase.
          <br />
          No refunds.
        </strong>
        <br />
        Please bring this receipt.
      </p>

      <p className="gz-footer-follow">
        Follow us on Instagram
      </p>

      <img
        className="gz-footer-qr"
        src={instagramQr}
        alt="Instagram QR code"
      />

      <p className="gz-footer-instagram">
        {instagramUrl}
      </p>
    </div>
  );
}
