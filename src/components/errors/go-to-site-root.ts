/**
 * Full page load of the site root. Used by app/global-error.tsx, which replaces the root layout: after a root-layout failure the
 * client router may be unusable, so "home" must not rely on client-side routing. Kept in its own module so tests can replace it
 * (jsdom's `location.assign` cannot be spied on).
 */
export function goToSiteRoot(): void {
  window.location.assign(window.location.origin);
}
