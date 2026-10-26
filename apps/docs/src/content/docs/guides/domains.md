---
title: Domains
description: Connect your own domain name to an OpenSpace site, with registrar-specific steps, live DNS checks and free HTTPS.
---

Every OpenSpace site starts with a free address such as `yourname.github.io/your-site`. You can connect a domain you own, like `fernwoodyoga.com`, at any time.

OpenSpace doesn't sell domains. Buy one from any registrar — at-cost registrars such as Cloudflare Registrar or Porkbun keep it cheap — and connect it in a few minutes.

## Connect a domain

Open **Settings → Domain** in Studio.

1. **Enter your domain.** OpenSpace looks up who your registrar is and where your DNS is hosted.
2. **Add the records.** You get step-by-step instructions for your registrar, with a link to its DNS page and the exact records to add, each with a copy button. For a site on GitHub Pages that's:

   | Type | Name | Value |
   |---|---|---|
   | A | `@` (your domain) | `185.199.108.153` |
   | A | `@` | `185.199.109.153` |
   | A | `@` | `185.199.110.153` |
   | A | `@` | `185.199.111.153` |
   | CNAME | `www` | `yourname.github.io` |

   Optional AAAA (IPv6) records are listed too.
3. **Connect.** A live checklist re-checks your DNS every 15 seconds — "✓ www points to GitHub — waiting for the main domain" — until everything is in place. DNS changes can take from a few minutes to a few hours.
4. **Secure and live.** When the HTTPS certificate is ready, OpenSpace turns on HTTPS, switches your site to the new address and republishes. Both `yourdomain.com` and `www.yourdomain.com` work; one redirects to the other.

To disconnect, use **Remove domain** on the same page.

## Sites on Cloudflare hosting

If your site uses [Cloudflare hosting](/grow/members/#hosting) (for stores and members-only pages), add the domain to your site's Worker in your Cloudflare dashboard instead — easiest when the domain's DNS is already on Cloudflare. The Domain tab explains this.

## Email at your domain

OpenSpace doesn't host email inboxes. Free forwarding such as Cloudflare Email Routing can send `hello@yourdomain.com` to the inbox you already use.

## Doing it by hand

Sites made with the CLI can set `deploy.customDomain` in `openspace.json`, add the DNS records above, and enter the domain under the repository's **Settings → Pages → Custom domain**, ticking **Enforce HTTPS** once the certificate is issued.
