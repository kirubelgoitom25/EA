import React, { useEffect, useMemo, useRef, useState } from "react";
import { Animated, Easing, PanResponder, Pressable, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { haptic } from "../../services/feedback";
import { fonts, space, tokens, ui } from "../../theme";
import AppText from "../ui/AppText";
import { popTiming, shakeTiming, useReducedMotion } from "../ui/motion";
import Rise from "./Rise";
import { blankText } from "./sessionModel";

const CARD_EDGE = 6;
const CHIP_EDGE = 5;
const GAP_EDGE = 4;
const TAP = 6; // dp a finger may move and still count as a tap

// "Drag into the blank": a sentence with one gap and the options as word chips. Drag a chip onto the
// sentence (or tap it) to put it in the gap; tap the filled gap to take it back; a chip dropped
// anywhere else springs home. Checking is the session's job (same button and feedback as tiles).
//
// pick: the option in the gap (undefined when empty). answered: checked, so nothing moves any more and
// the gap shows right (green, pops) or wrong (red, shakes). onDragging(bool) lets the screen stop
// scrolling while a word is held.
export default function DragBlank({ question, pick, answered, onSelect, onDragging }) {
  const text = blankText(question) ?? "";
  const [before, ...rest] = text.split(/_{3,}/);
  const after = rest.join("____");
  const filled = pick !== undefined && pick !== null;
  const verdict = answered ? (pick === question.correctIndex ? "correct" : "wrong") : null;

  const card = useRef(null);
  const target = useRef(null); // the sentence card on screen: {x, y, width, height}
  const [hover, setHover] = useState(false);
  const [lifted, setLifted] = useState(null); // the chip being dragged paints above the others

  const measure = () =>
    card.current?.measureInWindow((x, y, width, height) => {
      target.current = { x, y, width, height };
    });

  // a drop counts anywhere over the sentence card (a little extra around it), not just the gap itself
  const over = (px, py) => {
    const t = target.current;
    if (!t) return false;
    const pad = 16;
    return px > t.x - pad && px < t.x + t.width + pad && py > t.y - pad && py < t.y + t.height + pad;
  };

  return (
    <View>
      <Rise order={1}>
        <View ref={card} onLayout={measure} collapsable={false} style={styles.cardBox}>
          <View style={[styles.cardLip]} />
          <View style={styles.card}>
            <AppText style={styles.sentence}>
              {before}
              <Gap
                word={filled ? String(question.options[pick]) : null}
                hover={hover}
                verdict={verdict}
                onReturn={answered ? undefined : () => onSelect(undefined)}
              />
              {after}
            </AppText>
          </View>
        </View>
      </Rise>

      {!filled && !answered ? <Hint /> : <View style={styles.hintSpace} />}

      <View style={styles.grid}>
        {question.options.map((option, index) => (
          <Rise key={index} order={2 + index} style={[styles.cell, lifted === index && styles.cellLifted]}>
            <Chip
              label={String(option)}
              placed={filled && pick === index}
              correct={answered && verdict === "wrong" && index === question.correctIndex}
              locked={answered}
              over={over}
              onMeasureTarget={measure}
              onHover={setHover}
              onDragging={(on) => {
                setLifted(on ? index : null);
                onDragging?.(on);
              }}
              onPlace={() => onSelect(index)}
            />
          </Rise>
        ))}
      </View>
    </View>
  );
}

// The gap in the sentence. Empty: a dashed inset slot; while a chip hovers over the sentence it grows a
// little and turns green. Filled: the word on a white face with a green border and edge, popping in.
function Gap({ word, hover, verdict, onReturn }) {
  const reduce = useReducedMotion();
  const grow = useRef(new Animated.Value(0)).current;
  const pop = useRef(new Animated.Value(1)).current;
  const shake = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (reduce) return grow.setValue(0);
    Animated.timing(grow, { toValue: hover && !word ? 1 : 0, duration: 140, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
  }, [hover, word, reduce, grow]);

  useEffect(() => {
    if (reduce || !word) return undefined;
    let run;
    if (verdict === "wrong") run = shakeTiming(shake);
    else {
      pop.setValue(0);
      run = popTiming(pop);
    }
    run.start();
    return () => run.stop();
  }, [word, verdict, reduce, pop, shake]);

  const scale = Animated.multiply(
    grow.interpolate({ inputRange: [0, 1], outputRange: [1, 1.08] }),
    pop.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1] }),
  );

  if (!word) {
    return (
      <Animated.View
        accessible
        accessibilityLabel="Empty gap"
        style={[styles.gapEmpty, hover && styles.gapHover, { transform: [{ translateY: 10 }, { scale }] }]}
      />
    );
  }

  const look =
    verdict === "correct"
      ? { face: ui.correct.face, edge: ui.correct.edge, ink: ui.correct.ink, border: ui.correct.edge }
      : verdict === "wrong"
        ? { face: ui.wrong.face, edge: ui.wrong.edge, ink: ui.wrong.ink, border: ui.wrong.edge }
        : { face: ui.surface, edge: ui.primary, ink: tokens.text, border: ui.primary };

  return (
    <Animated.View style={{ transform: [{ translateY: 10 }, { translateX: shake }, { scale }] }}>
      <Pressable
        onPress={onReturn}
        disabled={!onReturn}
        accessibilityRole="button"
        accessibilityLabel={
          verdict === "correct" ? `${word}, correct` : verdict === "wrong" ? `${word}, not right` : `${word} in the gap. Tap to take it back`
        }
        style={styles.gapBox}
      >
        <View style={[styles.gapLip, { backgroundColor: look.edge }]} />
        <View style={[styles.gapFilled, { backgroundColor: look.face, borderColor: look.border }]}>
          <AppText style={[styles.gapWord, { color: look.ink }]}>{word}</AppText>
        </View>
      </Pressable>
    </Animated.View>
  );
}

