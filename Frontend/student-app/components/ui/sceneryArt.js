// PATH_ART: the path screens' seamless background tile (2026-11-12 path fixes; see its own note).
// The scenery artwork supplied with the 2026-11-11 UI polish handoff (section 5a), verbatim. Do not
// edit these by hand: they are drawn with react-native-svg's SvgXml exactly as supplied.
//   FOOTER_ART  bg_lesson_footer_1.svg 390 x 150, pinned to the bottom of question and result screens
// From the 2026-11-12 Leaderboard and Profile handoff (part 2):
//   PODIUM_ART  bg_podium.svg          358 x 236, behind the leaderboard's top three
//   PROFILE_ART bg_profile_1.svg       390 x 260, the profile header (runs up behind the status bar)
// From the 2026-11-12 Courses handoff (part 3):
//   COURSES_FOOTER_ART bg_courses_footer.svg 390 x 240, pinned above the nav bar on the Courses tab

// The path screens' background (2026-11-12 path fixes, section 5), one tile repeated straight down with
// no mirroring. It meets itself with no seam: the near hill at the bottom (cy 720) runs past the tile's
// edge, so the same hill is drawn again 700 higher (cy 20), first, under everything else, as the copy
// above leaves it; and no tree crosses the top or bottom edge. Its hills and trees are those of the
// lesson path's old artwork (bg_chapter_path), with the right-hand pair of pines moved up to sit clear
// of the hills' edges and the lone pine at the bottom given its trunk, as in reference_path_long.png.
export const PATH_ART = {
  width: 390,
  height: 700,
  xml: `<svg xmlns="http://www.w3.org/2000/svg" width="390" height="700" viewBox="0 0 390 700">
<rect width="390" height="700" fill="#EAF3EC"/>
<ellipse cx="120" cy="20" rx="330" ry="120" fill="#BFDAC7"/>
<ellipse cx="330" cy="200" rx="230" ry="95" fill="#DFEDE3"/>
<ellipse cx="40" cy="360" rx="250" ry="105" fill="#D5E7DB"/>
<ellipse cx="350" cy="530" rx="270" ry="115" fill="#CAE1D1"/>
<ellipse cx="120" cy="720" rx="330" ry="120" fill="#BFDAC7"/>
<g fill="#8FBFA3"><path d="M52 150l16 30H36z"/><path d="M52 168l19 32H33z"/><path d="M345 299l16 30h-32z"/><path d="M345 317l19 32h-38z"/><path d="M44 468l15 28H29z"/><path d="M44 485l18 30H26z"/></g>
<g fill="#7DB093"><path d="M24 172l12 22H12z"/><path d="M24 185l14 24H10z"/><path d="M319 321l12 22h-24z"/><path d="M319 334l14 24h-28z"/><path d="M340 610l13 24h-26z"/></g>
<g fill="#B58A63"><rect x="49" y="200" width="6" height="9" rx="2"/><rect x="21" y="209" width="6" height="8" rx="2"/><rect x="342" y="349" width="6" height="9" rx="2"/><rect x="316" y="358" width="6" height="8" rx="2"/><rect x="41" y="515" width="6" height="9" rx="2"/><rect x="337" y="634" width="6" height="8" rx="2"/></g>
</svg>`,
};

// What shows above the first copy and below the last.
export const PATH_ART_FILL = "#EAF3EC";
// The colour at the tile's top and bottom edge, all the way across (its near hill).
export const PATH_ART_SEAM = "#BFDAC7";

export const FOOTER_ART = {
  width: 390,
  height: 150,
  xml: `<svg xmlns="http://www.w3.org/2000/svg" width="390" height="150" viewBox="0 0 390 150">
<ellipse cx="60" cy="160" rx="250" ry="100" fill="#E1EEE5"/><ellipse cx="340" cy="175" rx="240" ry="95" fill="#D5E7DB"/>
<g fill="#A8CDB6"><path d="M352 52l14 26h-28z"/><path d="M352 68l17 28h-34z"/></g>
</svg>`,
};

