import { Button, Input, Text } from "@factory/ui";
import { useState } from "react";

/** Native: no file picker yet (Phase 10), so the CSV text is pasted. */
export function CsvPicker({ label, onText }: { label: string; onText: (text: string) => void }) {
  const [text, setText] = useState("");
  return (
    <>
      <Input accessibilityLabel={label} multiline value={text} onChangeText={setText} className="h-32" />
      <Button variant="outline" onPress={() => onText(text)} disabled={!text.trim()}>
        <Text>{label}</Text>
      </Button>
    </>
  );
}
