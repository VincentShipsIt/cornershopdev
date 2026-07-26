import { ImageResponse } from "next/og";

export const alt = "Cornershopdev — the website factory for small business";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: "72px",
        color: "#1F2622",
        background: "#F7F1E7",
        fontFamily: "Arial, sans-serif",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
        <div
          style={{
            width: 58,
            height: 58,
            position: "relative",
            borderRadius: 14,
            background: "#0D4A39",
            color: "#F7F1E7",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 20,
            fontWeight: 700,
          }}
        >
          C
          <div
            style={{
              position: "absolute",
              left: 7,
              top: 0,
              display: "flex",
              gap: 3,
            }}
          >
            {[0, 1, 2].map((stripe) => (
              <div
                key={stripe}
                style={{
                  width: 9,
                  height: 14,
                  borderRadius: 3,
                  background: "#F15A3D",
                }}
              />
            ))}
          </div>
        </div>
        <div style={{ fontSize: 28, fontWeight: 700 }}>Cornershopdev</div>
      </div>
      <div
        style={{
          display: "flex",
          maxWidth: 900,
          fontFamily: "Georgia, serif",
          fontSize: 92,
          lineHeight: 0.9,
          letterSpacing: "-5px",
        }}
      >
        One factory. A storefront for every trade.
      </div>
      <div style={{ display: "flex", fontSize: 23, color: "#646863" }}>
        One engine, one database, one deploy.
      </div>
    </div>,
    size,
  );
}
