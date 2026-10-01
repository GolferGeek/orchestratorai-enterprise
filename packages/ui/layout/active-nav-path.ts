/**
 * The nav path a route belongs to: the longest nav path that is the route or
 * a parent of it, so a product's overview (/app/gatehouse) is not lit on its
 * other pages (/app/gatehouse/agents). Null when none matches.
 */
export function activeNavPath(paths: Array<string | undefined>, routePath: string): string | null {
  const matching = paths.filter((path): path is string => !!path && (routePath === path || routePath.startsWith(path + '/')));
  return matching.sort((a, b) => b.length - a.length)[0] ?? null;
}
