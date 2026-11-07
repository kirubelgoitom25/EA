import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Animated, Easing, Pressable, StyleSheet, View, useWindowDimensions } from "react-native";
import Svg, { Path } from "react-native-svg";

import { layout, space, stone, tokens } from "../../theme";
import AppText from "./AppText";
import DriftingLine from "./DriftingLine";
import { Entrance } from "./anim";
import Fox from "./Fox";
import { FoxFigure, FoxHeadLean } from "./CourseFox";
import FoxPeek, { CSS_EASE, PEEK } from "./FoxPeek";
import { TITLE_FOX, placeEdgeFox, placeTitleFox, scaleOf } from "./foxPlacement";
import { useReducedMotion } from "./motion";
import { layoutPath, pathD, pathLength, pathPoints, pointAt, travelled, wordsSide } from "./pathModel";
import { ARRIVAL, burstDelay, newlyDone } from "./pathMotionModel";
import Rock, { Dome, ROCKS, ringTop, rockBox } from "./Rock";
import Sparkle from "./Sparkle";

const AnimatedPath = Animated.createAnimatedComponent(Path);
const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

// The path: stepping stones to the den. A rock for every step (a chapter, or a video, a reading, a
// set of questions) on a gently meandering line, joined by a dotted line that curves between them:
// moss green where you have been, stone grey where you are going. Rocks carry an icon (or number). Moss
// is a step you have done, a lit ring is where you are (with a "Start" bubble and its title beside
// it), and the rest are bare stone with just a few words by them ("Chapter 3", "Video"). Tap any rock
// for its title in a small callout. A small dome
// sits between two parts of a course, and the den is a big one at the end. The fox walks the path
// with you: it stands beside the rock you are at and, when you make progress, walks to the next.
//
// - items: [{ id?, status: "done" | "next" | "todo", type?, number?, eyebrow?, kicker?, title, caption?, action?, accessibilityLabel }]
//     id: names the step across paths; a step with one bursts into a sparkle when it is completed.
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
// - words: the few words by the steps (default); off, the steps are icons only (Home)
// - foxPlace: "above" the current step (default): just her head, peeking over the step's ring from
//   behind it; or "beside" it, the whole standing fox
// - zigzag (default): steps sit by their number, odd ones left and even ones right, on a dotted line
//   of soft S curves, and the current step's bubble sits under its words; off, the path meanders in
//   long waves with the bubble over the step
// - mascot: the course path's fox and line (mascotVariant in config.js), in place of the peeking head:
//     "title": the whole fox stands on the current step's title; the dots drift along the line
//     "edge": her head leans in from the screen's edge beside Continue; the piece of line into the
//       current step glows softly
//     "ledge": the fox stands on the tab bar (the screen draws her); darker dots run along the done
//       line to the current step every 7 s
//   The rows keep the room they had for the head, so nothing on the path moves.
// - arrival: what useArrival gave the screen, to have the path appear step by step (arrival.js)
// The geometry lives in pathModel.js; where the fox may stand, in foxPlacement.js.

const ICONS = { video: "play", reading: "document-text", questions: "help" };
const NAMES = { video: "Video", reading: "Reading", questions: "Questions" };

const ROCK = { done: 84, next: 84, todo: 84 };
const DOT = 5; // how big the dots of the path are
const DOTTED = "0.1 12";
const DASHED = "2 12"; // the zigzag's line: 2 dp dashes, 12 dp apart, with round ends
const FOX = 68;
const FOX_BOX = 92;
const DEN_TOP = 38; // from the den's point up to the top of its dome

// Re-exported for screens that scroll to a step: offsets[i] is the top of step i, centers[i] its rock.
export function routeMetrics(items, cta = true, foxAbove = true, zigzag = true) {
  return layoutPath(items, cta, foxAbove, zigzag);
}

// Where the fox stood on each path last time it was drawn (kept while the app runs).
const lastStop = {};