export const PODIUM_ART = {
  width: 358,
  height: 236,
  xml: `<svg xmlns="http://www.w3.org/2000/svg" width="358" height="236" viewBox="0 0 358 236">
<rect width="358" height="236" fill="#EAF3EC"/>
<path d="M262 44a10 10 0 0 1 3-19 14 14 0 0 1 27-3 11 11 0 0 1 18 7 8 8 0 0 1 1 15z" fill="#fff"/>
<ellipse cx="50" cy="236" rx="200" ry="92" fill="#DFEDE3"/>
<ellipse cx="320" cy="250" rx="210" ry="100" fill="#D5E7DB"/>
<ellipse cx="179" cy="296" rx="270" ry="92" fill="#CAE1D1"/>
<path d="M36 58a8 8 0 0 1 2-15 11 11 0 0 1 21-2 9 9 0 0 1 14 5 6 6 0 0 1 1 12z" fill="#fff"/>
</svg>`,
};

export const PROFILE_ART = {
  width: 390,
  height: 260,
  xml: `<svg xmlns="http://www.w3.org/2000/svg" width="390" height="260" viewBox="0 0 390 260">
<rect width="390" height="260" fill="#EAF3EC"/>
<path d="M290 92a10 10 0 0 1 3-19 14 14 0 0 1 27-3 11 11 0 0 1 18 7 8 8 0 0 1 1 15z" fill="#fff"/>
<path d="M44 108a8 8 0 0 1 2-15 11 11 0 0 1 21-2 9 9 0 0 1 14 5 6 6 0 0 1 1 12z" fill="#fff"/>
<ellipse cx="30" cy="270" rx="230" ry="84" fill="#DFEDE3"/>
<ellipse cx="370" cy="280" rx="240" ry="90" fill="#D5E7DB"/>
<g fill="#8FBFA3"><path d="M40 140l13 24H27z"/><path d="M40 154l16 26H24z"/><path d="M352 130l13 24h-26z"/><path d="M352 144l16 26h-32z"/></g>
<g fill="#7DB093"><path d="M64 160l10 18H54z"/><path d="M64 171l12 20H52z"/></g>
<g fill="#B58A63"><rect x="37" y="180" width="6" height="8" rx="2"/><rect x="349" y="170" width="6" height="8" rx="2"/><rect x="61" y="191" width="6" height="7" rx="2"/></g>
</svg>`,
};

export const COURSES_FOOTER_ART = {
  width: 390,
  height: 240,
  xml: `<svg xmlns="http://www.w3.org/2000/svg" width="390" height="240" viewBox="0 0 390 240">
<path d="M276 62a10 10 0 0 1 3-19 14 14 0 0 1 27-3 11 11 0 0 1 18 7 8 8 0 0 1 1 15z" fill="#fff"/>
<ellipse cx="40" cy="230" rx="240" ry="120" fill="#E4EFE7"/>
<ellipse cx="350" cy="260" rx="250" ry="130" fill="#DAEADF"/>
<ellipse cx="170" cy="300" rx="300" ry="110" fill="#CFE3D6"/>
<g fill="#9CC8AE"><path d="M48 96l15 28H33z"/><path d="M48 113l18 30H30z"/><path d="M330 120l15 28h-30z"/><path d="M330 137l18 30h-36z"/></g>
<g fill="#8ABB9F"><path d="M76 122l11 20H65z"/><path d="M76 134l13 22H63z"/><path d="M360 146l11 20h-22z"/><path d="M360 158l13 22h-26z"/></g>
<g fill="#B58A63"><rect x="45" y="143" width="6" height="9" rx="2"/><rect x="73" y="156" width="6" height="8" rx="2"/><rect x="327" y="167" width="6" height="9" rx="2"/><rect x="357" y="180" width="6" height="8" rx="2"/></g>
</svg>`,
};

