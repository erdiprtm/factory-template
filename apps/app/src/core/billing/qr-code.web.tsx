import { useMemo } from "react";
import { qrPath } from "./qr-path";

// Web: the QR as a plain DOM <svg>, drawn here from the payment string (D-092); no image service
// and no react-native-svg in the web bundle (D-059). Black on white whatever the theme: scanners
// need the contrast. crispEdges keeps module edges sharp at any size.
export function QrCode({ value, size = 240, label }: { value: string; size?: number; label: string }) {
  const qr = useMemo(() => qrPath(value), [value]);
  return (
    <svg
      role="img"
      aria-label={label}
      width={size}
      height={size}
      viewBox={`0 0 ${qr.size} ${qr.size}`}
      shapeRendering="crispEdges"
      data-testid="qr-code"
    >
      <rect width={qr.size} height={qr.size} fill="#ffffff" />
      <path d={qr.d} fill="#000000" />
    </svg>
  );
}
