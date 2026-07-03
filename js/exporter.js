// Bake in-browser edits back into a data.js you can commit.
import { showHint } from "./config.js";
import { mergedData } from "./store.js";
import { on } from "./bus.js";

function exportData() {
  const out = `// NIPPON TOP data — exported ${new Date().toISOString().slice(0, 10)} from the app itself.\nwindow.NIPPON = ${JSON.stringify(mergedData(), null, 2)};\n`;
  const blob = new Blob([out], { type: "text/javascript" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "data.js";
  a.click();
  URL.revokeObjectURL(a.href);
  showHint("💾 drop that data.js into the repo — your edits are now canon", 3500);
}

export const initExporter = () => on("export", exportData);