// scrollY / viewHeight (optional): where the screen is, in the route's own coordinates, so only the
// part of the drifting line near the screen moves (see DriftingLine).
export default function Route({ items, den, onPress, cta = true, foxKey, fox = true, words = true, foxPlace = "above", zigzag = true, mascot = null, arrival = null, scrollY = null, viewHeight = null, style }) {
  const reduce = useReducedMotion();
  const { width: screenWidth } = useWindowDimensions();
  const [measured, setMeasured] = useState(null);
  const [callout, setCallout] = useState(null); // { kind: "step" | "dome" | "den", index }
  const width = measured ?? screenWidth - layout.gutter * 2;
  const above = fox && foxPlace === "above";
  const k = scaleOf(screenWidth);
  const off = (screenWidth - width) / 2; // the path sits centred on the screen: its left edge is at -off
  const seen = mascot === "title" || mascot === "edge"; // a fox on the path that must find a clear spot
  const [rects, setRects] = useState({}); // where the words on the path are, measured (for her)
  const report = useMemo(() => (seen ? (key, rect) => setRects((now) => (sameRect(now[key], rect) ? now : { ...now, [key]: rect })) : null), [seen]);

  const n = items.length;
  const { layout: rows, points } = pathPoints(items, !!den, width, cta, above, zigzag ? { frame: screenWidth } : null);
  const curve = zigzag ? "s" : "spline";
  const dash = zigzag ? DASHED : DOTTED;
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
      note = { at: pointAt(points, callout.index - 0.5, curve), title: items[callout.index].eyebrow, half: 28 };
    } else if (callout.kind === "den" && den) {
      note = { at: points[n], title: den.title, sub: den.caption, half: 44 };
    }
  }
  const toggle = (next) => setCallout((now) => (now && now.kind === next.kind && now.index === next.index ? null : next));

  // Where the course fox goes ("title" / "edge"): clear of every tile, dome, label and word.
  const spot = useMemo(() => {
    if (!seen || nextAt < 0) return null;
    const lines = rects[`title-${nextAt}`];
    if (!lines || !lines.length) return null;
    if (items[nextAt].kicker && !rects[`kicker-${nextAt}`]) return null;
    if (cta && zigzag && !rects[`button-${nextAt}`]) return null;
    const words = { lines, kicker: items[nextAt].kicker ? rects[`kicker-${nextAt}`] : null, button: rects[`button-${nextAt}`] };
    const obstacles = [];
    items.forEach((item, i) => {
      const at = points[i];
      const c = rows.centers[i];
      // the tile with its lip, and the current one's ring
      obstacles.push(item.status === "next" ? { x: at.x - 54, y: c - 57, w: 108, h: 114 } : { x: at.x - 42, y: c - 42, w: 84, h: 90 });
      if (rects[`tag-${i}`]) obstacles.push(rects[`tag-${i}`]);
      if (item.eyebrow && i > 0) {
        const dome = pointAt(points, i - 0.5, curve);
        obstacles.push({ x: dome.x - 28, y: dome.y - 23, w: 56, h: 46 });
        if (rects[`part-${i}`]) obstacles.push(rects[`part-${i}`]);
      }
    });
    if (den) obstacles.push({ x: points[n].x - 46, y: points[n].y - 38, w: 92, h: 80 });
    if (words.button) obstacles.push(words.button);
    if (mascot === "title") {
      return placeTitleFox({ title: { lines: words.lines }, kicker: words.kicker, obstacles, bounds: { left: -off, right: width + off }, k });
    }
    return placeEdgeFox({
      tile: points[nextAt],
      edge: width + off,
      width,
      obstacles: [...obstacles, ...words.lines, ...(words.kicker ? [words.kicker] : [])],
      mirrored: points[nextAt].x > width / 2,
      k,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seen, mascot, items, nextAt, rects, width, off, k, rows.total]);

  // The line's motion for each mascot (none with reduce motion).
  const lineMotion = reduce ? null : mascot;
  const pulse = lineMotion === "edge" && nextAt >= 1 && last === nextAt; // the piece into the current step glows
  const spark = lineMotion === "ledge" && last >= 1; // dots run along the done line
  const sparkLength = spark ? Math.round(pathLength(points, 0, last, curve)) : 0;
  const { glow, run } = useLineMotion(lineMotion, sparkLength);
  const dashed = { strokeWidth: DOT, strokeLinecap: "round", strokeDasharray: dash, fill: "none" };
  const looks = arrival?.looks;

  // A step just completed bursts, as its check appears: at once, or once it has arrived on the page.
  // A layout effect, so the first frame with the check already has its particles.
  const [bursts, setBursts] = useState([]);
  const arrivalReady = !arrival || !!arrival.plan;
  const statuses = items.map((item) => `${item.id}:${item.status}`).join();
  useLayoutEffect(() => {
    if (!arrivalReady) return;
    const fresh = newlyDone(items).map((index) => ({ id: items[index].id, index, delay: burstDelay(arrival?.plan, index, Date.now()) }));
    if (fresh.length && !reduce) setBursts((now) => [...now, ...fresh]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statuses, arrivalReady]);

  return (
    <View style={[{ height: rows.total }, style]} onLayout={(event) => setMeasured(Math.round(event.nativeEvent.layout.width))}>
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, looks?.lineClip]}>
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, looks?.lineHold]}>
      {/* the dotted path: stone grey all the way, with the moss-green dots over the part you have done */}
      {points.length > 1 && lineMotion === "title" ? (
        // the dots drift forward along the whole line, one gap every 2.8 s: stone grey all the way,
        // moss green over the part you have done. Dash views moved on the UI thread (DriftingLine).
        <DriftingLine
          points={points}
          curve={curve}
          last={last}
          height={rows.total}
          dash={dash}
          thickness={DOT}
          lineColor={stone.line}
          doneColor={stone.moss}
          duration={FLOW}
          scrollY={scrollY}
          viewHeight={viewHeight}
        />
      ) : null}
      {points.length > 1 && lineMotion !== "title" ? (
        <Svg width={width} height={rows.total} style={StyleSheet.absoluteFill} pointerEvents="none">
          {(
            <>
              {/* with the glow, the grey starts at the current step (so none shows through the glowing
                  piece), its dots in step with the line from the start */}
              {pulse ? (
                last < points.length - 1 ? (
                  <Path d={pathD(points, last, points.length - 1, curve)} stroke={stone.line} strokeDashoffset={dashPhase(points, last, curve, dash)} {...dashed} />
                ) : null
              ) : (
                <Path d={pathD(points, 0, points.length - 1, curve)} stroke={stone.line} {...dashed} />
              )}
              {last > 0 && !(pulse && last === 1) ? <Path d={pathD(points, 0, pulse ? last - 1 : last, curve)} stroke={stone.moss} {...dashed} /> : null}
            </>
          )}
          {spark ? (
            // three darker dots, 14 dp apart, from the start of the line to the current step in 4.9 s
            <AnimatedPath
              d={pathD(points, 0, last, curve)}
              stroke={ROCKS.done.ink}
              strokeWidth={6}
              strokeLinecap="round"
              strokeDasharray={`1 13 1 13 1 ${sparkLength + 60}`}
              strokeDashoffset={run.interpolate({ inputRange: [0, SPARK_RUN], outputRange: [30, -sparkLength], extrapolate: "clamp" })}
              strokeOpacity={run.interpolate({ inputRange: [0, SPARK_RUN, SPARK_RUN + 1, SPARK_LOOP], outputRange: [1, 1, 0, 0] })}
              fill="none"
            />
          ) : null}
        </Svg>
      ) : null}
      {pulse ? (
        // the piece of line into the current step, fading 50% .. 100% and back every 3.6 s
        <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { opacity: glow }]}>
          <Svg width={width} height={rows.total}>
            <Path d={pathD(points, last - 1, last, curve)} stroke={stone.moss} strokeDashoffset={dashPhase(points, last - 1, curve, dash)} {...dashed} />
          </Svg>
        </Animated.View>
      ) : null}
      </Animated.View>
      </Animated.View>

      {/* a tap anywhere else puts the callout away */}
      {callout ? <Pressable style={StyleSheet.absoluteFill} onPress={() => setCallout(null)} accessible={false} importantForAccessibility="no" /> : null}

      {/* a small dome between two parts of the course */}
      {items.map((item, i) => {
        if (!item.eyebrow || i === 0) return null;
        const at = pointAt(points, i - 0.5, curve);
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
            <Animated.View style={looks?.rise(i)}>
              <Dome size={56} lit={items[i - 1].status === "done"} />
            </Animated.View>
          </Pressable>
          <AnimatedPressable
            onPress={() => toggle({ kind: "dome", index: i })}
            accessible={false}
            importantForAccessibility="no"
            style={[styles.partName, { top: at.y - 12 }, toTheRight ? { left: at.x + 38, right: 0 } : { left: 0, right: width - at.x + 38, alignItems: "flex-end" }, looks?.label(i)]}
          >
            <MeasuredText
              variant="label"
              tone="secondary"
              numberOfLines={1}
              onRect={report && (({ rect }) => report(`part-${i}`, rect))}
              originX={toTheRight ? at.x + 38 : 0}
              originY={at.y - 12}
            >
              {item.eyebrow}
            </MeasuredText>
          </AnimatedPressable>
          </React.Fragment>
        );
      })}

      {/* her head goes under the steps, so the ring and the key sit in front of her */}
      {above && !mascot && foxAt >= 0 ? (
        <PeekMarker foxKey={foxKey} index={foxAt} count={n} points={points} curve={curve} width={width} reduce={reduce} />
      ) : null}

      {/* the course fox, under the steps and their words; the screen's edges clip her */}
      {seen ? (
        <View pointerEvents="none" style={[styles.clip, { left: -off, width: screenWidth, height: rows.total }]}>
          <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, looks?.fox]}>
            <GlideTo spot={spot} offset={off} reduce={reduce}>
              {mascot === "title" ? (
                <FoxFigure spec={TITLE_FOX} k={k} motion="breathe" reduce={reduce} />
              ) : spot ? (
                <FoxHeadLean k={k} mirrored={spot.mirrored} reduce={reduce} />
              ) : null}
            </GlideTo>
          </Animated.View>
        </View>
      ) : null}

      {items.map((item, i) => (
        <Step
          key={i}
          item={item}
          index={i}
          width={width}
          x={points[i].x}
          center={rows.centers[i]}
          cta={cta}
          words={words}
          zigzag={zigzag}
          onPress={onPress}
          onNote={() => toggle({ kind: "step", index: i })}
          report={report}
          looks={looks}
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
          <Animated.View style={looks?.rise(n)}>
            <Dome size={92} lit={!!den.reached} />
          </Animated.View>
        </Pressable>
      ) : null}

      {fox && !above && !mascot && foxAt >= 0 ? <FoxMarker foxKey={foxKey} index={foxAt} count={n} points={points} curve={curve} width={width} reduce={reduce} /> : null}

      {reduce
        ? null
        : bursts.map(({ id, index, delay }) =>
            points[index] ? (
              <Sparkle
                key={id}
                x={points[index].x}
                y={rows.centers[index]}
                delay={delay}
                onDone={() => setBursts((now) => now.filter((burst) => burst.id !== id))}
              />
            ) : null,
          )}

      {note ? <Callout note={note} width={width} total={rows.total} /> : null}
    </View>
  );
}

