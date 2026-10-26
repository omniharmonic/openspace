/**
 * Registrar-specific instructions for the custom domain wizard (PRD FR-50): the top 8 registrars.
 * Studio renders `steps` next to the exact records; `hostApex` is what that registrar's "Host" /
 * "Name" field wants for the bare domain. Screenshots are Studio assets keyed by `id`.
 */

export interface RegistrarGuide {
  id: string;
  name: string;
  /** Where the person manages DNS for their domains. */
  dnsUrl: string;
  /** What to type in the host/name field for the apex record ("@" or empty). */
  hostApex: string;
  steps: string[];
  /** Registrar defaults that commonly get in the way (parking pages, forwarding). */
  watchOut: string[];
  /** Matched against the RDAP registrar name. */
  registrarPattern: RegExp;
  /** Matched against the domain's nameservers (where DNS is actually hosted). */
  nameserverPattern: RegExp;
}

export const REGISTRARS: RegistrarGuide[] = [
  {
    id: "namecheap",
    name: "Namecheap",
    dnsUrl: "https://ap.www.namecheap.com/domains/list/",
    hostApex: "@",
    steps: [
      "Sign in to Namecheap and open Domain List.",
      "Click Manage next to your domain, then open the Advanced DNS tab.",
      "Under Host Records, click Add New Record for each record below (Host “@” for the main domain, “www” for www).",
      "Click the green check mark to save each record.",
    ],
    watchOut: [
      "Delete the default “URL Redirect Record” and “parkingpage” CNAME if they are there.",
      "Nameservers must be set to “Namecheap BasicDNS” for these records to take effect.",
    ],
    registrarPattern: /namecheap/i,
    nameserverPattern: /registrar-servers\.com$/i,
  },
  {
    id: "godaddy",
    name: "GoDaddy",
    dnsUrl: "https://dcc.godaddy.com/control/portfolio",
    hostApex: "@",
    steps: [
      "Sign in to GoDaddy and open your Domain Portfolio.",
      "Select your domain, then choose DNS.",
      "Click Add New Record and add each record below (Name “@” for the main domain).",
      "For www, edit the existing CNAME record named “www” instead of adding a second one.",
    ],
    watchOut: [
      "Delete the default A record that points to “Parked”.",
      "Turn off Domain Forwarding if it is on.",
    ],
    registrarPattern: /godaddy|wild west domains/i,
    nameserverPattern: /domaincontrol\.com$/i,
  },
  {
    id: "cloudflare",
    name: "Cloudflare",
    dnsUrl: "https://dash.cloudflare.com/",
    hostApex: "@",
    steps: [
      "Sign in to Cloudflare and select your domain.",
      "Open DNS → Records and click Add record for each record below (Name “@” for the main domain).",
      "Set Proxy status to “DNS only” (grey cloud) for these records so GitHub can issue the certificate.",
      "Click Save.",
    ],
    watchOut: [
      "Records left “Proxied” (orange cloud) stop the security certificate from being issued.",
    ],
    registrarPattern: /cloudflare/i,
    nameserverPattern: /\.ns\.cloudflare\.com$/i,
  },
  {
    id: "squarespace",
    name: "Squarespace Domains (formerly Google Domains)",
    dnsUrl: "https://account.squarespace.com/domains",
    hostApex: "@",
    steps: [
      "Sign in to Squarespace and open Domains.",
      "Select your domain, then DNS → DNS Settings.",
      "Under Custom records, click Add record for each record below (Host “@” for the main domain).",
      "Save after each record.",
    ],
    watchOut: [
      "Remove the Squarespace Defaults preset if the domain still points to a Squarespace site.",
      "Turn off domain forwarding for the domain and for www.",
    ],
    registrarPattern: /squarespace|google/i,
    nameserverPattern: /googledomains\.com$|squarespacedns\.com$/i,
  },
  {
    id: "porkbun",
    name: "Porkbun",
    dnsUrl: "https://porkbun.com/account/domainsSpeedy",
    hostApex: "",
    steps: [
      "Sign in to Porkbun and open Domain Management.",
      "Click DNS next to your domain.",
      "Add each record below. Leave Host empty for the main domain; type “www” for www.",
      "Click Add after each record.",
    ],
    watchOut: [
      "Delete the default ALIAS and CNAME records that point to “pixie.porkbun.com” (the parking page).",
    ],
    registrarPattern: /porkbun/i,
    nameserverPattern: /porkbun\.com$/i,
  },
  {
    id: "hover",
    name: "Hover",
    dnsUrl: "https://www.hover.com/control_panel/domains",
    hostApex: "@",
    steps: [
      "Sign in to Hover and select your domain.",
      "Open the DNS tab and click Add A Record for each address below (Hostname “@”).",
      "Then add a CNAME record with Hostname “www” and the target below.",
      "Save each record.",
    ],
    watchOut: ["Delete Hover's default “@” and “*” records that point to the Hover parking page."],
    registrarPattern: /hover|tucows/i,
    nameserverPattern: /hover\.com$/i,
  },
  {
    id: "gandi",
    name: "Gandi",
    dnsUrl: "https://admin.gandi.net/domain/",
    hostApex: "@",
    steps: [
      "Sign in to Gandi and select your domain.",
      "Open the DNS Records tab and click Add record for each record below (Name “@” for the main domain).",
      "Click Create after each record.",
    ],
    watchOut: [
      "Gandi adds an “@” A record and a “www” CNAME to its web-redirect service by default — delete or edit them.",
    ],
    registrarPattern: /gandi/i,
    nameserverPattern: /gandi\.net$/i,
  },
  {
    id: "namecom",
    name: "Name.com",
    dnsUrl: "https://www.name.com/account/domain",
    hostApex: "",
    steps: [
      "Sign in to Name.com and open My Domains.",
      "Select your domain, then Manage DNS Records.",
      "Add each record below. Leave Host empty for the main domain; type “www” for www.",
      "Click Add Record after each one.",
    ],
    watchOut: ["Remove any URL forwarding set up for the domain."],
    registrarPattern: /name\.com/i,
    nameserverPattern: /name\.com$/i,
  },
];

/** Generic steps when the registrar isn't one of the eight. */
export const GENERIC_GUIDE = {
  id: "other",
  name: "Your domain provider",
  dnsUrl: null,
  hostApex: "@",
  steps: [
    "Sign in where you bought your domain and find the DNS settings (sometimes called “DNS records”, “Zone editor” or “Advanced DNS”).",
    "Add each record below. Use “@” (or leave it empty) for the main domain and “www” for www.",
    "Remove any parking-page, forwarding or other A records for the main domain.",
  ],
  watchOut: [],
};

export function guideFor(
  registrarName: string | null,
  nameservers: string[],
): RegistrarGuide | null {
  for (const ns of nameservers) {
    const hit = REGISTRARS.find((r) => r.nameserverPattern.test(ns.replace(/\.$/, "")));
    if (hit) return hit;
  }
  if (registrarName) return REGISTRARS.find((r) => r.registrarPattern.test(registrarName)) ?? null;
  return null;
}

export function publicGuide(g: RegistrarGuide | typeof GENERIC_GUIDE) {
  return {
    id: g.id,
    name: g.name,
    dnsUrl: g.dnsUrl,
    hostApex: g.hostApex,
    steps: g.steps,
    watchOut: g.watchOut,
  };
}
