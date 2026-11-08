import React, { useMemo } from "react";
import { Animated, View } from "react-native";

import { tokens } from "../../theme";
import { ADVANCE, easedFrames } from "./pathMotionModel";
import { Glyph, LIP, ROCKS, rockBox } from "./Rock";

// A step's tile changing during an advance (see pathMotionModel's ADVANCE), drawn in place of its
// Rock until the advance is over; then the Rock takes over in the very same look. Nothing here is a
// new colour: both looks are the Rock's own (ROCKS), cross-faded, so the native driver runs it all.
// - role "done": the current (or a to-do) step finished: its icon shrinks away, the check pops in,
//   the tile fades to the done colour and, if it had one, its ring shrinks away
// - role "unlock": a to-do step becomes the current one: tile and icon fade over with a small pop,
//   then its ring grows in
// clock: ms since the advance started (an Animated.Value). from / to: the step's status before and
// now; iconFrom / iconTo: the icon of each.
// from -> to over a window of the advance, eased in and out.
export const win = (clock, window, from, to) => clock.interpolate({ ...easedFrames(window, from, to), extrapolate: "clamp" });

export default function StepMorph({ role, from, to, iconFrom, iconTo, size = 84, clock }) {
  const box = rockBox(size);
  const k = size / 84;
  const left = (box.width - size) / 2;
  const top = (box.height - size - LIP) / 2;
  const radius = 26 * k;
  const a = ROCKS[from] ?? ROCKS.todo;
  const b = ROCKS[to] ?? ROCKS.todo;

  const look = useMemo(() => {
    if (role === "unlock") {
      const [u0, u1] = ADVANCE.unlock;
      const [p0, p1] = ADVANCE.pop;
      return {
        newFace: win(clock, ADVANCE.unlock, 0, 1),
        oldIcon: { opacity: win(clock, ADVANCE.unlock, 1, 0), transform: [{ scale: win(clock, ADVANCE.unlock, 1, 0.4) }] },
        newIcon: { opacity: win(clock, [u1, u1 + 120], 0, 1), transform: [{ scale: win(clock, [u1, p1], 0.4, 1) }] },
        pop: clock.interpolate({ inputRange: [u0, p0, ADVANCE.popPeak, p1], outputRange: [1, 1, 1.08, 1], extrapolate: "clamp" }),
        ringOut: null,
        ringIn: { opacity: win(clock, ADVANCE.ringIn, 0, 1), transform: [{ scale: win(clock, ADVANCE.ringIn, ADVANCE.ringInScale, 1) }] },
      };
    }
    const [c0, c1] = ADVANCE.checkIn;
    return {
      newFace: win(clock, ADVANCE.face, 0, 1),
      oldIcon: { opacity: win(clock, ADVANCE.iconOut, 1, 0), transform: [{ scale: win(clock, ADVANCE.iconOut, 1, 0.4) }] },
      newIcon: {
        opacity: win(clock, [c0, (c0 + ADVANCE.checkPeak) / 2], 0, 1),
        transform: [{ scale: clock.interpolate({ inputRange: [c0, ADVANCE.checkPeak, c1], outputRange: [0.4, 1.15, 1], extrapolate: "clamp" }) }],
      },
      pop: 1,
      ringOut: from === "next" ? { opacity: win(clock, ADVANCE.ringOut, 1, 0), transform: [{ scale: win(clock, ADVANCE.ringOut, 1, ADVANCE.ringOutScale) }] } : null,
      ringIn: null,
    };
  }, [role, from, clock]);

  const ring = {
    position: "absolute",
    left: left - 12 * k,
    top: top - 12 * k,
    width: size + 24 * k,
    height: size + 24 * k,
    borderRadius: 36 * k,
    borderWidth: 6 * k,
    borderColor: tokens.accent,
    backgroundColor: tokens.surface,
  };
  const tile = (extra) => ({ position: "absolute", left, width: size, height: size, borderRadius: radius, ...extra });
  const centred = { position: "absolute", left, top, width: size, height: size, alignItems: "center", justifyContent: "center" };

  return (
    <View pointerEvents="none" style={{ width: box.width, height: box.height }}>
      {look.ringOut ? <Animated.View style={[ring, look.ringOut]} /> : null}
      {look.ringIn ? <Animated.View style={[ring, look.ringIn]} /> : null}
      <Animated.View style={{ position: "absolute", left: 0, top: 0, width: box.width, height: box.height, transform: [{ scale: look.pop }] }}>
        {/* the edge and face of the old look, with the new look fading in over them */}
        <View style={tile({ top: top + LIP, backgroundColor: a.lip })} />
        <Animated.View style={[tile({ top: top + LIP, backgroundColor: b.lip }), { opacity: look.newFace }]} />
        <View style={tile({ top, backgroundColor: a.face })} />
        <Animated.View style={[tile({ top, backgroundColor: b.face }), { opacity: look.newFace }]} />
        <Animated.View style={[centred, look.oldIcon]}>
          <Glyph name={iconFrom} ink={a.ink} k={k} />
        </Animated.View>
        <Animated.View style={[centred, look.newIcon]}>
          <Glyph name={iconTo} ink={b.ink} k={k} />
        </Animated.View>
      </Animated.View>
    </View>
  );
}
