import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import App from "./App.jsx";
import { DAY_COUNT } from "./domain/config.js";
import "./index.css";

// The page is exactly as wide as the run of day bars it has to hold, so the
// stylesheet needs the count to size it. Published rather than restated there:
// the strip drawn and the width reserved for it are then the same number by
// construction, and cannot drift into a strip that overflows its card.
document.documentElement.style.setProperty("--day-count", String(DAY_COUNT));

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
