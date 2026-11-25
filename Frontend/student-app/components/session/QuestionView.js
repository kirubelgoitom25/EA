import React, { useEffect, useRef } from "react";
import { Animated, StyleSheet, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { edge, fonts, layout, levelLabel, space, tokens, type, ui } from "../../theme";
import AppText from "../ui/AppText";
import { popTiming, shakeTiming, useReducedMotion } from "../ui/motion";
import PressLip from "../ui/PressLip";
import DragBlank from "./DragBlank";
import Rise from "./Rise";
import { BLANK, formatFor, splitBlank } from "./sessionModel";

const HEADINGS = {
  choice: "CHOOSE THE ANSWER",
  truefalse: "TRUE OR FALSE",
  fill: "FILL IN THE BLANK",
  drag: "FILL THE GAP",
};

// Short options sit in a 2×2 grid of tiles; longer ones stack.
const isShortSet = (options) =>
  options.length === 4 && options.every((o) => String(o).length <= 14);

// One question. A choice is picked first (selected), then checked with the session's button; fill-in
// is typed and checked the same way. Some blank questions are shown as "drag into the gap" instead of
// tiles (formatFor), with the same answer and check.
//
// selected: the picked option before checking. answer: the checked option / typed text.
// answered: true once checked (locks input, reveals the right answer).
// onDragging(bool): a word is being dragged (the session stops its scroll meanwhile).
export default function QuestionView({
  question,
  stageNumber,
  selected,
  answer,
  answered,
  onSelect,
  onType,
  onSubmitText,
  onDragging,
}) {
  const isFill = question.kind === "fill";
  const format = formatFor(question);
  const pick = answered ? answer : selected;

  return (
    <View>
      <Rise order={0}>
        <AppText style={levelLabel}>
          STAGE {stageNumber} · {HEADINGS[format === "drag" ? "drag" : question.kind]}
        </AppText>
      </Rise>

      {format === "drag" ? (
        <DragBlank question={question} pick={pick} answered={answered} onSelect={onSelect} onDragging={onDragging} />
      ) : (
        <>
          {isFill && question.sentence && question.prompt !== question.sentence && BLANK.test(question.sentence) ? (
            <Rise order={1}>
              <AppText tone="secondary" style={styles.instruction}>
                {question.prompt}
              </AppText>
            </Rise>
          ) : null}

          <Rise order={1}>
            <Prompt question={question} pick={pick} answer={answer} answered={answered} />
          </Rise>

          {isFill ? (
            <Rise order={2}>
              <TextInput
                value={answer ?? ""}
                onChangeText={onType}
                editable={!answered}
                placeholder="Type your answer"
                placeholderTextColor={tokens.textTertiary}
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="done"
                onSubmitEditing={() => (answer ?? "").trim() && onSubmitText()}
                style={[styles.input, answered && styles.inputLocked]}
                accessibilityLabel="Your answer"
              />
            </Rise>
          ) : (
            <Options question={question} pick={pick} answered={answered} onSelect={onSelect} />
          )}
        </>
      )}
    </View>
  );
}

// The prompt in the display face. A "___" blank is a soft inset slot; a picked word sits in it as a
// pill, and once checked the right word does (in the correct colours).
function Prompt({ question, pick, answer, answered }) {
  const text = BLANK.test(question.sentence ?? "") ? question.sentence : question.prompt;
  const parts = question.kind === "fill" ? splitBlank(question) : null;
  const split = parts ?? (BLANK.test(text ?? "") ? { before: text.split(BLANK)[0], after: text.split(BLANK).slice(1).join("____") } : null);

  if (!split) {
    return <AppText style={styles.prompt}>{text}</AppText>;
  }

  let word = null;
  let look = "picked";
  if (question.kind === "fill") {
    word = answer || null;
  } else if (answered && question.correctIndex !== null) {
    word = question.options[question.correctIndex];
    look = "correct";
  } else if (pick !== undefined && pick !== null) {
    word = question.options[pick];
  }

  return (
    <AppText style={styles.prompt}>
      {split.before}
      {word ? <GapPill word={String(word)} look={look} /> : <View accessible accessibilityLabel="blank" style={styles.blank}><View style={styles.blankInset} /></View>}
      {split.after}
    </AppText>
  );
}

// The word in the sentence's gap: a pale green pill on a 3 dp edge; it pops when it changes.
function GapPill({ word, look }) {
  const reduce = useReducedMotion();
  const pop = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (reduce) return undefined;
    pop.setValue(0);
    const run = popTiming(pop);
    run.start();
    return () => run.stop();
  }, [word, look, reduce, pop]);
  const colors = look === "correct" ? { bg: ui.correct.face, lip: ui.correct.edge, ink: ui.correct.ink } : { bg: ui.pill.bg, lip: ui.pill.edge, ink: ui.selected.ink };
  return (
    <Animated.View
      accessible
      accessibilityLabel={look === "correct" ? `${word}, the right answer` : `${word}, in the blank`}
      style={[styles.pillBox, { transform: [{ translateY: 7 }, { scale: pop.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1] }) }] }]}
    >
      <View style={[styles.pillLip, { backgroundColor: colors.lip }]} />
      <View style={[styles.pill, { backgroundColor: colors.bg }]}>
        <AppText style={[styles.pillText, { color: colors.ink }]}>{word}</AppText>
      </View>
    </Animated.View>
  );
}

