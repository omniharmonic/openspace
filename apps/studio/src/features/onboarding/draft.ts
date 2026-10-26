/**
 * The new-site form survives the GitHub sign-in round trip (the browser
 * leaves Studio and comes back) via sessionStorage.
 */
export interface SiteDraft {
  template: string;
  look: string;
  name: string;
  tagline: string;
  brandColor?: string;
  logo?: string;
}

const key = (template: string) => `openspace.newSite.${template}`;

export function loadDraft(template: string): SiteDraft | null {
  try {
    const raw = sessionStorage.getItem(key(template));
    return raw ? (JSON.parse(raw) as SiteDraft) : null;
  } catch {
    return null;
  }
}

export function saveDraft(draft: SiteDraft): void {
  try {
    sessionStorage.setItem(key(draft.template), JSON.stringify(draft));
  } catch {
    // A large logo can exceed the quota; the flow still works without persistence.
    try {
      const { logo: _logo, ...rest } = draft;
      sessionStorage.setItem(key(draft.template), JSON.stringify(rest));
    } catch {
      // Storage unavailable (private mode); nothing else to do.
    }
  }
}

export function clearDraft(template: string): void {
  try {
    sessionStorage.removeItem(key(template));
  } catch {
    // ignore
  }
}
