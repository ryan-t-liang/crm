import { StrictMode } from "react"
import { createRoot } from "react-dom/client"

import "@semi-bot/semi-theme-kivicrm/semi.min.css"
import { App } from "@/app"
import "@/index.css"

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
