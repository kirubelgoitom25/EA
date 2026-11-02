import React, { useEffect, useRef, useState } from "react";
import { Animated, Easing, Pressable, StyleSheet, View, useWindowDimensions } from "react-native";
import Svg, { Path } from "react-native-svg";

import { layout, space, stone, tokens } from "../../theme";
import AppText from "./AppText";
import { Entrance } from "./anim";
import Fox from "./Fox";
import { useReducedMotion } from "./motion";
import { layoutPath, pathD, pathPoints, pointAt, travelled, wordsSide, xOf } from "./pathModel";
import Rock, { Dome, rockBox } from "./Rock";

// The path: stepping stones to the den. A rock for every step (a chapter, or a video, a reading, a
// set of questions) on a gently meandering line, joined by a dotted line that curves between them:
// moss green where you have been, stone grey where you are going. Rocks carry an icon (or number). Moss
// is a step you have done, a lit ring is where you are (with a "Start" bubble and its title beside
// it), and the rest are bare stone with just a few words by them ("Chapter 3", "Video"). Tap any rock
// for its title in a small callout. A small dome
// sits between two parts of a course, and the den is a big one at the end. The fox walks the path
// with you: it stands beside the rock you are at and, when you make progress, walks to the next.
//
// - items: [{ status: "done" | "next" | "todo", type?, number?, eyebrow?, kicker?, title, caption?, action?, accessibilityLabel }]
//     type: "video" | "reading" | "questions": the rock shows that icon; without it, the step's number
//     (a check once done). tag: the few words by a rock that say what it is, "Chapter 3" (a typed step
//     says "Video", "Reading" or "Questions" instead). eyebrow: this step starts a new part with that name: a dome sits on the
//     path before it, and tapping it names the part. kicker: the first line of the current step's
//     words; action: the words in its bubble
// - den: { reached, title, caption } — the end of the path; tapping the dome shows title and caption
// - onPress(i): a step was opened
// - cta: the current step has its bubble (a screen with its own pinned button can turn it off)
// - foxKey: remembers where the fox stood, so it can walk from there to the next step
// - fox: show the fox (default)
// The geometry lives in pathModel.js.

const ICONS = { video: "play", reading: "document-text", questions: "help" };
const NAMES = { video: "Video", reading: "Reading", questions: "Questions" };

const ROCK = { done: 96, next: 112, todo: 90 };
const DOT = 6; // how big the dots of the path are
const DOTTED = "0.1 12";
const FOX = 68;
const FOX_BOX = 92;

// Re-exported for screens that scroll to a step: offsets[i] is the top of step i, centers[i] its rock.
export function routeMetrics(items, cta = true) {
  return layoutPath(items, cta);
}

// Where the fox stood on each path last time it was drawn (kept while the app runs).
const lastStop = {};

