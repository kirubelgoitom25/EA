import { useCallback, useEffect, useMemo, useState } from "react";
import { Animated, Easing } from "react-native";

import { useReducedMotion } from "./motion";
import { ARRIVAL, arrivalPlan, firstOpen, foxFrames, riseFrames } from "./pathMotionModel";

// The course page's arrival: the first time a course opens in a session, the header fades in and
// its chapters appear one by one, the dotted line drawing on behind them, and last the fox slides in.
// One clock on the native driver drives it all, so nothing here touches the JS thread or takes
// touches: everything stays tappable from the first frame. With reduce motion it never plays.
//
// useArrival(key) returns null when nothing plays. Otherwise:
// - start(input): the page is laid out, so go (input: see arrivalPlan); only the first call counts
// - plan: what start worked out (null until then)
// - looks: styles for the Animated views. They are built once per plan and must be passed as they
//   are: a new style mid-run would be drawn from the clock's JS value, which the native driver does
//   not update. Until start, everything is hidden.
const HIDDEN = { opacity: 0 };

const fade = (clock, start, duration) =>
  clock.interpolate({ inputRange: [start, start + duration], outputRange: [0, 1], extrapolate: "clamp" });

function riseStyle(clock, at) {
  const { inputRange, opacity, y, scale } = riseFrames(at);
  const by = (outputRange) => clock.interpolate({ inputRange, outputRange, extrapolate: "clamp" });
  return { opacity: by(opacity), transform: [{ translateY: by(y) }, { scale: by(scale) }] };
}

function buildLooks(clock, plan) {
  const { duration, lift } = ARRIVAL.header;
  const header = {
    opacity: fade(clock, 0, duration),
    transform: [{ translateY: clock.interpolate({ inputRange: [0, duration], outputRange: [-lift, 0], extrapolate: "clamp" }) }],
  };
  if (!plan) {
    return { header, rise: () => HIDDEN, label: () => HIDDEN, words: () => HIDDEN, fox: HIDDEN, lineClip: HIDDEN, lineHold: null };
  }

  const each = (build) => Object.fromEntries(Object.entries(plan.at).map(([i, at]) => [i, build(at)]));
  const rise = each((at) => riseStyle(clock, at));
  const label = each((at) => fade(clock, at + ARRIVAL.label.after, ARRIVAL.label.duration));
  const words = each((at) => fade(clock, at + ARRIVAL.words.after, ARRIVAL.words.duration));
  const opacityOf = (values) => (i) => (values[i] ? { opacity: values[i] } : undefined);

  // the line is uncovered from the top: a clip box slides down, the line inside it slides the other
  // way and so stays put, which keeps the whole thing on the native driver
  const { inputRange, outputRange } = plan.line;
  const total = outputRange[outputRange.length - 1];
  const slide = (map) => clock.interpolate({ inputRange, outputRange: outputRange.map(map), extrapolate: "clamp" });
  const frames = foxFrames(plan.fox);

  return {
    header,
    rise: (i) => rise[i],
    label: opacityOf(label),
    words: opacityOf(words),
    fox: {
      opacity: fade(clock, plan.fox, ARRIVAL.fox),
      transform: [{ translateX: clock.interpolate({ inputRange: frames.inputRange, outputRange: frames.x, extrapolate: "clamp" }) }],
    },
    lineClip: { overflow: "hidden", transform: [{ translateY: slide((y) => y - total) }] },
    lineHold: { transform: [{ translateY: slide((y) => total - y) }] },
  };
}

export function useArrival(key) {
  const reduce = useReducedMotion();
  // always asked, so a first open with reduce motion on still counts as the first
  const [clock] = useState(() => (firstOpen(key) && !reduce ? new Animated.Value(0) : null));
  const [plan, setPlan] = useState(null);
  const start = useCallback((input) => setPlan((now) => now ?? { ...arrivalPlan(input), startedAt: Date.now() }), []);
  const looks = useMemo(() => (clock ? buildLooks(clock, plan) : null), [clock, plan]);

  useEffect(() => {
    if (!clock || !plan) return undefined;
    if (reduce) {
      clock.setValue(plan.end);
      return undefined;
    }
    const run = Animated.timing(clock, { toValue: plan.end, duration: plan.end, easing: Easing.linear, useNativeDriver: true });
    run.start();
    return () => run.stop();
  }, [clock, plan, reduce]);

  return useMemo(() => (clock ? { start, plan, looks } : null), [clock, start, plan, looks]);
}
