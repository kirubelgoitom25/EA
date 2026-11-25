// Which chapter Home's banner names, and where Home opens so that chapter is the current one. Pure, so
// it is easy to test. All numbers are in "path view" coordinates: 0 is the banner's bottom edge (the top
// of the part of the path you can see) at scroll 0, growing down; the path itself starts `gap` below it.

export const TILE = 68; // a chapter tile's face (PATH_TILE in Rock.js)

// The chapter at the top: the first tile whose whole face is visible below the banner. A tile tucked
// half behind the banner doesn't count. Scrolled past every tile, the last one.
export function bannerIndex(centers, scrollY, gap) {
  if (!centers.length) return -1;
  const i = centers.findIndex((center) => gap + center - TILE / 2 - scrollY >= 0);
  return i < 0 ? centers.length - 1 : i;
}

// Where Home opens: the current tile right under the banner, with the fox's head on top of it fully in
// view and `room` dp of white above her. foxTop is from the tile's centre up to the top of her head
// (negative). Never above the top.
export function openScroll(centers, index, gap, foxTop, room) {
  if (index < 0 || index >= centers.length) return 0;
  return Math.max(0, Math.round(gap + centers[index] + foxTop - room));
}