export default function Route({ items, den, onPress, cta = true, foxKey, fox = true, style }) {
  const reduce = useReducedMotion();
  const { width: screenWidth } = useWindowDimensions();
  const [measured, setMeasured] = useState(null);
  const [callout, setCallout] = useState(null); // { kind: "step" | "dome" | "den", index }
  const width = measured ?? screenWidth - layout.gutter * 2;

  const n = items.length;
  const { layout: rows, points } = pathPoints(items, !!den, width, cta);
  const last = travelled(items, den);

  const nextAt = items.findIndex((item) => item.status === "next");
  // The fox stands at the step you are at, or at the den once nothing is left.
  const foxAt = nextAt >= 0 ? nextAt : den?.reached ? n : -1;

  // What the callout says and where it points.
  let note = null;
  if (callout) {
    if (callout.kind === "step" && items[callout.index]) {
      const item = items[callout.index];
      note = {
        at: points[callout.index],
        tag: item.tag ?? NAMES[item.type],
        title: item.title,
        sub: item.status === "done" ? null : item.caption,
        button: item.status === "done" ? "Review" : "Open",
        open: () => {
          setCallout(null);
          onPress?.(callout.index);
        },
        half: ROCK[item.status] * 0.5,
      };
    } else if (callout.kind === "dome" && items[callout.index]) {
      note = { at: pointAt(points, callout.index - 0.5), title: items[callout.index].eyebrow, half: 28 };
    } else if (callout.kind === "den" && den) {
      note = { at: points[n], title: den.title, sub: den.caption, half: 44 };
    }
  }
  const toggle = (next) => setCallout((now) => (now && now.kind === next.kind && now.index === next.index ? null : next));

  return (
    <View style={[{ height: rows.total }, style]} onLayout={(event) => setMeasured(Math.round(event.nativeEvent.layout.width))}>
      {/* the dotted path: stone grey all the way, with the moss-green dots over the part you have done */}
      {points.length > 1 ? (
        <Svg width={width} height={rows.total} style={StyleSheet.absoluteFill} pointerEvents="none">
          <Path d={pathD(points)} stroke={stone.line} strokeWidth={DOT} strokeLinecap="round" strokeDasharray={DOTTED} fill="none" />
          {last > 0 ? <Path d={pathD(points, 0, last)} stroke={stone.moss} strokeWidth={DOT} strokeLinecap="round" strokeDasharray={DOTTED} fill="none" /> : null}
        </Svg>
      ) : null}

      {/* a tap anywhere else puts the callout away */}
      {callout ? <Pressable style={StyleSheet.absoluteFill} onPress={() => setCallout(null)} accessible={false} importantForAccessibility="no" /> : null}

      {/* a small dome between two parts of the course */}
      {items.map((item, i) => {
        if (!item.eyebrow || i === 0) return null;
        const at = pointAt(points, i - 0.5);
        const toTheRight = at.x < width / 2;
        return (
          <React.Fragment key={`dome-${i}`}>
          <Pressable
            onPress={() => toggle({ kind: "dome", index: i })}
            hitSlop={space.md}
            accessibilityRole="button"
            accessibilityLabel={`${item.eyebrow}${items[i - 1].status === "done" ? ", finished" : ""}`}
            style={[styles.pinned, { left: at.x - 28, top: at.y - 23 }]}
          >
            <Dome size={56} lit={items[i - 1].status === "done"} />
          </Pressable>
          <Pressable
            onPress={() => toggle({ kind: "dome", index: i })}
            accessible={false}
            importantForAccessibility="no"
            style={[styles.partName, { top: at.y - 12 }, toTheRight ? { left: at.x + 38, right: 0 } : { left: 0, right: width - at.x + 38, alignItems: "flex-end" }]}
          >
            <AppText variant="label" tone="secondary" numberOfLines={1}>
              {item.eyebrow}
            </AppText>
          </Pressable>
          </React.Fragment>
        );
      })}

      {items.map((item, i) => (
        <Step
          key={i}
          item={item}
          index={i}
          width={width}
          center={rows.centers[i]}
          cta={cta}
          reduce={reduce}
          onPress={onPress}
          onNote={() => toggle({ kind: "step", index: i })}
        />
      ))}

      {den ? (
        <Pressable
          onPress={() => toggle({ kind: "den", index: n })}
          hitSlop={space.md}
          accessibilityRole="button"
          accessibilityLabel={`${den.title}. ${den.caption}`}
          style={[styles.pinned, { left: points[n].x - 46, top: points[n].y - 38 }]}
        >
          <Dome size={92} lit={!!den.reached} />
        </Pressable>
      ) : null}

      {fox && foxAt >= 0 ? <FoxMarker foxKey={foxKey} index={foxAt} count={n} points={points} width={width} reduce={reduce} /> : null}

      {note ? <Callout note={note} width={width} total={rows.total} /> : null}
    </View>
  );
}

// One step: its rock, and, if it is the one you are at, its bubble and its words.
function Step({ item, index, width, center, cta, reduce, onPress, onNote }) {
  const next = item.status === "next";
  const done = item.status === "done";
  const size = ROCK[item.status] ?? ROCK.todo;
  const box = rockBox(size);
  const x = xOf(index, width);
  const side = wordsSide(index);
  const icon = ICONS[item.type] ?? (done ? "checkmark" : undefined);
  const press = () => onPress?.(index);
  const reach = size * 0.55 + 12;
  const tag = item.tag ?? NAMES[item.type];

  return (
    <>
      <Pressable
        onPress={next ? press : onNote}
        hitSlop={space.sm}
        accessibilityRole="button"
        accessibilityLabel={item.accessibilityLabel ?? item.title}
        style={[styles.pinned, { left: x - box.cx, top: center - box.cy, width: box.width, height: box.height }]}
      >
        <Rock status={item.status} size={size} variant={index} icon={icon} ring={next}>
          {!icon ? (
            <AppText variant="title" style={[styles.number, { color: next ? tokens.text : stone.rockInk }]}>
              {item.number}
            </AppText>
          ) : null}
        </Rock>
      </Pressable>

      {!next && tag ? (
        <Pressable
          onPress={onNote}
          accessible={false}
          importantForAccessibility="no"
          style={[styles.tag, { top: center - 11 }, side === "right" ? { left: x + reach - 4, right: 0 } : { left: 0, right: width - x + reach - 4, alignItems: "flex-end" }]}
        >
          <AppText variant="label" tone={done ? "tertiary" : "secondary"} numberOfLines={1}>
            {tag}
          </AppText>
        </Pressable>
      ) : null}

      {next && cta ? <Bubble label={item.action ?? "Continue"} x={x} top={center - size * 0.5 - 40} reduce={reduce} onPress={press} /> : null}

      {next ? (
        <Entrance
          delay={Math.min(index, 6) * 70}
          distance={12}
          style={[styles.words, { top: center - 50, height: 100 }, side === "right" ? { left: x + reach, right: 0, alignItems: "flex-start" } : { left: 0, right: width - x + reach, alignItems: "flex-end" }]}
        >
          <Pressable onPress={press} accessible={false} importantForAccessibility="no" style={{ alignItems: side === "right" ? "flex-start" : "flex-end" }}>
            {item.kicker ? (
              <AppText variant="overline" tone="accent" numberOfLines={1} style={{ textAlign: side === "right" ? "left" : "right" }}>
                {item.kicker.toUpperCase()}
              </AppText>
            ) : null}
            <AppText variant="title" numberOfLines={3} style={[styles.nextTitle, { textAlign: side === "right" ? "left" : "right" }]}>
              {item.title}
            </AppText>
          </Pressable>
        </Entrance>
      ) : null}
    </>
  );
}

