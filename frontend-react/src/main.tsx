import "@douyinfe/semi-ui/react19-adapter";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@semi-bot/semi-theme-kivicrm/semi.min.css";
import { App } from "@/app/App";
import { CrmProvider } from "@/stores/crm-store";
import "@/index.css";

createRoot(document.getElementById("root")!).render(<StrictMode><CrmProvider><App /></CrmProvider></StrictMode>);
