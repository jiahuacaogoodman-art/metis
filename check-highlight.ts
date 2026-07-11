import { highlightCode } from "./src/modes/interactive/theme/theme.ts";
import { initTheme } from "./src/modes/interactive/theme/theme.ts";
initTheme({ name: "dark" });
console.log(JSON.stringify(highlightCode("<div></div>", "html")));
