import { encode } from "uqr";

// QR codes are drawn on the device from Pakasir's qr_string (D-092): the payment string never
// goes to a third-party QR image service. uqr (0.1.3, no dependencies) encodes; this turns the
// module matrix into one SVG path, one 1×1 square per dark module, with a 4-module quiet zone.

export const QR_BORDER = 4;

export function qrPath(text: string): { size: number; d: string } {
  const { size, data } = encode(text, { ecc: "M", border: QR_BORDER });
  let d = "";
  data.forEach((row, y) => {
    row.forEach((dark, x) => {
      if (dark) d += `M${x} ${y}h1v1h-1z`;
    });
  });
  return { size, d };
}