// One step: its rock, and, if it is the one you are at, its bubble and its words.
// report(key, rect): when the course fox needs to know, where this step's words are (in the path's
// coordinates): its tag, or, for the current step, its kicker, its title's lines and its button.
function Step({ item, index, width, x, center, cta, words, zigzag, onPress, onNote, report, looks }) {
  const next = item.status === "next";
  const done = item.status === "done";
  const size = ROCK[item.status] ?? ROCK.todo;
  const box = rockBox(size);
  const side = x < width / 2 ? "right" : "left"; // the words go on the side with more room
  const icon = ICONS[item.type] ?? (done ? "checkmark" : next ? "play" : "star");
  const press = () => onPress?.(index);
  const reach = size * 0.55 + 28;
  const tag = item.tag ?? NAMES[item.type];
  // Where the current step's words box starts, and (once laid out) the block of kicker and title in it.
  const wordsLeft = side === "right" ? x + reach : 0;
  const wordsTop = zigzag ? center - 80 : center - 50;
  const [block, setBlock] = useState(null);
  const blockX = wordsLeft + (block?.x ?? 0);
  const blockY = wordsTop + (block?.y ?? 0);

  return (
    <>
      <Pressable
        onPress={next ? press : onNote}
        hitSlop={space.sm}
        accessibilityRole="button"
        accessibilityLabel={item.accessibilityLabel ?? item.title}
        style={[styles.pinned, { left: x - box.cx, top: center - box.cy, width: box.width, height: box.height }]}
      >
        {({ pressed }) => (
          <Animated.View style={looks?.rise(index)}>
            <Rock status={item.status} size={size} icon={icon} ring={next} pressed={pressed} wait={looks ? ARRIVAL.routineWait : undefined} />
          </Animated.View>
        )}
      </Pressable>

      {words && !next && tag ? (
        <AnimatedPressable
          onPress={onNote}
          accessible={false}
          importantForAccessibility="no"
          style={[styles.tag, { top: center - 11 }, side === "right" ? { left: x + reach - 4, right: 0 } : { left: 0, right: width - x + reach - 4, alignItems: "flex-end" }, looks?.label(index)]}
        >
          <MeasuredText
            variant="label"
            tone={done ? "tertiary" : "secondary"}
            numberOfLines={1}
            onRect={report && (({ rect }) => report(`tag-${index}`, rect))}
            originX={side === "right" ? x + reach - 4 : 0}
            originY={center - 11}
          >
            {tag}
          </MeasuredText>
        </AnimatedPressable>
      ) : null}

      {next && cta && !zigzag ? <Bubble label={item.action ?? "Continue"} x={x} top={center - size * 0.5 - 62} onPress={press} /> : null}

      {next && (words || (cta && zigzag)) ? (
        <Animated.View pointerEvents="box-none" style={[StyleSheet.absoluteFill, looks?.words(index)]}>
        <Entrance
          delay={Math.min(index, 6) * 70}
          distance={12}
          style={[
            styles.words,
            zigzag ? { top: center - 80, height: 160, justifyContent: "center" } : { top: center - 50, height: 100 },
            side === "right" ? { left: x + reach, right: 0, alignItems: "flex-start" } : { left: 0, right: width - x + reach, alignItems: "flex-end" },
          ]}
        >
          <Pressable
            onPress={press}
            accessible={false}
            importantForAccessibility="no"
            style={{ alignItems: side === "right" ? "flex-start" : "flex-end" }}
            onLayout={report && next ? (event) => setBlock(event.nativeEvent.layout) : undefined}
          >
            {words && item.kicker ? (
              <MeasuredText
                variant="overline"
                tone="accent"
                numberOfLines={1}
                style={{ textAlign: side === "right" ? "left" : "right" }}
                onRect={report && next ? ({ rect }) => report(`kicker-${index}`, rect) : null}
                ready={!!block}
                originX={blockX}
                originY={blockY}
              >
                {item.kicker.toUpperCase()}
              </MeasuredText>
            ) : null}
            {words ? (
              <MeasuredText
                variant="title"
                numberOfLines={3}
                style={[styles.nextTitle, { textAlign: side === "right" ? "left" : "right" }]}
                onRect={report && next ? ({ lines }) => report(`title-${index}`, lines) : null}
                ready={!!block}
                originX={blockX}
                originY={blockY}
              >
                {item.title}
              </MeasuredText>
            ) : null}
          </Pressable>
          {cta && zigzag ? (
            <SideBubble
              label={item.action ?? "Continue"}
              side={side}
              onPress={press}
              onLayout={
                report && next
                  ? (event) => {
                      const { x: bx, y: by, width: bw, height: bh } = event.nativeEvent.layout;
                      report(`button-${index}`, { x: wordsLeft + bx, y: wordsTop + by, w: bw, h: bh });
                    }
                  : undefined
              }
            />
          ) : null}
        </Entrance>
        </Animated.View>
      ) : null}
    </>
  );
}

