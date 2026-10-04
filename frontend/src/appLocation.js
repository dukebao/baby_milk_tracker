// CRA sets PUBLIC_URL at build time; local development stays at the origin root.
export const appBasePath = new URL(process.env.PUBLIC_URL || "/", window.location.origin).pathname.replace(/\/$/, "");
export function appUrl(path) {
  return `${window.location.origin}${appBasePath}${path.startsWith("/") ? path : `/${path}`}`;
}
export function isInviteLocation() {
  return window.location.pathname.slice(appBasePath.length).startsWith("/join/");
}
