import React from "react";
import { Pressable, StyleSheet, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { fonts, layout, level, levelLabel, space, tokens, type } from "../../theme";
import AppText from "../ui/AppText";
import { BLANK, splitBlank } from "./sessionModel";

const HEADINGS = {
  choice: "CHOOSE THE ANSWER",
  truefalse: "TRUE OR FALSE",
  fill: "FILL IN THE BLANK",
};

// Short options sit in a 2×2 grid of big tiles; longer ones stack.
const isShortSet = (options) =>
  options.length === 4 && options.every((o) => String(o).length <= 14);

// One question. Choice and true/false answer on tap; fill-in is typed and
// checked with the session's button.
//
// answer: chosen option index / typed text (undefined before answering).
// answered: true once feedback shows (locks input, reveals the answer).
export default function QuestionView({
  question,
  stageNumber,
  answer,
  answered,
  onChoose,
  onType,
  onSubmitText,
}) {
  const isFill = question.kind === "fill";
  const correctWord =
    answered && question.correctIndex !== null ? question.options[question.correctIndex] : null;

  return (
    <View>
      <AppText style={levelLabel}>
        STAGE {stageNumber} · {HEADINGS[question.kind]}
      </AppText>

      {isFill && question.sentence && question.prompt !== question.sentence && BLANK.test(question.sentence) ? (
        <AppText tone="secondary" style={styles.instruction}>
          {question.prompt}
        </AppText>
      ) : null}

      <Prompt
        question={question}
        // In the blank: the typed text (fill-in), or the right word once
        // a choice question is answered.
        slot={isFill ? answer || "" : correctWord}
        slotTone={isFill ? "typed" : "correct"}
      />

      {isFill ? (
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
      ) : (
        <Options question={question} answer={answer} answered={answered} onChoose={onChoose} />
      )}
    </View>
  );
}

// The prompt in the display face. A "___" blank becomes a tinted slot.
function Prompt({ question, slot, slotTone }) {
  const text = BLANK.test(question.sentence ?? "") ? question.sentence : question.prompt;
  const parts = question.kind === "fill" ? splitBlank(question) : null;
  const split = parts ?? (BLANK.test(text ?? "") ? { before: text.split(BLANK)[0], after: text.split(BLANK).slice(1).join("____") } : null);

  if (!split) {
    return <AppText style={styles.prompt}>{text}</AppText>;
  }

  const filled = Boolean(slot);
  const slotStyle = !filled
    ? styles.slotEmpty
    : slotTone === "correct"
      ? styles.slotCorrect
      : styles.slotTyped;

  return (
    <AppText style={styles.prompt}>
      {split.before}
      {filled ? (
        <AppText style={[styles.prompt, slotStyle]}>{` ${slot} `}</AppText>
      ) : (
        // the empty gap: a soft rounded box in the line, 64 x 30
        <View accessible accessibilityLabel="blank" style={styles.blank} />
      )}
      {split.after}
    </AppText>
  );
}

function Options({ question, answer, answered, onChoose }) {
  const state = (index) => {
    if (!answered) return "idle";
    if (question.correctIndex === null) return index === answer ? "chosen" : "dimmed";
    if (index === question.correctIndex) return "correct";
    if (index === answer) return "wrong";
    return "dimmed";
  };

  const grid = question.kind === "truefalse" || isShortSet(question.options);

  return (
    <View style={grid ? styles.grid : styles.list}>
      {question.options.map((option, index) => (
        <Tile
          key={index}
          label={String(option)}
          state={state(index)}
          disabled={answered}
          compact={!grid}
          tall={question.kind === "truefalse"}
          onPress={() => onChoose(index)}
        />
      ))}
    </View>
  );
}

// An answer is a white card with a 2 dp border and a 4 dp edge under it; a tap presses it down onto
// that edge. After answering, the right / wrong / chosen colours take over (the edge follows them).
const TILE = {
  idle: { bg: tokens.surface, border: level.card, edge: level.card, text: tokens.text },
  chosen: { bg: tokens.accentTint, border: tokens.accent, edge: tokens.accent, text: tokens.text },
  correct: { bg: tokens.correct, border: tokens.correct, edge: tokens.correct, text: "#FFFFFF", badge: "correct" },
  wrong: { bg: tokens.wrongTint, border: tokens.wrong, edge: tokens.wrong, text: tokens.text, badge: "wrong" },
  dimmed: { bg: tokens.surface, border: level.card, edge: level.card, text: tokens.textSecondary },
};
const EDGE = 4;

function Tile({ label, state, disabled, compact, tall, onPress }) {
  const look = TILE[state];

  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={
        state === "correct" ? `${label}, correct answer` : state === "wrong" ? `${label}, your answer` : label
      }
      accessibilityState={{ disabled }}
      style={[compact ? styles.slotRow : styles.slot, tall && styles.slotTall]}
    >
      {({ pressed }) => (
        <>
          <View style={[styles.edge, { backgroundColor: look.edge }]} />
          <View
            style={[
              compact ? styles.tileRow : styles.tile,
              { backgroundColor: look.bg, borderColor: look.border },
              pressed && !disabled && styles.tilePressed,
            ]}
          >
            <AppText
              style={[
                compact ? styles.tileTextRow : styles.tileText,
                { color: look.text },
              ]}
            >
              {label}
            </AppText>
            {look.badge ? (
              <View
                style={[
                  styles.badge,
                  compact ? styles.badgeRow : styles.badgeCorner,
                  { backgroundColor: look.badge === "correct" ? "#FFFFFF" : tokens.wrong },
                ]}
              >
                <Ionicons
                  name={look.badge === "correct" ? "checkmark" : "close"}
                  size={15}
                  color={look.badge === "correct" ? tokens.correct : "#FFFFFF"}
                />
              </View>
            ) : null}
          </View>
        </>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  instruction: {
    marginTop: space.md,
  },

  prompt: {
    fontFamily: fonts.display,
    fontSize: 26,
    lineHeight: 36,
    letterSpacing: -0.4,
    color: tokens.text,
    marginTop: space.md,
  },

  slotEmpty: {
    backgroundColor: level.blank,
    marginTop: 0,
  },

  blank: {
    width: 64,
    height: 30,
    marginHorizontal: 4,
    borderRadius: 8,
    backgroundColor: level.blank,
    transform: [{ translateY: 5 }], // sits on the line, like the words around it
  },

  slotCorrect: {
    color: tokens.correct,
    backgroundColor: tokens.correctTint,
    marginTop: 0,
  },

  slotTyped: {
    color: tokens.accentText,
    backgroundColor: tokens.accentTint,
    marginTop: 0,
  },

  grid: {
    marginTop: space.xxl,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 14,
  },

  list: {
    marginTop: space.xxl,
    gap: space.md,
  },

  // A card's place: the card itself plus the 4 dp edge showing under it.
  slot: {
    flexBasis: "47%",
    flexGrow: 1,
    height: 88 + EDGE,
  },

  slotTall: {
    height: 112 + EDGE,
  },

  slotRow: {
    paddingBottom: EDGE,
  },

  edge: {
    position: "absolute",
    left: 0,
    right: 0,
    top: EDGE,
    bottom: 0,
    borderRadius: level.cardRadius,
  },

  tile: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    bottom: EDGE,
    borderRadius: level.cardRadius,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: space.md,
  },

  tileRow: {
    minHeight: 64,
    borderRadius: level.cardRadius,
    borderWidth: 2,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    gap: space.md,
  },

  // pressed down onto its edge
  tilePressed: {
    transform: [{ translateY: EDGE }],
  },

  tileText: {
    ...type.answer,
    fontSize: 20,
    lineHeight: 26,
    textAlign: "center",
  },

  tileTextRow: {
    ...type.bodyStrong,
    flex: 1,
  },

  badge: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
  },

  badgeCorner: {
    position: "absolute",
    top: 10,
    right: 10,
  },

  badgeRow: {},

  input: {
    ...type.body,
    marginTop: space.xxl,
    color: tokens.text,
    minHeight: 58,
    borderWidth: 1.5,
    borderColor: tokens.divider,
    borderRadius: layout.tileRadius - 4,
    backgroundColor: tokens.surface,
    paddingHorizontal: space.lg,
  },

  inputLocked: {
    color: tokens.textSecondary,
  },
});