// The "Start" bubble over the current rock: it bobs a little, the one thing that moves on a path.
function Bubble({ label, x, top, reduce, onPress }) {
  const bob = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reduce) return undefined;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(bob, { toValue: -4, duration: 700, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(bob, { toValue: 0, duration: 700, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [reduce, bob]);

  return (
    <Animated.View style={[styles.bubbleBox, { left: x - 70, top, transform: [{ translateY: bob }] }]} pointerEvents="box-none">
      <Pressable onPress={onPress} accessible={false} importantForAccessibility="no" style={styles.bubble}>
        <AppText variant="label" style={styles.bubbleText} numberOfLines={1}>
          {label.toUpperCase()}
        </AppText>
      </Pressable>
      <View style={styles.bubbleTip} />
    </Animated.View>
  );
}

// The small card that names a rock (or a dome) when it is tapped, with a button to open a step.
function Callout({ note, width, total }) {
  const w = 220;
  const left = Math.max(4, Math.min(width - w - 4, note.at.x - w / 2));
  const above = note.at.y > 190;
  return (
    <View
      style={[styles.callout, { left, width: w }, above ? { bottom: total - (note.at.y - note.half - 10) } : { top: note.at.y + note.half + 10 }]}
      accessibilityLiveRegion="polite"
    >
      <View style={[styles.calloutTip, { left: note.at.x - left - 6 }, above ? { bottom: -6 } : { top: -6 }]} />
      {note.tag ? (
        <AppText variant="overline" tone="secondary" style={styles.calloutTag}>
          {note.tag.toUpperCase()}
        </AppText>
      ) : null}
      <AppText variant="bodyStrong" numberOfLines={3}>
        {note.title}
      </AppText>
      {note.sub ? (
        <AppText variant="caption" tone="secondary" numberOfLines={2}>
          {note.sub}
        </AppText>
      ) : null}
      {note.open ? (
        <Pressable onPress={note.open} accessibilityRole="button" accessibilityLabel={note.button} style={({ pressed }) => [styles.calloutButton, pressed && styles.pressed]}>
          <AppText variant="label" style={styles.calloutButtonText}>
            {note.button}
          </AppText>
        </Pressable>
      ) : null}
    </View>
  );
}

// The fox: stands beside the rock you are at, on the side away from its words, and walks along the
// dotted path to a new one, turning as it goes. At the den it waves.
function FoxMarker({ foxKey, index, count, points, width, reduce }) {
  const atDen = index >= count;
  const initialFrom = useRef(foxKey && lastStop[foxKey] !== undefined ? lastStop[foxKey] : index);
  const [leg, setLeg] = useState({ from: initialFrom.current, to: index });
  const [arrived, setArrived] = useState(initialFrom.current === index);
  const p = useRef(new Animated.Value(initialFrom.current === index ? 1 : 0)).current;
  const previous = useRef(null);

  useEffect(() => {
    const from = previous.current ?? initialFrom.current;
    previous.current = index;
    if (foxKey) lastStop[foxKey] = index;
    setLeg({ from, to: index });
    p.stopAnimation();
    if (from === index || reduce) {
      p.setValue(1);
      setArrived(true);
      return undefined;
    }
    p.setValue(0);
    setArrived(false);
    const run = Animated.timing(p, {
      toValue: 1,
      duration: 800 + Math.min(Math.abs(index - from), 3) * 350,
      delay: 500,
      easing: Easing.inOut(Easing.cubic),
      useNativeDriver: true,
    });
    run.start(({ finished }) => finished && setArrived(true));
    return () => run.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index]);

  // Which side of its rock the fox stands on: away from the step's words (the den has none, so the
  // side with more room).
  const sideOf = (k) => {
    const words = wordsSide(k);
    if (k < count) return words === "right" ? -1 : 1;
    return words === "right" ? 1 : -1;
  };
  const outOf = (k) => (k < count ? ROCK.next * 0.55 + 30 : 92);

  // Sample the path from where the fox was to where it is going, and drift from one side to the other.
  const STEPS = 24;
  const inputRange = Array.from({ length: STEPS + 1 }, (_, i) => i / STEPS);
  const along = inputRange.map((t) => pointAt(points, leg.from + (leg.to - leg.from) * t));
  const dx0 = sideOf(leg.from) * outOf(leg.from);
  const dx1 = sideOf(leg.to) * outOf(leg.to);
  // ...but never off the screen: where a rock is at the very edge the fox stays on screen
  const x = inputRange.map((t, i) => Math.max(-1, Math.min(width - 6, along[i].x + dx0 + (dx1 - dx0) * t)) - FOX_BOX / 2);
  const y = inputRange.map((t, i) => along[i].y - 2 - FOX_BOX / 2);
  const flip = [sideOf(leg.from) === -1 ? 1 : -1, sideOf(leg.to) === -1 ? 1 : -1];
  const still = leg.from === leg.to;

  return (
    // The box lets touches through, except on the fox herself (she can be petted).
    <Animated.View
      pointerEvents="box-none"
      style={[
        styles.fox,
        still
          ? { transform: [{ translateX: x[0] }, { translateY: y[0] }] }
          : { transform: [{ translateX: p.interpolate({ inputRange, outputRange: x }) }, { translateY: p.interpolate({ inputRange, outputRange: y }) }] },
      ]}
    >
      <Fox
        pose={atDen && arrived ? "waving" : "standing"}
        size={FOX}
        mood={arrived ? undefined : "walking"}
        reactive={arrived}
        tappable={arrived}
        caption
        bubble={sideOf(leg.to) === -1 ? "left" : "right"}
        mirror={still ? flip[1] : p.interpolate({ inputRange: [0, 1], outputRange: flip })}
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  pinned: { position: "absolute" },
  number: { fontSize: 28, lineHeight: 34 },

  words: { position: "absolute" },
  tag: { position: "absolute", height: 22, justifyContent: "center" },
  partName: { position: "absolute", height: 24, justifyContent: "center" },
  nextTitle: { fontSize: 20, lineHeight: 25 },
  pressed: { opacity: 0.75 },

  bubbleBox: { position: "absolute", width: 140, alignItems: "center" },
  bubble: {
    height: 32,
    paddingHorizontal: space.lg,
    justifyContent: "center",
    borderRadius: 12,
    backgroundColor: tokens.accent,
    borderBottomWidth: 3,
    borderBottomColor: tokens.accentLip,
  },
  bubbleText: { color: tokens.onAccent, letterSpacing: 0.8 },
  bubbleTip: {
    width: 12,
    height: 12,
    marginTop: -7,
    backgroundColor: tokens.accentLip,
    borderRadius: 3,
    transform: [{ rotate: "45deg" }],
    zIndex: -1,
  },

  callout: {
    position: "absolute",
    gap: 2,
    padding: space.md,
    borderRadius: 16,
    backgroundColor: tokens.surface,
    shadowColor: "#2B1A38",
    shadowOpacity: 0.14,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  calloutTip: { position: "absolute", width: 12, height: 12, backgroundColor: tokens.surface, transform: [{ rotate: "45deg" }] },
  calloutTag: { fontSize: 10, lineHeight: 14, letterSpacing: 1 },
  calloutButton: {
    alignSelf: "flex-start",
    height: 34,
    marginTop: space.sm,
    paddingHorizontal: space.lg,
    justifyContent: "center",
    borderRadius: 17,
    backgroundColor: tokens.text,
  },
  calloutButtonText: { color: "#FFFFFF" },

  fox: { position: "absolute", left: 0, top: 0, width: FOX_BOX, height: FOX_BOX, alignItems: "center", justifyContent: "center" },
});