// "Drag a word into the gap, or tap it", with a small arrow nudging up and down.
function Hint() {
  const reduce = useReducedMotion();
  const bob = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reduce) return undefined;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(bob, { toValue: 1, duration: 800, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(bob, { toValue: 0, duration: 800, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [reduce, bob]);
  return (
    <View style={styles.hint}>
      <Animated.View style={{ transform: [{ translateY: bob.interpolate({ inputRange: [0, 1], outputRange: [0, -5] }) }] }}>
        <Ionicons name="arrow-up" size={16} color={ui.textMuted} />
      </Animated.View>
      <AppText variant="label" style={styles.hintText}>
        Drag a word into the gap, or tap it
      </AppText>
    </View>
  );
}

// One word chip. It follows the finger while dragged; released over the sentence it goes into the gap,
// anywhere else it springs home. A tap places it too. Placed: its spot shows an empty inset slot.
function Chip({ label, placed, correct, locked, over, onMeasureTarget, onHover, onDragging, onPlace }) {
  const reduce = useReducedMotion();
  const drag = useRef(new Animated.ValueXY()).current;
  const press = useRef(new Animated.Value(0)).current;
  const live = useRef({});
  live.current = { locked, placed, over, onHover, onDragging, onPlace, onMeasureTarget, reduce };

  const responder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => !live.current.locked && !live.current.placed,
        onMoveShouldSetPanResponder: () => !live.current.locked && !live.current.placed,
        onPanResponderTerminationRequest: () => false,
        onShouldBlockNativeResponder: () => true,
        onPanResponderGrant: () => {
          live.current.onMeasureTarget();
          press.setValue(CHIP_EDGE - 1);
          live.current.onDragging(true);
        },
        onPanResponderMove: (event, g) => {
          drag.setValue({ x: g.dx, y: g.dy });
          live.current.onHover(Math.hypot(g.dx, g.dy) > TAP && live.current.over(g.moveX, g.moveY));
        },
        onPanResponderRelease: (event, g) => {
          const tap = Math.hypot(g.dx, g.dy) <= TAP;
          const dropped = tap || live.current.over(g.moveX, g.moveY);
          finish(dropped);
        },
        onPanResponderTerminate: () => finish(false),
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  function finish(dropped) {
    const { onHover: hover, onDragging: dragging, onPlace: place, reduce: still } = live.current;
    hover(false);
    dragging(false);
    press.setValue(0);
    if (dropped) {
      haptic.light();
      drag.setValue({ x: 0, y: 0 });
      place();
    } else if (still) {
      drag.setValue({ x: 0, y: 0 });
    } else {
      Animated.spring(drag, { toValue: { x: 0, y: 0 }, friction: 6, tension: 120, useNativeDriver: false }).start();
    }
  }

  if (placed) {
    return <View style={styles.chipEmpty} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" />;
  }

  const look = correct
    ? { face: ui.correct.face, edge: ui.correct.edge, ink: ui.correct.ink }
    : { face: ui.surface, edge: ui.surfaceEdge, ink: locked ? tokens.textSecondary : tokens.text };

  return (
    <Animated.View
      {...responder.panHandlers}
      accessible
      accessibilityRole="button"
      accessibilityLabel={correct ? `${label}, the right answer` : `${label}. Put in the gap`}
      accessibilityState={{ disabled: locked }}
      accessibilityActions={[{ name: "activate" }]}
      onAccessibilityAction={(event) => event.nativeEvent.actionName === "activate" && !locked && onPlace()}
      style={[styles.chipBox, { transform: drag.getTranslateTransform() }]}
    >
      <View style={[styles.chipLip, { backgroundColor: look.edge }]} />
      <Animated.View style={[styles.chip, { backgroundColor: look.face, borderColor: look.edge, transform: [{ translateY: press }] }]}>
        <AppText style={[styles.chipText, { color: look.ink }]}>{label}</AppText>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  cardBox: {
    marginTop: space.lg,
    paddingBottom: CARD_EDGE,
  },

  cardLip: {
    ...StyleSheet.absoluteFill,
    top: CARD_EDGE,
    borderRadius: 22,
    backgroundColor: ui.surfaceEdge,
  },

  card: {
    backgroundColor: ui.surface,
    borderRadius: 22,
    borderWidth: 2,
    borderColor: ui.surfaceEdge,
    paddingHorizontal: 18,
    paddingVertical: 22,
  },

  sentence: {
    fontFamily: fonts.display,
    fontSize: 23,
    lineHeight: 48,
    letterSpacing: -0.3,
    color: tokens.text,
  },

  // an inline view in text gets no width from minWidth on Android, so the empty gap is sized outright
  gapEmpty: {
    width: 92,
    height: 46,
    marginHorizontal: 4,
    borderRadius: 14,
    backgroundColor: ui.slot,
    borderWidth: 2,
    borderStyle: "dashed",
    borderColor: ui.slotDashed,
  },

  gapHover: {
    backgroundColor: ui.dropHover,
    borderStyle: "solid",
    borderColor: ui.primary,
  },

  gapBox: {
    marginHorizontal: 4,
    paddingBottom: GAP_EDGE,
  },

  gapLip: {
    ...StyleSheet.absoluteFill,
    top: GAP_EDGE,
    borderRadius: 14,
  },

  gapFilled: {
    minWidth: 92,
    height: 42,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },

  gapWord: {
    fontFamily: fonts.display,
    fontSize: 20,
    lineHeight: 24,
  },

  hint: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: space.xs + 2,
    height: 44,
    marginTop: space.sm,
  },

  hintSpace: {
    height: 44,
    marginTop: space.sm,
  },

  hintText: {
    color: ui.textMuted,
  },

  grid: {
    marginTop: space.lg,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 14,
  },

  cell: {
    flexBasis: "45%",
    flexGrow: 1,
  },

  chipBox: {
    minWidth: 92,
    paddingBottom: CHIP_EDGE,
  },

  cellLifted: {
    zIndex: 10,
    elevation: 10,
  },

  chipLip: {
    ...StyleSheet.absoluteFill,
    top: CHIP_EDGE,
    borderRadius: 16,
  },

  chip: {
    height: 56,
    borderRadius: 16,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: space.md,
  },

  chipText: {
    fontFamily: fonts.display,
    fontSize: 18,
    lineHeight: 24,
  },

  chipEmpty: {
    height: 56 + CHIP_EDGE,
    borderRadius: 16,
    backgroundColor: ui.slot,
    borderTopWidth: 3,
    borderTopColor: ui.slotInset,
  },
});
