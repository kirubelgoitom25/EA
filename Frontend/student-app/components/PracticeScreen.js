import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Animated,
  Easing,
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { fetchPracticeByLessonId, submitPractice } from "../services/api";
import { radius, useTheme } from "../theme";
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

const isChoose = (activity) => activity.type === "choose";

// Returns the first field that actually has a value. Uses null checks (not
// truthiness) so a valid answer of 0 is never treated as "missing".
const pick = (obj, keys) => {
  for (const key of keys) {
    const value = obj?.[key];
    if (value !== undefined && value !== null && value !== "") {
      return value;
    }
  }
  return null;
};

// Same idea as the quiz's getCorrectIndex: accept camelCase or snake_case,
// and numbers or numeric strings, so the answer key and explanation are found
// however the API names them.
const normalizeActivity = (raw) => {
  let answer = pick(raw, [
    "answer",
    "correctAnswer",
    "correct_answer",
    "correctIndex",
    "correct_index",
  ]);

  if (raw.type === "choose" && typeof answer === "string" && /^\d+$/.test(answer)) {
    answer = Number(answer);
  }

  const explanation = pick(raw, [
    "explanation",
    "explanationText",
    "explanation_text",
  ]);

  return { ...raw, answer, explanation };
};

// Whether the client received an answer key for this activity.
const hasAnswerKey = (activity) =>
  activity.answer !== undefined && activity.answer !== null;

// Human-readable correct answer (option text for numeric "choose" answers).
const getAnswerLabel = (activity) => {
  if (isChoose(activity) && typeof activity.answer === "number") {
    return (activity.options || [])[activity.answer] ?? activity.answer;
  }
  return activity.answer;
};

