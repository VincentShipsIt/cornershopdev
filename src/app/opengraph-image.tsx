import { ImageResponse } from "next/og";

export const alt = "Cornershopdev — Your restaurant's front door, always current";
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
        color: "#1d241f",
        background:
          "radial-gradient(circle at 85% 20%, #e7b596 0, transparent 32%), #f4efe5",
        fontFamily: "Arial, sans-serif",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
        <div
          style={{
            width: 58,
            height: 58,
            borderRadius: 999,
            background: "#a5482d",
            color: "white",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 20,
            fontWeight: 700,
          }}
        >
          RF
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
        Your restaurant&apos;s front door, always current.
      </div>
      <div style={{ display: "flex", fontSize: 23, color: "#675f56" }}>
        Website, menu and imagery—already done.
      </div>
    </div>,
    size,
  );
}