// The "Start" bubble over the current rock. It holds still: the current rock's own routine is the
// one thing that moves on a path.
function Bubble({ label, x, top, onPress }) {
  return (
    <View style={[styles.bubbleBox, { left: x - 70, top }]} pointerEvents="box-none">
      <Pressable onPress={onPress} accessible={false} importantForAccessibility="no" style={styles.bubble}>
        <AppText variant="label" style={styles.bubbleText} numberOfLines={1}>
          {label.toUpperCase()}
        </AppText>
      </Pressable>
      <View style={styles.bubbleTip} />
    </View>
  );
}

// The zigzag's "Start" bubble: under the current step's words, its tip pointing back at the step.
function SideBubble({ label, side, onPress, onLayout }) {
  return (
    <Pressable onPress={onPress} onLayout={onLayout} accessible={false} importantForAccessibility="no" style={[styles.bubble, styles.sideBubble]}>
      <View style={[styles.bubbleTip, styles.sideTip, side === "right" ? styles.sideTipLeft : styles.sideTipRight]} />
      <AppText variant="label" style={styles.bubbleText} numberOfLines={1}>
        {label.toUpperCase()}
      </AppText>
    </Pressable>
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

// The fox's way from the step she was at to the one she is at now: leg { from, to }, p runs 0..1
// along it, arrived once she is there. timing(steps) gives { delay, duration } for a walk that long.
function useLeg(foxKey, index, reduce, timing) {
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
      ...timing(Math.abs(index - from)),
      easing: Easing.inOut(Easing.cubic),
      useNativeDriver: true,
    });
    run.start(({ finished }) => finished && setArrived(true));
    return () => run.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index]);

  return { leg, arrived, p };
}

