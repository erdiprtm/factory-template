import { Button, Text } from "@factory/ui";

/** Web: pick the Ads Manager CSV file and hand its text over. */
export function CsvPicker({ label, onText }: { label: string; onText: (text: string) => void }) {
  function pick() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".csv,text/csv";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (file) onText(await file.text());
    };
    input.click();
  }
  return (
    <Button variant="outline" onPress={pick}>
      <Text>{label}</Text>
    </Button>
  );
}
