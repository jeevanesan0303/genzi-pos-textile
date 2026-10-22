import React from "react";

export default function ReceiptFooter({ settings = {} }) {
  return (
    <div
      style={{
        textAlign: "center",
        breakInside: "avoid"
      }}
    >
      <p>
        <b>
          Exchanges only within 5 days of purchase.
          No refunds.
        </b>

        <br />

        Please bring this receipt.
      </p>

      <p>Follow us on Instagram</p>

      <img
        src={
          settings.instagramQr ||
          "/assets/instagram-qr.png"
        }
        alt="Instagram QR code"
        style={{
          display: "block",
          width: "28mm",
          height: "28mm",
          margin: "0 auto",
          objectFit: "contain",
          background: "#fff",
          padding: "2mm"
        }}
      />

      <p
        style={{
          overflowWrap: "anywhere",
          fontSize: 10
        }}
      >
        {settings.instagramUrl || "@genzicorner"}
      </p>
    </div>
  );
}