const STEPS = 24; // how finely a walk follows the curve
const ALONG = Array.from({ length: STEPS + 1 }, (_, i) => i / STEPS);

// The fox's head over the step you are at (Home), tucked in behind its ring; over the den's dome
// once the course is done. When you reach a new step she glides along the line to it, no hop, and
// is there before the step's own routine starts.
function PeekMarker({ foxKey, index, count, points, curve, width, reduce }) {
  const { leg, p } = useLeg(foxKey, index, reduce, () => ({ delay: 300, duration: 700 }));
  // from a stop's point to the top-left of her head
  const dy = (k) => (k < count ? ringTop(ROCK.next) : -DEN_TOP) + PEEK.tuck - PEEK.height;
  const along = ALONG.map((t) => pointAt(points, leg.from + (leg.to - leg.from) * t, curve));
  const x = along.map((pt) => pt.x - PEEK.width / 2);
  const y = ALONG.map((t, i) => along[i].y + dy(leg.from) + (dy(leg.to) - dy(leg.from)) * t);
  const still = leg.from === leg.to;
  const side = points[Math.min(index, points.length - 1)].x < width / 2 ? "left" : "right";

  return (
    <Animated.View
      pointerEvents="box-none"
      style={[
        styles.peek,
        still
          ? { transform: [{ translateX: x[STEPS] }, { translateY: y[STEPS] }] }
          : { transform: [{ translateX: p.interpolate({ inputRange: ALONG, outputRange: x }) }, { translateY: p.interpolate({ inputRange: ALONG, outputRange: y }) }] },
      ]}
    >
      <FoxPeek side={side} />
    </Animated.View>
  );
}

