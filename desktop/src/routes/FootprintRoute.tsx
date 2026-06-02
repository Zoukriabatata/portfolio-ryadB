// The Footprint UI is mounted persistently at the Layout level so it
// stays alive across route changes — switching to Option Flow / GEX /
// News and coming back doesn't re-bootstrap the bridge connection or
// re-fetch history. The route here is a no-op marker: when react-router
// matches `/footprint`, the Layout shows the persistent pane and hides
// the <Outlet />. We still keep the route registered so navigation
// (links, programmatic navigate) resolves.

export function FootprintRoute() {
  return null;
}
