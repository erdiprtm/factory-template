import Svg, { Path } from "react-native-svg";

// Native: the check glyph with react-native-svg. The web build uses check-icon.web.tsx, a plain
// <svg>, so react-native-svg stays out of the first web bundle (the consent gate sits in front of
// the funnel, D-059). Importing lucide-react-native pulled the whole icon set in, hence one glyph.
export function CheckIcon() {
  return (
    <Svg
      width={16}
      height={16}
      viewBox="0 0 24 24"
      fill="none"
      stroke="white"
      strokeWidth={3}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <Path d="M20 6 9 17l-5-5" />
    </Svg>
  );
}
