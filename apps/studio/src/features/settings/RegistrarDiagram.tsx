import type { DnsRecord, RegistrarGuide } from "../../api";

/**
 * FR-50 "registrar-specific screenshots": an illustrated diagram of each of the top 8
 * registrars' DNS screen, drawn as inline SVG (no external screenshots to go stale or leak
 * tracking): where the screen is, its exact tab and button names, and the exact field names with
 * the first record filled in. Numbered markers match the steps listed beside it.
 */
export interface RegistrarScreen {
  /** Breadcrumb to the DNS screen, in the registrar's words. */
  path: string[];
  /** Tabs across the top of the screen; `active` is the one with the records. */
  tabs: string[];
  active: string;
  /** Heading of the records area. */
  section: string;
  /** The "add a record" button. */
  add: string;
  /** Record form columns, in screen order, using the registrar's own field names. */
  columns: Array<{
    label: string;
    role: "type" | "host" | "value" | "ttl" | "proxy" | "priority";
  }>;
  /** What the TTL (and proxy) fields should say. */
  ttl: string;
  proxy?: string;
  /** The save control. */
  save: string;
}

export const REGISTRAR_SCREENS: Record<string, RegistrarScreen> = {
  namecheap: {
    path: ["Domain List", "Manage"],
    tabs: ["Domain", "Products", "Sharing & Transfer", "Advanced DNS"],
    active: "Advanced DNS",
    section: "HOST RECORDS",
    add: "ADD NEW RECORD",
    columns: [
      { label: "Type", role: "type" },
      { label: "Host", role: "host" },
      { label: "Value", role: "value" },
      { label: "TTL", role: "ttl" },
    ],
    ttl: "Automatic",
    save: "✓",
  },
  godaddy: {
    path: ["Domain Portfolio", "DNS"],
    tabs: ["DNS Records", "Forwarding", "Nameservers", "Hostnames"],
    active: "DNS Records",
    section: "DNS Records",
    add: "Add New Record",
    columns: [
      { label: "Type", role: "type" },
      { label: "Name", role: "host" },
      { label: "Value", role: "value" },
      { label: "TTL", role: "ttl" },
    ],
    ttl: "1/2 Hour",
    save: "Save",
  },
  cloudflare: {
    path: ["Your domain", "DNS", "Records"],
    tabs: ["Overview", "DNS", "SSL/TLS", "Rules"],
    active: "DNS",
    section: "DNS management",
    add: "+ Add record",
    columns: [
      { label: "Type", role: "type" },
      { label: "Name", role: "host" },
      { label: "IPv4 address / Target", role: "value" },
      { label: "Proxy status", role: "proxy" },
      { label: "TTL", role: "ttl" },
    ],
    ttl: "Auto",
    proxy: "DNS only",
    save: "Save",
  },
  squarespace: {
    path: ["Domains", "DNS", "DNS Settings"],
    tabs: ["Overview", "DNS", "Email", "Domain Forwarding"],
    active: "DNS",
    section: "Custom records",
    add: "ADD RECORD",
    columns: [
      { label: "Host", role: "host" },
      { label: "Type", role: "type" },
      { label: "Priority", role: "priority" },
      { label: "TTL", role: "ttl" },
      { label: "Data", role: "value" },
    ],
    ttl: "1 hr",
    save: "SAVE",
  },
  porkbun: {
    path: ["Domain Management", "DNS"],
    tabs: ["Details", "DNS", "URL Forwarding", "Email"],
    active: "DNS",
    section: "Manage DNS Records",
    add: "Add",
    columns: [
      { label: "Type", role: "type" },
      { label: "Host", role: "host" },
      { label: "Answer", role: "value" },
      { label: "TTL", role: "ttl" },
    ],
    ttl: "600",
    save: "Add",
  },
  hover: {
    path: ["Domains", "Your domain"],
    tabs: ["Overview", "DNS", "Email", "Advanced"],
    active: "DNS",
    section: "DNS Records",
    add: "ADD A RECORD",
    columns: [
      { label: "Type", role: "type" },
      { label: "Hostname", role: "host" },
      { label: "IP Address / Target", role: "value" },
      { label: "TTL", role: "ttl" },
    ],
    ttl: "Default",
    save: "Save",
  },
  gandi: {
    path: ["Domain", "Your domain"],
    tabs: ["Overview", "Nameservers", "DNS Records", "Web Forwarding"],
    active: "DNS Records",
    section: "DNS Records",
    add: "Add record",
    columns: [
      { label: "Type", role: "type" },
      { label: "TTL", role: "ttl" },
      { label: "Name", role: "host" },
      { label: "IPv4 address / Hostname", role: "value" },
    ],
    ttl: "10800",
    save: "Create",
  },
  namecom: {
    path: ["My Domains", "Manage DNS Records"],
    tabs: ["Details", "DNS Records", "URL Forwarding", "Nameservers"],
    active: "DNS Records",
    section: "DNS Records",
    add: "ADD RECORD",
    columns: [
      { label: "Type", role: "type" },
      { label: "Host", role: "host" },
      { label: "Answer", role: "value" },
      { label: "TTL", role: "ttl" },
    ],
    ttl: "300",
    save: "ADD RECORD",
  },
};

