import "@douyinfe/semi-ui/react19-adapter";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@semi-bot/semi-theme-kivicrm/semi.min.css";
import { App } from "@/app/App";
import { CrmProvider } from "@/stores/crm-store";
import { MemberOperationsProvider } from "@/stores/member-operations-store";
import { MarketingProvider } from "@/stores/marketing-store";
import "@/index.css";

createRoot(document.getElementById("root")!).render(<StrictMode><CrmProvider><MemberOperationsProvider><MarketingProvider><App /></MarketingProvider></MemberOperationsProvider></CrmProvider></StrictMode>);
