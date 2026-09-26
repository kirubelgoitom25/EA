import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { practices } from "../services/api";
import { colors, radius } from "../theme";
import BottomNavBar from "./BottomNavBar";
import DuoButton from "./DuoButton";

// Fill-in-the-blank is worth more since it's recall rather than
// recognition. Anything without an explicit type is treated as
// "fill" to stay compatible with older activity data.
const XP_BY_TYPE = {
  choose: 5,
  fill: 10,
};

const getActivityXp = (type) => XP_BY_TYPE[type] ?? XP_BY_TYPE.fill;

const normalize = (value) => (value ?? "").toString().trim().toLowerCase();

function NavBarWrapper({ children, onHome, onCourses, onRanking, onProfile }) {
  return (
    <View style={styles.screen}>
      {children}

      <BottomNavBar
        active="courses"
        onNavigate={(tab) => {
          if (tab === "home" && onHome) onHome();
          if (tab === "courses" && onCourses) onCourses();
          if (tab === "ranking" && onRanking) onRanking();
          if (tab === "profile" && onProfile) onProfile();
        }}
      />
    </View>
  );
}

export default function PracticeScreen({
  lesson,
  onBack,
  onComplete,
  onHome,
  onCourses,
  onRanking,
  onProfile,
}) {
  const practice = practices.find((item) => item.lessonId === lesson.id);

  const [answers, setAnswers] = useState({});
  const [submitted, setSubmitted] = useState(false);
  const [hasAwardedXp, setHasAwardedXp] = useState(false);

  const navProps = { onHome, onCourses, onRanking, onProfile };

  if (!practice) {
    return (
      <NavBarWrapper {...navProps}>
        <View style={styles.emptyContainer}>
          <Text style={styles.title}>Practice coming soon</Text>

          <TouchableOpacity onPress={onBack}>
            <Text style={styles.backButton}>← Back to Lesson</Text>
          </TouchableOpacity>
        </View>
      </NavBarWrapper>
    );
  }

  const isChoose = (activity) => activity.type === "choose";

  const isCorrect = (activity) => {
    const userAnswer = answers[activity.id];

    if (userAnswer === undefined || userAnswer === null) {
      return false;
    }

    if (isChoose(activity) && typeof activity.answer === "number") {
      return userAnswer === activity.answer;
    }

    if (isChoose(activity)) {
      const options = activity.options || [];
      return normalize(options[userAnswer]) === normalize(activity.answer);
    }

    return normalize(userAnswer) === normalize(activity.answer);
  };

  const handleTextAnswer = (id, value) => {
    setAnswers((current) => ({ ...current, [id]: value }));
  };

  const handleChooseAnswer = (id, optionIndex) => {
    if (submitted) {
      return;
    }

    setAnswers((current) => ({ ...current, [id]: optionIndex }));
  };

  const getResults = () => {
    let score = 0;
    let xpEarned = 0;
    let xpPossible = 0;

    practice.activities.forEach((activity) => {
      const xp = getActivityXp(activity.type);
      xpPossible += xp;

      if (isCorrect(activity)) {
        score += 1;
        xpEarned += xp;
      }
    });

    return { score, xpEarned, xpPossible };
  };

  const handleSubmit = () => {
    setSubmitted(true);

    if (!hasAwardedXp) {
      const { xpEarned } = getResults();

      if (onComplete) {
        onComplete(xpEarned, results.score);
      }

      setHasAwardedXp(true);
    }
  };

  const handleTryAgain = () => {
    setAnswers({});
    setSubmitted(false);
  };

  const results = submitted ? getResults() : null;

  return (
    <NavBarWrapper {...navProps}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <TouchableOpacity onPress={onBack}>
          <Text style={styles.backButton}>← Lesson</Text>
        </TouchableOpacity>

        <Text style={styles.title}>Practice</Text>

        <Text style={styles.subtitle}>
          Practice what you learned in this lesson.
        </Text>

        {practice.activities.map((activity, index) => {
          const xp = getActivityXp(activity.type);
          const correct = submitted && isCorrect(activity);

          return (
            <View key={activity.id} style={styles.activityCard}>
              <View style={styles.activityHeader}>
                <Text style={styles.number}>Activity {index + 1}</Text>

                <View
                  style={[
                    styles.xpTag,
                    { backgroundColor: isChoose(activity) ? colors.blueLight : colors.greenBg },
                  ]}
                >
                  <Ionicons
                    name={isChoose(activity) ? "radio-button-on" : "pencil"}
                    size={12}
                    color={isChoose(activity) ? colors.blueDark : colors.greenDark}
                  />
                  <Text
                    style={[
                      styles.xpTagText,
                      { color: isChoose(activity) ? colors.blueDark : colors.greenDark },
                    ]}
                  >
                    {xp} XP
                  </Text>
                </View>
              </View>

              <Text style={styles.question}>{activity.question}</Text>

              {activity.sentence && (
                <Text style={styles.sentence}>{activity.sentence}</Text>
              )}

              {isChoose(activity) ? (
                (activity.options || []).map((option, optionIndex) => {
                  const isSelected = answers[activity.id] === optionIndex;
                  const isCorrectOption =
                    typeof activity.answer === "number"
                      ? optionIndex === activity.answer
                      : normalize(option) === normalize(activity.answer);

                  const optionStyle = [
                    styles.option,
                    submitted && isCorrectOption && styles.correctOption,
                    submitted &&
                      isSelected &&
                      !isCorrectOption &&
                      styles.incorrectOption,
                    !submitted && isSelected && styles.selectedOption,
                  ];

                  return (
                    <TouchableOpacity
                      key={optionIndex}
                      style={optionStyle}
                      onPress={() =>
                        handleChooseAnswer(activity.id, optionIndex)
                      }
                      disabled={submitted}
                    >
                      <View style={styles.optionLetter}>
                        <Text style={styles.optionLetterText}>
                          {String.fromCharCode(65 + optionIndex)}
                        </Text>
                      </View>

                      <Text style={styles.optionText}>{option}</Text>

                      {submitted && isCorrectOption && (
                        <Ionicons name="checkmark-circle" size={20} color={colors.green} />
                      )}

                      {submitted && isSelected && !isCorrectOption && (
                        <Ionicons name="close-circle" size={20} color={colors.red} />
                      )}
                    </TouchableOpacity>
                  );
                })
              ) : (
                <TextInput
                  style={[
                    styles.input,
                    submitted && correct && styles.correctInput,
                    submitted && !correct && styles.wrongInput,
                  ]}
                  placeholder="Type your answer"
                  placeholderTextColor="#999"
                  value={answers[activity.id] || ""}
                  onChangeText={(value) =>
                    handleTextAnswer(activity.id, value)
                  }
                  editable={!submitted}
                />
              )}

              {submitted && !correct && (
                <Text style={styles.answer}>
                  Correct answer: {activity.answer}
                </Text>
              )}
            </View>
          );
        })}

        {!submitted ? (
          <DuoButton
            label="Check Answers"
            variant="primary"
            onPress={handleSubmit}
            style={styles.mainButton}
          />
        ) : (
          <View style={styles.resultCard}>
            <View
              style={[
                styles.resultBadge,
                {
                  backgroundColor:
                    results.score === practice.activities.length
                      ? colors.gold
                      : colors.green,
                },
              ]}
            >
              <Ionicons
                name={
                  results.score === practice.activities.length
                    ? "trophy"
                    : "checkmark-circle"
                }
                size={36}
                color="#fff"
              />
            </View>

            <Text style={styles.resultTitle}>Practice Complete</Text>

            <Text style={styles.score}>
              {results.score} / {practice.activities.length}
            </Text>

            <View style={styles.xpPill}>
              <Ionicons name="flash" size={16} color={colors.blueDark} />
              <Text style={styles.xpEarnedText}>
                {results.xpEarned} / {results.xpPossible} XP earned
              </Text>
            </View>

            <Text style={styles.resultText}>
              {results.score === practice.activities.length
                ? "Perfect run — nice work!"
                : "Keep practicing to improve!"}
            </Text>

            <DuoButton
              label="Try Again"
              variant="outline"
              onPress={handleTryAgain}
              style={styles.mainButton}
            />

            <DuoButton
              label="Back to Lesson"
              variant="primary"
              onPress={onBack}
              style={styles.mainButton}
            />
          </View>
        )}
      </ScrollView>
    </NavBarWrapper>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.screenBg,
  },

  container: {
    flex: 1,
    paddingHorizontal: 20,
  },

  emptyContainer: {
    flex: 1,
    padding: 20,
  },

  scrollContent: {
    paddingBottom: 110,
  },

  backButton: {
    marginTop: 40,
    fontSize: 15,
    fontWeight: "700",
    color: colors.blue,
  },

  title: {
    fontSize: 26,
    fontWeight: "800",
    marginTop: 20,
    color: colors.text,
  },

  subtitle: {
    color: colors.textMuted,
    marginTop: 6,
    marginBottom: 22,
  },

  activityCard: {
    backgroundColor: "#fff",
    borderRadius: radius.lg,
    padding: 20,
    marginBottom: 15,
    borderWidth: 2,
    borderColor: colors.border,
  },

  activityHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },

  number: {
    fontSize: 13,
    color: colors.textMuted,
    fontWeight: "700",
  },

  xpTag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderRadius: radius.full,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },

  xpTagText: {
    fontSize: 12,
    fontWeight: "800",
  },

  question: {
    fontSize: 17,
    fontWeight: "700",
    marginTop: 12,
    color: colors.text,
  },

  sentence: {
    fontSize: 16,
    marginTop: 15,
    marginBottom: 12,
    color: colors.text,
  },

  input: {
    borderWidth: 2,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: 13,
    fontSize: 15,
    marginTop: 14,
  },

  correctInput: {
    borderColor: colors.green,
    backgroundColor: colors.greenBg,
  },

  wrongInput: {
    borderColor: colors.red,
    backgroundColor: colors.redLight,
  },

  option: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 2,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: 14,
    marginTop: 12,
  },

  selectedOption: {
    backgroundColor: colors.bgMuted,
    borderColor: colors.text,
  },

  correctOption: {
    backgroundColor: colors.greenBg,
    borderColor: colors.green,
  },

  incorrectOption: {
    backgroundColor: colors.redLight,
    borderColor: colors.red,
  },

  optionLetter: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.bgMuted,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },

  optionLetterText: {
    fontSize: 12,
    fontWeight: "800",
    color: colors.textMuted,
  },

  optionText: {
    fontSize: 15,
    flex: 1,
    color: colors.text,
  },

  answer: {
    color: colors.textMuted,
    marginTop: 10,
    fontSize: 13,
  },

  mainButton: {
    marginTop: 12,
  },

  resultCard: {
    backgroundColor: "#fff",
    borderRadius: radius.lg,
    padding: 25,
    alignItems: "center",
    marginBottom: 20,
    borderWidth: 2,
    borderColor: colors.border,
  },

  resultBadge: {
    width: 72,
    height: 72,
    borderRadius: 36,
    justifyContent: "center",
    alignItems: "center",
  },

  resultTitle: {
    fontSize: 20,
    fontWeight: "800",
    marginTop: 12,
    color: colors.text,
  },

  score: {
    fontSize: 36,
    fontWeight: "800",
    marginTop: 15,
    color: colors.text,
  },

  xpPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.blueLight,
    borderRadius: radius.full,
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginTop: 12,
  },

  xpEarnedText: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.blueDark,
  },

  resultText: {
    color: colors.textMuted,
    marginTop: 10,
  },
});
