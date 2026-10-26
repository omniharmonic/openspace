---
title: Store & donations
description: Sell physical and digital products and take donations on an OpenSpace site, with Stripe checkout, no platform fee, stock, shipping, tax and discount codes.
---

OpenSpace stores use **Stripe Checkout on your own Stripe account**. OpenSpace takes **no platform fee** — you pay only Stripe's usual card fees — and card details never touch your site or the Hub.

A store needs [Cloudflare hosting](/grow/members/#hosting), because GitHub Pages' terms don't allow commerce.

## Products

Products are a **collection** in your site's content: title, description, images, price, compare-at price, SKU, options (like size or glaze) and variants with their own prices and availability. Physical or **digital**. Edit them in Studio's **Content** area like blog posts, and show them with product sections — a grid, a carousel or a featured product with **Add to cart**.

Give physical products a **shipping weight** (in grams, packed); variants can have their own. Set **Sold as** to **Monthly** or **Yearly** to sell a **subscription** (a coffee club, a print a month): buyers are charged every period through Stripe Billing until they cancel, the price shows as "$15 / month", and **Orders** marks those orders *Monthly subscription* (or *canceled*). Monthly and yearly subscriptions are checked out separately.

The cart is a tiny script that keeps items in the visitor's browser and opens a slide-out drawer. At checkout, prices are **always re-read from your published catalog** — never trusted from the browser — so a tampered cart can't change what anyone pays.

## Payments

**Store settings → Payments**: press **Connect Stripe** and finish Stripe's onboarding in the new tab. That's it.

Prefer to keep everything in your own accounts? Owners can use **sovereign mode** instead: paste a Stripe secret or restricted key and a webhook signing secret (sent once, never shown again), then add the webhook address shown into Stripe.

Also in store settings:

- **Currency.**
- **Shipping** — up to five options: flat rate, **by weight** (tiers such as "up to 0.5 kg: $5, up to 2 kg: $9"), free over an amount, or local pickup, each with a delivery-time range and the countries you ship to. OpenSpace works out each parcel's weight from your products' shipping weights at checkout (never from the visitor's browser) and only offers the options it fits; subscriptions with physical items charge the cheapest fitting rate with every payment (each renewal ships again); refunding a subscription order in full cancels the subscription.
- **Tax** — turn on Stripe Tax if you want Stripe to calculate it (Stripe charges its own fee for this).
- **Discount codes** — show a code box at checkout and create codes for a percentage or an amount, with a use limit and an end date.
- **Low-stock alerts** — a threshold and who to email.

## Stock

**Products & stock** lists every product and variant. Track stock, step it up or down, or type an amount; *Low* and *Sold out* badges show where attention is needed. Stock is checked at checkout and decremented when payment succeeds — if two people race for the last item, one order is refunded automatically and the buyer is told.

## Orders

**Orders** opens on *To send*, with views for *Sent*, *Refunded* and *Needs attention*. Each order shows its items, totals, customer and shipping address.

- **Mark as sent**, with a tracking number and an optional email to the customer.
- **Refund** in full or in part (designers and owners), restocking if you like.
- Print a **packing slip**.

**Digital products** are delivered automatically: when an order is paid, the buyer gets an email with download links that last seven days.

## Donations

Add a **Donation** block for one-time or **monthly** gifts with suggested amounts and an "other amount" field. Set the smallest and largest gift in **Donations**, where you'll also see gifts received and the total given. Monthly gifts are Stripe subscriptions the donor can cancel.
