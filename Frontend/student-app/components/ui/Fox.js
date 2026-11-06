import React, { useEffect, useRef, useState } from "react";
import { Animated, Easing, Image, Pressable, StyleSheet, View } from "react-native";

import { space, tokens } from "../../theme";
import AppText from "./AppText";
import { useFox as useIdleMotion } from "./anim";
import { useFoxReact, useFoxReaction } from "./FoxContext";
import FoxEffect from "./FoxEffects";
import { useReducedMotion } from "./motion";

// The EA fox, cut out from the brand video's stills (assets/fox, *-cut.png: real transparency, soft
// edges). Because there is no box around it, the fox can stand on any colour and overlap other
// things: she is a companion, not a sticker.
// - "standing": calm. Empty states, and results that need another try.
// - "waving": welcome, good results, milestones.
// - "head": just the head: a small corner companion.
//
// She can feel things. Without `mood` or `reactive` she is a plain picture. With either, she moves:
// - mood: a fixed mood for a screen that knows what it wants ("cheer" on a good result)
// - reactive: she follows the app's fox brain (services/foxBrain.js): cheers when you are right,
//   goes gentle when you are not, dozes off when nothing happens. Use it for the one fox you want
//   to be alive on a screen.
// - tappable: tapping her makes her react (pounce, a heart, a question mark)
// - mirror: a number (1 or -1) or an Animated value that turns her around; only she turns, not her
//   words
// - caption: show the few words the brain gives her, in a small bubble; bubble = where it goes:
//   "center" over her, "left" / "right" over her growing that way, "below" under her at the right
//   (a fox at the top of the screen)
// The drawing here is the image version. A Rive version can replace it later with the same props:
// moods are the animation's states (see MOODS in the brain).
const POSES = {
  standing: require("../../assets/fox/fox-standing-cut.png"),
  waving: require("../../assets/fox/fox-waving-cut.png"),
  head: require("../../assets/fox/fox-head-cut.png"),
};

// The head's picture is wider than tall (160 x 139).
const HEAD_RATIO = 139 / 160;

// Moods that raise a hand: she waves unless she is only a head.
const WAVING = new Set(["greeting", "cheer", "proud"]);

export default function Fox({
  pose = "standing",
  size = 140,
  style,
  decorative = false,
  mood: fixedMood,
  reactive = false,
  fidget = true, // off: no idle head-tilts and sniffs (on a path, where the current step's routine moves)
  tappable = false,
  caption = false,
  bubble = "center",
  mirror,
}) {
  const reaction = useFoxReaction(reactive);
  const react = useFoxReact();
  const mood = reactive ? reaction.mood : fixedMood;
  const nonce = reactive ? reaction.nonce : 0;
  const effect = reactive ? reaction.effect : null;
  const alive = !!mood;

  const shown = pose === "head" ? "head" : WAVING.has(mood) ? "waving" : pose;
  const height = shown === "head" ? Math.round(size * HEAD_RATIO) : size;

  const idle = useIdleMotion(400, fidget && reactive && mood === "idle");
  const moodStyle = useMoodMotion(mood, nonce, alive, mirror);

  // The few words, for a moment.
  const [text, setText] = useState(null);
  const timer = useRef(null);
  useEffect(() => {
    if (!(caption && reactive && reaction.caption)) return;
    setText(reaction.caption);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setText(null), 2800);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reaction.nonce]);
  useEffect(() => () => clearTimeout(timer.current), []);

  const image = (
    <Image
      source={POSES[shown] || POSES.standing}
      style={[{ width: size, height }, !alive && { alignSelf: "center" }, !alive && style]}
      resizeMode="contain"
      accessible={!decorative && !tappable}
      accessibilityRole="image"
      accessibilityLabel={decorative ? undefined : "EA fox"}
      importantForAccessibility={decorative || tappable ? "no-hide-descendants" : "auto"}
    />
  );
  if (!alive) return image;

  return (
    <Animated.View pointerEvents={tappable ? "box-none" : "none"} style={[{ width: size, height, alignSelf: "center" }, style, idle.style]}>
      <Animated.View pointerEvents={tappable ? "box-none" : "none"} style={moodStyle}>
        {tappable ? (
          <Pressable onPress={() => react("tap")} accessibilityRole="button" accessibilityLabel="Pet the fox">
            {image}
          </Pressable>
        ) : (
          image
        )}
      </Animated.View>
      <FoxEffect effect={effect} size={size} nonce={nonce} />
      {text ? (
        <View pointerEvents="none" style={[styles.bubbleBox, bubble === "below" ? { top: height + 6 } : { bottom: height + 4 }, BUBBLE_AT[bubble](size)]}>
          <View style={styles.bubble} accessibilityLiveRegion="polite">
            <AppText variant="label" numberOfLines={2}>
              {text}
            </AppText>
          </View>
        </View>
      ) : null}
    </Animated.View>
  );
}