// Same look as the quiz explanation: muted box, info icon, soft entrance.
function ExplanationBox({ text, styles, colors }) {
  const motion = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    motion.setValue(0);
    Animated.timing(motion, {
      toValue: 1,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [motion, text]);

  return (
    <Animated.View
      style={[
        styles.explanationBox,
        {
          opacity: motion,
          transform: [
            {
              translateY: motion.interpolate({
                inputRange: [0, 1],
                outputRange: [8, 0],
              }),
            },
          ],
        },
      ]}
    >
      <Ionicons
        name="information-circle"
        size={18}
        color={colors.textMuted}
      />
      <Text style={styles.explanationText}>{text}</Text>
    </Animated.View>
  );
}

function NavBarWrapper({ children, onHome, onCourses, onRanking, onProfile }) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
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
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [practice, setPractice] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState({});
  // True once the current activity has been checked (feedback is showing).
  const [checked, setChecked] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [serverResults, setServerResults] = useState(null);

  const navProps = { onHome, onCourses, onRanking, onProfile };

  const loadPractice = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      setPractice(await fetchPracticeByLessonId(lesson.id));
    } catch (error) {
      setLoadError(error.message);
    } finally {
      setLoading(false);
    }
  }, [lesson.id]);

  useEffect(() => {
    loadPractice();
  }, [loadPractice]);

  if (loading) {
    return (
      <NavBarWrapper {...navProps}>
        <View style={[styles.emptyContainer, { justifyContent: "center" }]}>
          <ActivityIndicator size="large" color={colors.green} />
        </View>
      </NavBarWrapper>
    );
  }

  if (loadError) {
    return (
      <NavBarWrapper {...navProps}>
        <View style={styles.emptyContainer}>
          <Text style={styles.title}>Couldn't load the practice</Text>
          <Text style={styles.subtitle}>{loadError}</Text>

          <DuoButton
            label="Try Again"
            variant="primary"
            onPress={loadPractice}
            style={styles.mainButton}
          />

          <TouchableOpacity onPress={onBack}>
            <Text style={styles.backButton}>← Back to Lesson</Text>
          </TouchableOpacity>
        </View>
      </NavBarWrapper>
    );
  }

  if (!practice || !practice.activities?.length) {
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

  const activities = practice.activities.map(normalizeActivity);
  const total = activities.length;
  const activity = activities[currentIndex];
  const isLast = currentIndex === total - 1;

  const userAnswer = answers[activity.id];
  const hasAnswer = isChoose(activity)
    ? userAnswer !== undefined && userAnswer !== null
    : normalize(userAnswer) !== "";

  const keyKnown = hasAnswerKey(activity);

  // Used only to colour the current answer green/red after checking.
  // The score and XP come from the server.
  const isCorrect = () => {
    if (!hasAnswer || !keyKnown) {
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

  const correct = checked && isCorrect();
  const wrong = checked && keyKnown && !correct;

  const handleTextAnswer = (value) => {
    if (checked) {
      return;
    }
    setAnswers((current) => ({ ...current, [activity.id]: value }));
  };

  const handleChooseAnswer = (optionIndex) => {
    if (checked) {
      return;
    }
    setAnswers((current) => ({ ...current, [activity.id]: optionIndex }));
  };

  const submitAll = async () => {
    setSubmitting(true);
    try {
      const result = await submitPractice(
        lesson.id,
        activities.map((item) => ({
          itemId: item.id,
          textAnswer: isChoose(item) ? null : (answers[item.id] ?? ""),
          selectedIndex: isChoose(item) ? (answers[item.id] ?? null) : null,
        })),
      );

      setServerResults({
        score: result.score,
        xpEarned: result.xpEarned,
        xpPossible: result.xpPossible,
      });

      if (onComplete) {
        onComplete();
      }
    } catch (error) {
      Alert.alert("Couldn't submit your practice", error.message);
    } finally {
      setSubmitting(false);
    }
  };

  const goNextOrFinish = () => {
    if (isLast) {
      submitAll();
      return;
    }
    setCurrentIndex(currentIndex + 1);
    setChecked(false);
  };

  // One button drives the flow: Check -> Next / Finish.
  // If the API hides the answer key there is nothing to check, so we skip
  // straight to Next / Finish.
  const handlePrimaryPress = () => {
    if (!hasAnswer || submitting) {
      return;
    }

    if (!checked && keyKnown) {
      setChecked(true);
      return;
    }

    goNextOrFinish();
  };

  const handleTryAgain = () => {
    setAnswers({});
    setChecked(false);
    setCurrentIndex(0);
    setServerResults(null);
  };

  // ---------- Results ----------
  if (serverResults) {
    const isPerfect = serverResults.score === total;

    return (
      <NavBarWrapper {...navProps}>
        <ScrollView
          style={styles.container}
          contentContainerStyle={styles.scrollContent}
        >
          <View
            style={[
              styles.resultBadge,
              { backgroundColor: isPerfect ? colors.gold : colors.green },
            ]}
          >
            <Ionicons
              name={isPerfect ? "trophy" : "checkmark-circle"}
              size={44}
              color="#fff"
            />
          </View>

          <Text style={styles.resultTitle}>Practice Complete!</Text>

          <Text style={styles.score}>
            {serverResults.score}/{total}
          </Text>

          <View style={styles.xpPill}>
            <Ionicons name="flash" size={16} color={colors.blueDark} />
            <Text style={styles.xpEarnedText}>
              {serverResults.xpEarned} / {serverResults.xpPossible} XP earned
            </Text>
          </View>

          <Text style={styles.resultText}>
            {isPerfect
              ? "Perfect run — nice work!"
              : "Keep practicing to improve!"}
          </Text>

          <DuoButton
            label="Back to Lesson"
            variant="primary"
            onPress={onBack}
            style={styles.mainButton}
          />

          <DuoButton
            label="Try Again"
            variant="outline"
            onPress={handleTryAgain}
            style={styles.mainButton}
          />
        </ScrollView>
      </NavBarWrapper>
    );
  }

  // ---------- Activity ----------
  const progressPercent = ((currentIndex + (checked ? 1 : 0)) / total) * 100;

  const primaryLabel = submitting
    ? "Submitting..."
    : !checked && keyKnown
      ? "Check"
      : isLast
        ? "Finish Practice"
        : "Next";

  return (
    <NavBarWrapper {...navProps}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <TouchableOpacity onPress={onBack}>
          <Text style={styles.backButton}>← Lesson</Text>
        </TouchableOpacity>

        <View style={styles.headerRow}>
          <Text style={styles.title}>Practice</Text>

          <View
            style={[
              styles.xpTag,
              {
                backgroundColor: isChoose(activity)
                  ? colors.blueLight
                  : colors.greenBg,
              },
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
                {
                  color: isChoose(activity)
                    ? colors.blueDark
                    : colors.greenDark,
                },
              ]}
            >
              {getActivityXp(activity.type)} XP
            </Text>
          </View>
        </View>

        <Text style={styles.progress}>
          Activity {currentIndex + 1} of {total}
        </Text>

        <View style={styles.progressTrack}>
          <View
            style={[styles.progressFill, { width: `${progressPercent}%` }]}
          />
        </View>

        <View style={styles.activityCard}>
          <Text style={styles.question}>{activity.question}</Text>

          {activity.sentence && (
            <Text style={styles.sentence}>{activity.sentence}</Text>
          )}

          {isChoose(activity) ? (
            (activity.options || []).map((option, optionIndex) => {
              const isSelected = userAnswer === optionIndex;
              const isCorrectOption =
                keyKnown &&
                (typeof activity.answer === "number"
                  ? optionIndex === activity.answer
                  : normalize(option) === normalize(activity.answer));

              const showCorrect = checked && isCorrectOption;
              const showIncorrect = checked && isSelected && !isCorrectOption;
              const showSelected = !checked && isSelected;

              return (
                <TouchableOpacity
                  key={optionIndex}
                  style={[
                    styles.option,
                    showSelected && styles.selectedOption,
                    showCorrect && styles.correctOption,
                    showIncorrect && styles.incorrectOption,
                  ]}
                  onPress={() => handleChooseAnswer(optionIndex)}
                  disabled={checked}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isSelected }}
                >
                  <View
                    style={[
                      styles.optionLetter,
                      showSelected && styles.optionLetterSelected,
                    ]}
                  >
                    <Text
                      style={[
                        styles.optionLetterText,
                        showSelected && styles.optionLetterTextSelected,
                      ]}
                    >
                      {String.fromCharCode(65 + optionIndex)}
                    </Text>
                  </View>

                  <Text
                    style={[
                      styles.optionText,
                      (showSelected || showCorrect || showIncorrect) &&
                        styles.selectedOptionText,
                    ]}
                  >
                    {option}
                  </Text>

                  {showCorrect && (
                    <Ionicons
                      name="checkmark-circle"
                      size={22}
                      color={colors.green}
                    />
                  )}

                  {showIncorrect && (
                    <Ionicons
                      name="close-circle"
                      size={22}
                      color={colors.red}
                    />
                  )}
                </TouchableOpacity>
              );
            })
          ) : (
            <TextInput
              style={[
                styles.input,
                correct && styles.correctInput,
                wrong && styles.wrongInput,
              ]}
              placeholder="Type your answer"
              placeholderTextColor="#999"
              value={typeof userAnswer === "string" ? userAnswer : ""}
              onChangeText={handleTextAnswer}
              editable={!checked}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="done"
              onSubmitEditing={handlePrimaryPress}
            />
          )}

          {wrong && (
            <Text style={styles.answer}>
              Correct answer: {String(getAnswerLabel(activity))}
            </Text>
          )}

          {correct && <Text style={styles.correctText}>Correct!</Text>}

          {checked && keyKnown && activity.explanation && (
            <ExplanationBox
              text={activity.explanation}
              styles={styles}
              colors={colors}
            />
          )}
        </View>

        <DuoButton
          label={primaryLabel}
          variant="primary"
          disabled={!hasAnswer || submitting}
          onPress={handlePrimaryPress}
          style={styles.mainButton}
        />
      </ScrollView>
    </NavBarWrapper>
  );
}

