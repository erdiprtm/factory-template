// Native: file saving arrives with Phase 10 (expo-file-system + share sheet). Web only for now.
export async function downloadJson(_url: string, _filename: string): Promise<void> {
  throw new Error("Data download is available on the web version");
}

export const canDownload = false;
