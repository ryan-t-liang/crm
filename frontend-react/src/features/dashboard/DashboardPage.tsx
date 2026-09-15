import { useMemo, useState } from "react";
import { Input, Select } from "@douyinfe/semi-ui";
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { PageHeader } from "@/components/CrmUi";
import { dealStageLabels, leadStatusLabels, useCrm } from "@/stores/crm-store";

const colors = ["#087a4b", "#315f8c", "#a26b16", "#76558f", "#54857a", "#a94343"];

export function DashboardPage() {
  const { state, isHq, scoped } = useCrm();
  const [range, setRange] = useState("30"); const [distributorId, setDistributorId] = useState("all"); const [custom, setCustom] = useState({ from: "", to: "" });
  const start = useMemo(() => {
    if (range === "custom" && custom.from) return new Date(`${custom.from}T00:00:00`).getTime();
    const days = range === "today" ? 1 : range === "7" ? 7 : range === "month" ? new Date().getDate() : range === "quarter" ? 90 : 30;
    return Date.now() - days * 86_400_000;
  }, [custom.from, range]);
  const end = range === "custom" && custom.to ? new Date(`${custom.to}T23:59:59`).getTime() : Date.now() + 86_400_000;
  const leads = scoped(state.leads, distributorId).filter((item) => Date.parse(item.createdAt) >= start && Date.parse(item.createdAt) <= end);
  const deals = scoped(state.deals, distributorId).filter((item) => Date.parse(item.createdAt) >= start && Date.parse(item.createdAt) <= end);
  const qualified = leads.filter((item) => ["QUALIFIED", "CONVERTED"].includes(item.status)).length; const won = deals.filter((item) => item.stage === "WON").length; const lost = deals.filter((item) => item.stage === "LOST").length; const open = deals.length - won - lost;
  const trend = Array.from({ length: 8 }, (_, index) => {
    const date = new Date(); date.setDate(date.getDate() - (7 - index) * 4); const from = date.getTime() - 4 * 86_400_000; const to = date.getTime();
    return { label: `${date.getMonth() + 1}/${date.getDate()}`, Leads: leads.filter((item) => Date.parse(item.createdAt) >= from && Date.parse(item.createdAt) < to).length, Deals: deals.filter((item) => Date.parse(item.createdAt) >= from && Date.parse(item.createdAt) < to).length };
  });
  const stages = Object.keys(dealStageLabels).map((stage) => ({ name: dealStageLabels[stage as keyof typeof dealStageLabels], value: deals.filter((item) => item.stage === stage).length }));
  const funnel = [
    { name: leadStatusLabels.NEW, value: leads.length }, { name: "Qualified", value: qualified }, { name: "Converted", value: leads.filter((item) => item.status === "CONVERTED").length }, { name: "Won", value: won },
  ];
  const byDistributor = state.distributors.map((distributor) => ({ name: distributor.name.replace(" Partner", ""), Deals: deals.filter((item) => item.distributorId === distributor.id).length, Won: deals.filter((item) => item.distributorId === distributor.id && item.stage === "WON").length })).filter((item) => item.Deals);
  const byProduct = state.products.map((product) => ({ name: product.name, Deals: deals.filter((item) => item.productId === product.id).length, Won: deals.filter((item) => item.productId === product.id && item.stage === "WON").length }));
  const addOnNames = Array.from(new Set(state.products.flatMap((product) => product.capabilities.map((item) => item.name))));
  const addOns = addOnNames.map((name) => ({ name, Interest: leads.filter((lead) => lead.productInterest.includes(name)).length, Deals: deals.filter((deal) => state.products.find((product) => product.id === deal.productId)?.capabilities.some((capability) => deal.capabilityIds.includes(capability.id) && capability.name === name)).length, Won: deals.filter((deal) => deal.stage === "WON" && state.products.find((product) => product.id === deal.productId)?.capabilities.some((capability) => deal.capabilityIds.includes(capability.id) && capability.name === name)).length })).sort((a, b) => b.Interest - a.Interest);
  return <div className="page dashboard-page"><PageHeader title="数据概览" description="按时间与分销商范围观察 Lead → Deal 转化和产品兴趣。" actions={<div className="dashboard-filters"><Select value={range} onChange={(value) => setRange(String(value))} optionList={[{ value: "today", label: "Today" }, { value: "7", label: "7 Days" }, { value: "30", label: "30 Days" }, { value: "month", label: "This Month" }, { value: "quarter", label: "Quarter" }, { value: "custom", label: "Custom Range" }]} />{range === "custom" && <><Input type="date" value={custom.from} onChange={(value) => setCustom((current) => ({ ...current, from: value }))} aria-label="From date" /><Input type="date" value={custom.to} onChange={(value) => setCustom((current) => ({ ...current, to: value }))} aria-label="To date" /></>}{isHq && <Select value={distributorId} onChange={(value) => setDistributorId(String(value))} optionList={[{ value: "all", label: "All Distributors" }, ...state.distributors.map((item) => ({ value: item.id, label: item.name }))]} />}</div>} />
    <div className="dashboard-kpis">{[
      ["New Leads", leads.filter((item) => item.status === "NEW").length], ["Qualified Leads", qualified], ["New Deals", deals.length], ["Open Deals", open], ["Won Deals", won], ["Lost Deals", lost], ["Lead → Deal", leads.length ? `${Math.round(leads.filter((item) => item.status === "CONVERTED").length / leads.length * 100)}%` : "0%"], ["Deal Win Rate", won + lost ? `${Math.round(won / (won + lost) * 100)}%` : "0%"],
    ].map(([label, value]) => <div key={label}><span>{label}</span><strong>{value}</strong></div>)}</div>
    <div className="dashboard-grid"><ChartPanel title="Lead & Deal Trend" subtitle="Created records over the selected period" wide><ResponsiveContainer width="100%" height={250} debounce={80}><LineChart data={trend}><CartesianGrid stroke="#eceee9" vertical={false} /><XAxis dataKey="label" tickLine={false} axisLine={false} /><YAxis tickLine={false} axisLine={false} allowDecimals={false} /><Tooltip /><Legend /><Line dataKey="Leads" stroke={colors[0]} strokeWidth={2} /><Line dataKey="Deals" stroke={colors[1]} strokeWidth={2} /></LineChart></ResponsiveContainer></ChartPanel>
      <ChartPanel title="Deal Stage Distribution" subtitle="Current pipeline composition"><ResponsiveContainer width="100%" height={250} debounce={80}><BarChart data={stages}><CartesianGrid stroke="#eceee9" vertical={false} /><XAxis dataKey="name" tickLine={false} axisLine={false} /><YAxis allowDecimals={false} tickLine={false} axisLine={false} /><Tooltip /><Bar dataKey="value" fill={colors[1]} radius={[3, 3, 0, 0]} /></BarChart></ResponsiveContainer></ChartPanel>
      <ChartPanel title="Lead → Deal Funnel" subtitle="Qualification through Won"><ResponsiveContainer width="100%" height={250} debounce={80}><BarChart data={funnel} layout="vertical"><CartesianGrid stroke="#eceee9" horizontal={false} /><XAxis type="number" hide /><YAxis dataKey="name" type="category" width={80} tickLine={false} axisLine={false} /><Tooltip /><Bar dataKey="value" fill={colors[0]} radius={[0, 3, 3, 0]} /></BarChart></ResponsiveContainer></ChartPanel>
      {isHq && <ChartPanel title="Deals by Distributor" subtitle="Channel pipeline and Won comparison" wide><ResponsiveContainer width="100%" height={250} debounce={80}><BarChart data={byDistributor}><CartesianGrid stroke="#eceee9" vertical={false} /><XAxis dataKey="name" tickLine={false} axisLine={false} /><YAxis allowDecimals={false} tickLine={false} axisLine={false} /><Tooltip /><Legend /><Bar dataKey="Deals" fill={colors[1]} /><Bar dataKey="Won" fill={colors[0]} /></BarChart></ResponsiveContainer></ChartPanel>}
      <ChartPanel title="Deals by Product" subtitle="Product adoption and Won comparison"><ResponsiveContainer width="100%" height={250} debounce={80}><BarChart data={byProduct}><CartesianGrid stroke="#eceee9" vertical={false} /><XAxis dataKey="name" tickLine={false} axisLine={false} /><YAxis allowDecimals={false} tickLine={false} axisLine={false} /><Tooltip /><Legend /><Bar dataKey="Deals" fill={colors[2]} /><Bar dataKey="Won" fill={colors[0]} /></BarChart></ResponsiveContainer></ChartPanel>
      <ChartPanel title="Add-on Interest & Won" subtitle="Lead interest, active Deals and Won Deals" wide><ResponsiveContainer width="100%" height={300} debounce={80}><BarChart data={addOns} layout="vertical"><CartesianGrid stroke="#eceee9" horizontal={false} /><XAxis type="number" allowDecimals={false} tickLine={false} axisLine={false} /><YAxis dataKey="name" type="category" width={118} tickLine={false} axisLine={false} /><Tooltip /><Legend /><Bar dataKey="Interest" fill={colors[2]} /><Bar dataKey="Deals" fill={colors[1]} /><Bar dataKey="Won" fill={colors[0]} /></BarChart></ResponsiveContainer></ChartPanel>
    </div>
  </div>;
}

function ChartPanel({ title, subtitle, children, wide }: { title: string; subtitle: string; children: React.ReactNode; wide?: boolean }) { return <section className={`chart-panel ${wide ? "is-wide" : ""}`}><header><h2>{title}</h2><p>{subtitle}</p></header><div>{children}</div></section>; }
