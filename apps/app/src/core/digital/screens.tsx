import { Redirect } from "expo-router";

// D-130: digital purchases are web only (native shows no web prices or web checkout links).
export const BuyScreen = () => <Redirect href="/" />;
export const ThankYouScreen = () => <Redirect href="/" />;
export const DownloadHelpScreen = () => <Redirect href="/" />;