function Options({ question, pick, answered, onSelect }) {
  const state = (index) => {
    if (!answered) return index === pick ? "selected" : "idle";
    if (question.correctIndex === null) return index === pick ? "selected" : "dimmed";
    if (index === question.correctIndex) return "correct";
    if (index === pick) return "wrong";
    return "dimmed";
  };

  const grid = question.kind === "truefalse" || isShortSet(question.options);

  return (
    <View style={grid ? styles.grid : styles.list}>
      {question.options.map((option, index) => (
        <Rise key={index} order={2 + index} style={grid ? styles.cell : null}>
          <Tile
            label={String(option)}
            state={state(index)}
            disabled={answered}
            compact={!grid}
            onPress={() => onSelect(index)}
          />
        </Rise>
      ))}
    </View>
  );
}

// An answer: a white face with a 2 dp border on a 5 dp edge; a tap sinks it. Picked: pale green with a
// green edge. Checked: the right one turns green and pops, a wrong pick turns red and shakes.
const TILE = {
  idle: { bg: ui.surface, edge: ui.surfaceEdge, text: tokens.text },
  selected: { bg: ui.selected.face, edge: ui.selected.edge, text: ui.selected.ink },
  correct: { bg: ui.correct.face, edge: ui.correct.edge, text: ui.correct.ink, badge: "correct" },
  wrong: { bg: ui.wrong.face, edge: ui.wrong.edge, text: ui.wrong.ink, badge: "wrong" },
  dimmed: { bg: ui.surface, edge: ui.surfaceEdge, text: tokens.textSecondary },
};

function Tile({ label, state, disabled, compact, onPress }) {
  const look = TILE[state];
  const reduce = useReducedMotion();
  const pop = useRef(new Animated.Value(1)).current;
  const shake = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (reduce) return undefined;
    let run = null;
    if (state === "correct") {
      pop.setValue(0);
      run = popTiming(pop);
    } else if (state === "wrong") {
      run = shakeTiming(shake);
    }
    run?.start();
    return () => run?.stop();
  }, [state, reduce, pop, shake]);

  return (
    <Animated.View
      style={{
        transform: [{ translateX: shake }, { scale: pop.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1] }) }],
      }}
    >
      <PressLip
        onPress={onPress}
        disabled={disabled}
        haptics
        lip={look.edge}
        lipSize={edge.tile.depth}
        radius={edge.tile.radius}
        border
        accessibilityLabel={
          state === "correct" ? `${label}, correct answer` : state === "wrong" ? `${label}, your answer` : label
        }
        accessibilityState={{ selected: state === "selected" }}
        faceStyle={[compact ? styles.tileRow : styles.tile, { backgroundColor: look.bg }]}
      >
        <AppText style={[compact ? styles.tileTextRow : styles.tileText, { color: look.text }]}>{label}</AppText>
        {look.badge ? (
          <View
            style={[
              styles.badge,
              compact ? null : styles.badgeCorner,
              { backgroundColor: look.badge === "correct" ? "#FFFFFF" : ui.wrong.edge },
            ]}
          >
            <Ionicons
              name={look.badge === "correct" ? "checkmark" : "close"}
              size={15}
              color={look.badge === "correct" ? ui.correct.face : "#FFFFFF"}
            />
          </View>
        ) : null}
      </PressLip>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  instruction: {
    marginTop: space.md,
  },

  prompt: {
    fontFamily: fonts.display,
    fontSize: 26,
    lineHeight: 42,
    letterSpacing: -0.4,
    color: tokens.text,
    marginTop: space.md,
  },

  // the empty gap: a 78 x 34 rounded slot with a darker 3 dp band along its inside top
  blank: {
    width: 78,
    height: 34,
    marginHorizontal: 4,
    borderRadius: 10,
    overflow: "hidden",
    backgroundColor: ui.slot,
    transform: [{ translateY: 7 }],
  },

  blankInset: {
    height: 3,
    backgroundColor: ui.slotInset,
  },

  pillBox: {
    marginHorizontal: 4,
    paddingBottom: 3,
  },

  pillLip: {
    ...StyleSheet.absoluteFill,
    top: 3,
    borderRadius: 10,
  },

  pill: {
    height: 31,
    paddingHorizontal: 12,
    borderRadius: 10,
    justifyContent: "center",
  },

  pillText: {
    fontFamily: fonts.display,
    fontSize: 20,
    lineHeight: 24,
  },

  grid: {
    marginTop: space.xxl,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 14,
  },

  cell: {
    flexBasis: "45%",
    flexGrow: 1,
  },

  list: {
    marginTop: space.xxl,
    gap: space.md,
  },

  tile: {
    height: 68,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: space.md,
  },

  tileRow: {
    minHeight: 64,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    gap: space.md,
  },

  tileText: {
    fontFamily: fonts.semibold,
    fontSize: 18,
    lineHeight: 24,
    textAlign: "center",
  },

  tileTextRow: {
    fontFamily: fonts.semibold,
    fontSize: 16,
    lineHeight: 22,
    flex: 1,
  },

  badge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },

  badgeCorner: {
    position: "absolute",
    top: 8,
    right: 8,
  },

  input: {
    ...type.body,
    marginTop: space.xxl,
    color: tokens.text,
    minHeight: 58,
    borderWidth: 2,
    borderColor: ui.surfaceEdge,
    borderRadius: layout.tileRadius - 4,
    backgroundColor: tokens.surface,
    paddingHorizontal: space.lg,
  },

  inputLocked: {
    color: tokens.textSecondary,
  },
});

