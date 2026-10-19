import { useMemo } from "react";
import { View } from "react-native";
import Svg, { Path, Rect } from "react-native-svg";
import { qrPath } from "./qr-path";

// Native: the QR with react-native-svg (web: qr-code.web.tsx, a plain <svg>, D-059). Native builds
// never reach the checkout screen today (store rules); this keeps the component portable.
// Black on white whatever the theme: scanners need the contrast.
export function QrCode({ value, size = 240, label }: { value: string; size?: number; label: string }) {
  const qr = useMemo(() => qrPath(value), [value]);
  return (
    <View accessible accessibilityRole="image" accessibilityLabel={label}>
      <Svg width={size} height={size} viewBox={`0 0 ${qr.size} ${qr.size}`}>
        <Rect width={qr.size} height={qr.size} fill="#ffffff" />
        <Path d={qr.d} fill="#000000" />
      </Svg>
    </View>
  );
}