const W = 600;
const H = 252;

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** The value each column shows for a record on this registrar. */
function cell(
  screen: RegistrarScreen,
  role: RegistrarScreen["columns"][number]["role"],
  record: DnsRecord,
  hostApex: string,
): string {
  switch (role) {
    case "type":
      return record.type;
    case "host":
      return record.host === "@" ? hostApex || "(empty)" : record.host;
    case "value":
      return record.value;
    case "ttl":
      return screen.ttl;
    case "proxy":
      return screen.proxy ?? "";
    case "priority":
      return "—";
  }
}

export function RegistrarDiagram({
  guide,
  records,
}: {
  guide: RegistrarGuide;
  records: DnsRecord[];
}) {
  const screen = REGISTRAR_SCREENS[guide.id];
  const record = records.find((r) => !r.optional) ?? records[0];
  if (!screen || !record) return null;
  const host = (() => {
    try {
      return guide.dnsUrl ? new URL(guide.dnsUrl).host : "";
    } catch {
      return "";
    }
  })();
  // Columns share the table width in proportion to what they hold.
  const weights = screen.columns.map((c) =>
    c.role === "value" ? 3 : c.role === "proxy" ? 1.6 : c.role === "host" ? 1.2 : 1,
  );
  const total = weights.reduce((a, b) => a + b, 0);
  const tableX = 24;
  const tableW = W - 48;
  let x = tableX;
  const cols = screen.columns.map((c, i) => {
    const w = (tableW * (weights[i] ?? 1)) / total;
    const out = { ...c, x, w };
    x += w;
    return out;
  });
  const hostCol = cols.find((c) => c.role === "host");
  const tabW = 118;
  const activeIndex = Math.max(0, screen.tabs.indexOf(screen.active));
  const label = `${guide.name}: ${screen.path.join(" › ")}. Open the ${screen.active} tab, find ${screen.section}, press “${screen.add}”, then fill in ${screen.columns
    .map((c) => `${c.label}: ${cell(screen, c.role, record, guide.hostApex)}`)
    .join(", ")}, and press “${screen.save}”.`;
  const marker = (n: number, cx: number, cy: number) => (
    <g className="st-regd__marker" key={`m${n}`}>
      <circle cx={cx} cy={cy} r={9} />
      <text x={cx} y={cy + 3.5} textAnchor="middle">
        {n}
      </text>
    </g>
  );
  return (
    <figure className="st-regd">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={label}
        className="st-regd__svg"
        data-registrar={guide.id}
      >
        {/* Browser window */}
        <rect className="st-regd__frame" x={0.5} y={0.5} width={W - 1} height={H - 1} rx={8} />
        <rect className="st-regd__bar" x={0.5} y={0.5} width={W - 1} height={26} rx={8} />
        <circle className="st-regd__dot" cx={14} cy={13} r={3.5} />
        <circle className="st-regd__dot" cx={26} cy={13} r={3.5} />
        <circle className="st-regd__dot" cx={38} cy={13} r={3.5} />
        <rect className="st-regd__url" x={56} y={6} width={260} height={14} rx={7} />
        <text className="st-regd__small" x={66} y={16.5}>
          {clip(host, 40)}
        </text>
        {/* Breadcrumb */}
        <text className="st-regd__crumb" x={24} y={46}>
          {screen.path.join("  ›  ")}
        </text>
        {/* Tabs */}
        {screen.tabs.map((t, i) => (
          <g key={t}>
            <text
              className={i === activeIndex ? "st-regd__tab is-active" : "st-regd__tab"}
              x={24 + i * tabW}
              y={70}
            >
              {clip(t, 18)}
            </text>
            {i === activeIndex && (
              <rect
                className="st-regd__accent"
                x={24 + i * tabW}
                y={75}
                width={tabW - 18}
                height={2}
              />
            )}
          </g>
        ))}
        <line className="st-regd__rule" x1={24} x2={W - 24} y1={78} y2={78} />
        {marker(1, 24 + activeIndex * tabW + tabW - 26, 66)}
        {/* Section + add button */}
        <text className="st-regd__section" x={24} y={102}>
          {screen.section}
        </text>
        <rect className="st-regd__button" x={W - 24 - 132} y={89} width={132} height={20} rx={4} />
        <text className="st-regd__buttontext" x={W - 24 - 66} y={103} textAnchor="middle">
          {clip(screen.add, 20)}
        </text>
        {marker(2, W - 24 - 142, 99)}
        {/* Column headers */}
        <rect className="st-regd__head" x={tableX} y={118} width={tableW} height={22} />
        {cols.map((c) => (
          <text key={c.label} className="st-regd__th" x={c.x + 6} y={133}>
            {clip(c.label, Math.max(4, Math.floor(c.w / 6.2)))}
          </text>
        ))}
        {/* The new record, filled in */}
        <rect className="st-regd__row" x={tableX} y={144} width={tableW} height={30} rx={3} />
        {cols.map((c) => (
          <g key={`v-${c.label}`}>
            <rect
              className="st-regd__input"
              x={c.x + 4}
              y={149}
              width={c.w - 8}
              height={20}
              rx={3}
            />
            <text className="st-regd__value" x={c.x + 9} y={163}>
              {clip(
                cell(screen, c.role, record, guide.hostApex),
                Math.max(3, Math.floor((c.w - 14) / 6.4)),
              )}
            </text>
          </g>
        ))}
        {hostCol && marker(3, hostCol.x + hostCol.w - 10, 186)}
        {/* Other rows (existing records) */}
        <rect
          className="st-regd__ghost"
          x={tableX}
          y={180}
          width={tableW * 0.6}
          height={8}
          rx={4}
        />
        <rect
          className="st-regd__ghost"
          x={tableX}
          y={196}
          width={tableW * 0.45}
          height={8}
          rx={4}
        />
        {/* Save */}
        <rect className="st-regd__save" x={W - 24 - 84} y={214} width={84} height={22} rx={4} />
        <text className="st-regd__buttontext" x={W - 24 - 42} y={229} textAnchor="middle">
          {screen.save}
        </text>
        {marker(4, W - 24 - 94, 225)}
      </svg>
      <figcaption className="st-regd__caption">
        <span>
          <strong>{screen.active}</strong> → <strong>{screen.add}</strong> → fill in{" "}
          {screen.columns.map((c, i) => (
            <span key={c.label}>
              {i > 0 ? ", " : ""}
              <strong>{c.label}</strong>
            </span>
          ))}{" "}
          → <strong>{screen.save}</strong>
        </span>
      </figcaption>
    </figure>
  );
}
