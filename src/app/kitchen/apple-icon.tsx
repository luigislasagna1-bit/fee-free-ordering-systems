import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          background: "#0F172A",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 100,
          color: "#10b981",
        }}
      >
        🍳
      </div>
    ),
    { ...size }
  );
}
