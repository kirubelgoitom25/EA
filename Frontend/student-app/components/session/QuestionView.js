import React from "react";
import { Pressable, StyleSheet, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { fonts, layout, space, tokens, type } from "../../theme";
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
      <AppText variant="overline" tone="secondary">
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
      <AppText style={[styles.prompt, slotStyle]}>
        {filled ? ` ${slot} ` : "        "}
      </AppText>
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

const TILE = {
  idle: { bg: tokens.surface, border: tokens.divider, text: tokens.text, width: 1.5 },
  chosen: { bg: tokens.accentTint, border: tokens.accent, text: tokens.text, width: 2 },
  correct: { bg: tokens.correct, border: tokens.correct, text: "#FFFFFF", width: 1.5, badge: "correct" },
  wrong: { bg: tokens.wrongTint, border: tokens.wrong, text: tokens.text, width: 2, badge: "wrong" },
  dimmed: { bg: tokens.surface, border: tokens.divider, text: tokens.textTertiary, width: 1.5 },
};

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
      style={({ pressed }) => [
        compact ? styles.tileRow : styles.tile,
        tall && styles.tileTall,
        { backgroundColor: look.bg, borderColor: look.border, borderWidth: look.width },
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
    </Pressable>
  );
}

const styles = StyleSheet.create({
  instruction: {
    marginTop: space.md,
  },

  prompt: {
    fontFamily: fonts.display,
    fontSize: 28,
    lineHeight: 38,
    letterSpacing: -0.4,
    color: tokens.text,
    marginTop: space.md,
  },

  slotEmpty: {
    backgroundColor: tokens.accentTint,
    marginTop: 0,
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
    gap: space.md,
  },

  list: {
    marginTop: space.xxl,
    gap: space.md,
  },

  tile: {
    flexBasis: "47%",
    flexGrow: 1,
    height: 96,
    borderRadius: layout.tileRadius,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: space.md,
  },

  tileTall: {
    height: 112,
  },

  tileRow: {
    minHeight: 64,
    borderRadius: layout.tileRadius - 4,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    gap: space.md,
  },

  tilePressed: {
    backgroundColor: tokens.accentTint,
    borderColor: tokens.accent,
  },

  tileText: {
    ...type.answer,
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
