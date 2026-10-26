import { GitHubApiError, GitHubConflictError, GitHubNotFoundError } from "./types";

export const GITHUB_API = "https://api.github.com";
export const GITHUB_WEB = "https://github.com";
export const API_VERSION = "2022-11-28";

export type FetchLike = (input: string | Request | URL, init?: RequestInit) => Promise<Response>;

export interface GitHubRequest {
  method?: string;
  token?: string | null;
  body?: unknown;
  accept?: string;
  /** Return null instead of throwing on 404. */
  allow404?: boolean;
}

/** One GitHub REST call with the standard headers and error mapping. */
export async function githubRequest<T>(
  fetchFn: FetchLike,
  base: string,
  path: string,
  req: GitHubRequest = {},
): Promise<T | null> {
  const headers: Record<string, string> = {
    Accept: req.accept ?? "application/vnd.github+json",
    "X-GitHub-Api-Version": API_VERSION,
    "User-Agent": "openspace-hub",
  };
  if (req.token) headers.Authorization = `Bearer ${req.token}`;
  if (req.body !== undefined) headers["Content-Type"] = "application/json";
  const res = await fetchFn(path.startsWith("http") ? path : `${base}${path}`, {
    method: req.method ?? "GET",
    headers,
    ...(req.body !== undefined ? { body: JSON.stringify(req.body) } : {}),
  });
  if (res.status === 204 || res.status === 205) return null as T | null;
  const text = await res.text();
  let data: unknown = text;
  if (text && (res.headers.get("content-type") ?? "").includes("json")) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }
  if (res.ok) return (text === "" ? null : data) as T | null;
  const apiMessage =
    data && typeof data === "object" && "message" in data ? String(data.message) : "";
  const message = apiMessage || `GitHub ${req.method ?? "GET"} ${path} failed with ${res.status}`;
  if (res.status === 404) {
    if (req.allow404) return null;
    throw new GitHubNotFoundError(message);
  }
  if (res.status === 409) throw new GitHubConflictError(message);
  throw new GitHubApiError(message, res.status, data);
}
