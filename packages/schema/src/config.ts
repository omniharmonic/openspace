import { z } from "zod";
import { SiteIdSchema } from "./ids";
import { SemverSchema, SlugSchema } from "./primitives";
import { named } from "./registry";

/** Hub and deploy URLs may point at localhost in dev mode, so any http(s) host is allowed. */
const ServiceUrlSchema = z.url({ protocol: /^https?$/ });

/** A bare hostname such as `mayayoga.com` or `www.mayayoga.com`. */
export const HostnameSchema = z
  .string()
  .regex(/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/, {
    message: "Expected a hostname such as example.com",
  });

export const DEPLOY_TARGETS = ["github-pages", "cloudflare"] as const;

/** `openspace.json` at the root of a site repo (arch §2.2). */
export const SiteConfigSchema = named(
  "SiteConfig",
  "openspace.json: site id, schema version, template, Hub URL, deploy target and feature flags.",
  z.strictObject({
    $schema: z.string().optional(),
    siteId: SiteIdSchema,
    schemaVersion: z.int().min(1),
    template: z.strictObject({ id: SlugSchema, version: SemverSchema }),
    hub: ServiceUrlSchema,
    deploy: z.strictObject({
      target: z.enum(DEPLOY_TARGETS),
      /** Where the site is served before (or without) a custom domain. */
      url: ServiceUrlSchema,
      customDomain: HostnameSchema.nullable(),
    }),
    features: z.strictObject({
      forms: z.boolean(),
      newsletter: z.boolean(),
      analytics: z.boolean(),
      search: z.boolean(),
    }),
  }),
);
export type SiteConfig = z.infer<typeof SiteConfigSchema>;
export type DeployTarget = SiteConfig["deploy"]["target"];