// Where the bubble sits: over her, or growing to one side (for a fox at the edge of the screen).
const BUBBLE_AT = {
  center: (size) => ({ left: size / 2 - 95, width: 190, alignItems: "center" }),
  left: () => ({ left: 0, width: 190, alignItems: "flex-start" }),
  right: () => ({ right: 0, width: 190, alignItems: "flex-end" }),
  below: () => ({ right: 0, width: 190, alignItems: "flex-end" }),
};

// What her mood looks like in motion, on the pictures she has: hops, tilts and a little squash and
// stretch. (A real animation will have expressions; this is body language.) With Reduce Motion
// nothing moves, only her pose changes.
function useMoodMotion(mood, nonce, enabled, mirror) {
  const reduce = useReducedMotion();
  const y = useRef(new Animated.Value(0)).current;
  const tilt = useRef(new Animated.Value(0)).current; // degrees
  const squash = useRef(new Animated.Value(1)).current; // scaleY
  const grow = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!enabled || reduce) return undefined;
    const t = (value, toValue, duration, easing = Easing.inOut(Easing.quad)) =>
      Animated.timing(value, { toValue, duration, easing, useNativeDriver: true });
    const to = (up, angle, sy, scale, duration) =>
      Animated.parallel([t(y, up, duration), t(tilt, angle, duration), t(squash, sy, duration), t(grow, scale, duration)]);
    const calm = (duration = 250) => to(0, 0, 1, 1, duration);
    const hop = (height) =>
      Animated.sequence([
        Animated.parallel([t(y, -height, 190, Easing.out(Easing.quad)), t(squash, 1.07, 190)]),
        Animated.parallel([t(y, 0, 170, Easing.in(Easing.quad)), t(squash, 1, 170)]),
        t(squash, 0.93, 70),
        Animated.spring(squash, { toValue: 1, friction: 4, useNativeDriver: true }),
      ]);

    let run;
    switch (mood) {
      case "happy":
        run = hop(10);
        break;
      case "greeting":
        run = Animated.sequence([hop(8), t(tilt, -6, 200), Animated.delay(900), t(tilt, 0, 300)]);
        break;
      case "cheer":
        run = Animated.sequence([hop(16), hop(16), t(tilt, 8, 120), t(tilt, -8, 140), t(tilt, 0, 120)]);
        break;
      case "proud":
        run = Animated.sequence([hop(20), hop(20), hop(22), to(0, 0, 1, 1.06, 250), Animated.delay(900), calm(300)]);
        break;
      case "gentle": // a small sag and a tilt of the head: "that's okay"
        run = Animated.sequence([to(3, -9, 0.97, 1, 350), Animated.delay(1300), calm(350)]);
        break;
      case "curious":
        run = Animated.sequence([t(tilt, 12, 280), Animated.delay(1000), t(tilt, 0, 300)]);
        break;
      case "sleepy": // droops and stays that way until something wakes her
        run = to(3, 5, 0.96, 1, 900);
        break;
      case "walking":
        run = Animated.loop(Animated.sequence([t(y, -3, 260), t(y, 0, 260)]));
        break;
      default:
        run = calm();
    }
    run.start();
    return () => run.stop();
  }, [mood, nonce, enabled, reduce, y, tilt, squash, grow]);

  return {
    transform: [
      { translateY: y },
      { rotate: tilt.interpolate({ inputRange: [-90, 90], outputRange: ["-90deg", "90deg"] }) },
      { scaleY: squash },
      { scale: grow },
      ...(mirror === undefined ? [] : [{ scaleX: mirror }]),
    ],
  };
}

const styles = StyleSheet.create({
  bubbleBox: { position: "absolute" },
  bubble: {
    paddingVertical: space.sm,
    paddingHorizontal: space.md,
    borderRadius: 14,
    backgroundColor: tokens.surface,
    borderWidth: 1,
    borderColor: tokens.divider,
    shadowColor: "#2B1A38",
    shadowOpacity: 0.1,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
  },
});