// The fox: stands beside the rock you are at, on the side away from its words, and walks along the
// dotted path to a new one, turning as it goes. At the den it waves.
function FoxMarker({ foxKey, index, count, points, curve, width, reduce }) {
  const atDen = index >= count;
  const { leg, arrived, p } = useLeg(foxKey, index, reduce, (steps) => ({ delay: 500, duration: 800 + Math.min(steps, 3) * 350 }));

  // Which side of its rock the fox stands on: away from the step's words (the den has none, so the
  // side with more room).
  const sideOf = (k) => {
    const words = wordsSide(k);
    if (k < count) return words === "right" ? -1 : 1;
    return words === "right" ? 1 : -1;
  };
  const outOf = (k) => (k < count ? ROCK.next * 0.55 + 40 : 92);

  // Sample the path from where the fox was to where it is going, and drift from one side to the other.
  const inputRange = ALONG;
  const along = inputRange.map((t) => pointAt(points, leg.from + (leg.to - leg.from) * t, curve));
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
        fidget={false}
        tappable={arrived}
        caption
        bubble={sideOf(leg.to) === -1 ? "left" : "right"}
        mirror={still ? flip[1] : p.interpolate({ inputRange: [0, 1], outputRange: flip })}
      />
    </Animated.View>
  );
}