const createStyles = (colors) =>
  StyleSheet.create({
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

    headerRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginTop: 20,
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

    progress: {
      color: colors.textMuted,
      marginTop: 10,
      marginBottom: 8,
      fontSize: 13,
      fontWeight: "600",
    },

    progressTrack: {
      height: 12,
      borderRadius: radius.full,
      backgroundColor: colors.border,
      overflow: "hidden",
      marginBottom: 20,
    },

    progressFill: {
      height: "100%",
      borderRadius: radius.full,
      backgroundColor: colors.green,
    },

    activityCard: {
      backgroundColor: colors.card,
      borderRadius: radius.lg,
      padding: 20,
      borderWidth: 2,
      borderColor: colors.border,
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
      fontSize: 19,
      fontWeight: "700",
      lineHeight: 26,
      color: colors.text,
    },

    sentence: {
      fontSize: 16,
      marginTop: 15,
      marginBottom: 4,
      color: colors.text,
    },

    input: {
      borderWidth: 2,
      borderColor: colors.border,
      borderRadius: radius.md,
      padding: 13,
      fontSize: 15,
      marginTop: 14,
      color: colors.text,
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
      backgroundColor: colors.blueLight,
      borderColor: colors.blue,
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
      width: 28,
      height: 28,
      borderRadius: 14,
      backgroundColor: colors.bgMuted,
      justifyContent: "center",
      alignItems: "center",
      marginRight: 12,
    },

    optionLetterSelected: {
      backgroundColor: colors.blue,
    },

    optionLetterText: {
      fontSize: 12,
      fontWeight: "800",
      color: colors.textMuted,
    },

    optionLetterTextSelected: {
      color: "#fff",
    },

    optionText: {
      fontSize: 15,
      flex: 1,
      color: colors.text,
    },

    selectedOptionText: {
      fontWeight: "700",
    },

    answer: {
      color: colors.textMuted,
      marginTop: 12,
      fontSize: 14,
      fontWeight: "600",
    },

    correctText: {
      color: colors.greenDark,
      marginTop: 12,
      fontSize: 14,
      fontWeight: "800",
    },

    explanationBox: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 8,
      marginTop: 14,
      padding: 12,
      borderRadius: radius.md,
      backgroundColor: colors.bgMuted,
    },

    explanationText: {
      flex: 1,
      fontSize: 13,
      lineHeight: 19,
      color: colors.textMuted,
    },

    mainButton: {
      marginTop: 20,
    },

    resultBadge: {
      width: 88,
      height: 88,
      borderRadius: 44,
      justifyContent: "center",
      alignItems: "center",
      alignSelf: "center",
      marginTop: 60,
    },

    resultTitle: {
      fontSize: 24,
      fontWeight: "800",
      textAlign: "center",
      marginTop: 16,
      color: colors.text,
    },

    score: {
      fontSize: 48,
      fontWeight: "800",
      textAlign: "center",
      marginTop: 16,
      color: colors.text,
    },

    xpPill: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      alignSelf: "center",
      backgroundColor: colors.blueLight,
      borderRadius: radius.full,
      paddingHorizontal: 14,
      paddingVertical: 8,
      marginTop: 14,
    },

    xpEarnedText: {
      fontSize: 14,
      fontWeight: "700",
      color: colors.blueDark,
    },

    resultText: {
      fontSize: 14,
      color: colors.textMuted,
      textAlign: "center",
      marginTop: 10,
    },
  });