// --- the course fox (mascot) ---

// Same place and size (or the same list of them), give or take half a dp.
function sameRect(a, b) {
  if (Array.isArray(a) || Array.isArray(b)) return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((r, i) => sameRect(r, b[i]));
  if (!a || !b) return a === b;
  return Math.abs(a.x - b.x) < 0.5 && Math.abs(a.y - b.y) < 0.5 && Math.abs(a.w - b.w) < 0.5 && Math.abs(a.h - b.h) < 0.5;
}

// AppText that, given onRect, tells where its words are: onRect({ rect, lines }) with each line's
// box and the box round them all, offset by origin (where its parent sits on the path). ready: the
// origin is known. Only measures; it looks exactly like AppText.
function MeasuredText({ onRect, originX = 0, originY = 0, ready = true, ...props }) {
  const seen = useRef({});
  const latest = useRef(onRect);
  latest.current = onRect;
  const flush = () => {
    const { frame, lines } = seen.current;
    if (!ready || !latest.current || !frame || !lines?.length) return;
    const ox = originX + frame.x;
    const oy = originY + frame.y;
    const boxes = lines.filter((line) => line.width > 0).map((line) => ({ x: ox + line.x, y: oy + line.y, w: line.width, h: line.height }));
    if (!boxes.length) return;
    const left = Math.min(...boxes.map((b) => b.x));
    const top = Math.min(...boxes.map((b) => b.y));
    const rect = { x: left, y: top, w: Math.max(...boxes.map((b) => b.x + b.w)) - left, h: Math.max(...boxes.map((b) => b.y + b.h)) - top };
    latest.current({ rect, lines: boxes });
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(flush, [ready, originX, originY]);
  if (!onRect) return <AppText {...props} />;
  return (
    <AppText
      {...props}
      onLayout={(event) => {
        seen.current.frame = event.nativeEvent.layout;
        flush();
      }}
      onTextLayout={(event) => {
        seen.current.lines = event.nativeEvent.lines;
        flush();
      }}
    />
  );
}

// Puts its child at spot (a box's top-left on the path; offset: the clip box's left edge is that far
// left of the path). The first time, once the measurements have settled, she fades in; after that,
// a new spot (a new current step) has her glide there: no hop, and straight there with reduce motion.
function GlideTo({ spot, offset, reduce, children }) {
  const x = useRef(new Animated.Value(0)).current;
  const y = useRef(new Animated.Value(0)).current;
  const shown = useRef(new Animated.Value(0)).current;
  const placed = useRef(false);
  const target = spot ? { x: spot.x + offset, y: spot.y } : null;

  useEffect(() => {
    if (!target) {
      placed.current = false;
      shown.setValue(0);
      return undefined;
    }
    if (!placed.current) {
      // wait for the words to stop moving (their entrance, the path's width), then appear there
      const settle = setTimeout(() => {
        x.setValue(target.x);
        y.setValue(target.y);
        placed.current = true;
        Animated.timing(shown, { toValue: 1, duration: reduce ? 0 : 250, useNativeDriver: true }).start();
      }, 160);
      return () => clearTimeout(settle);
    }
    if (reduce) {
      x.setValue(target.x);
      y.setValue(target.y);
      return undefined;
    }
    const glide = Animated.parallel(
      [x, y].map((v, i) =>
        Animated.timing(v, { toValue: i ? target.y : target.x, delay: 300, duration: 700, easing: Easing.inOut(Easing.cubic), useNativeDriver: true }),
      ),
    );
    glide.start();
    return () => glide.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target?.x, target?.y, reduce]);

  return (
    <Animated.View pointerEvents="none" style={[styles.mascot, { opacity: shown, transform: [{ translateX: x }, { translateY: y }] }]}>
      {children}
    </Animated.View>
  );
}

// A piece of line starting at point `from` keeps the dots of the whole line where they are: shift
// its dashes by how far along the line it starts (modulo one dash and gap).
function dashPhase(points, from, curve, dash) {
  const period = dash.split(" ").reduce((sum, part) => sum + Number(part), 0);
  return pathLength(points, 0, from, curve) % period;
}

const FLOW = 2800; // ms for the dots to drift one dash-and-gap (14 dp) forward
const PULSE = 3600; // ms, the glowing piece of line: 50% .. 100% .. 50%
const SPARK_LOOP = 7000; // ms between runs of the dark dots
const SPARK_RUN = 4900; // ms for them to reach the current step

// The values the line's motion runs on, for mascot "edge" (glow: an opacity) or "ledge" (run: ms into
// the spark's loop). SVG props can't use the native driver, so run is driven from JS; glow is on a
// view, so it is native. Mascot "title" (the drifting dashes) is DriftingLine's own.
function useLineMotion(mascot, sparkLength) {
  const flow = useRef(new Animated.Value(0)).current;
  const glow = useRef(new Animated.Value(1)).current;
  const run = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    flow.setValue(0);
    glow.setValue(1);
    run.setValue(0);
    let loop = null;
    if (mascot === "title") {
      // drawn and moved by DriftingLine
    } else if (mascot === "edge") {
      glow.setValue(0.5);
      loop = Animated.loop(
        Animated.sequence([
          Animated.timing(glow, { toValue: 1, duration: PULSE / 2, easing: CSS_EASE, useNativeDriver: true }),
          Animated.timing(glow, { toValue: 0.5, duration: PULSE / 2, easing: CSS_EASE, useNativeDriver: true }),
        ]),
      );
    } else if (mascot === "ledge" && sparkLength > 0) {
      loop = Animated.loop(Animated.timing(run, { toValue: SPARK_LOOP, duration: SPARK_LOOP, easing: Easing.linear, useNativeDriver: false }));
    }
    loop?.start();
    return () => loop?.stop();
  }, [mascot, sparkLength, flow, glow, run]);

  return { flow, glow, run };
}

const styles = StyleSheet.create({
  pinned: { position: "absolute" },
  clip: { position: "absolute", top: 0, overflow: "hidden" },
  mascot: { position: "absolute", left: 0, top: 0 },
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
    borderRadius: 14,
    backgroundColor: tokens.surface,
    borderWidth: 2,
    borderColor: tokens.divider,
  },
  bubbleText: { color: tokens.accentText, letterSpacing: 0.8 },
  bubbleTip: {
    width: 12,
    height: 12,
    marginTop: -8,
    backgroundColor: tokens.surface,
    borderRightWidth: 2,
    borderBottomWidth: 2,
    borderColor: tokens.divider,
    transform: [{ rotate: "45deg" }],
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
  sideBubble: { marginTop: space.sm },
  sideTip: { position: "absolute", top: 8, marginTop: 0, borderRightWidth: 0, borderBottomWidth: 0 },
  // a square turned 45 degrees: its bottom-left corner points left, its top-right corner right
  sideTipLeft: { left: -7, borderLeftWidth: 2, borderBottomWidth: 2 },
  sideTipRight: { right: -7, borderTopWidth: 2, borderRightWidth: 2 },
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
  peek: { position: "absolute", left: 0, top: 0, width: PEEK.width, height: PEEK.height },
});
