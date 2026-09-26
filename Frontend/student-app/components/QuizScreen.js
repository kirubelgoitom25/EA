import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { quizzes } from "../services/api";
import { colors, radius } from "../theme";
import BottomNavBar from "./BottomNavBar";
import DuoButton from "./DuoButton";

// XP awarded per correct answer, by attempt number.
// Attempt 1 = 10, attempt 2 = 5, attempt 3 = 2.5,
// attempt 4 and beyond = 1.
const XP_BY_ATTEMPT = [10, 5, 2.5, 1];

const getXpPerCorrectAnswer = (attemptNumber) => {
  const index = Math.min(attemptNumber - 1, XP_BY_ATTEMPT.length - 1);
  return XP_BY_ATTEMPT[Math.max(index, 0)];
};

const formatXpRate = (rate) =>
  Number.isInteger(rate) ? `${rate}` : rate.toFixed(1);

function NavBarWrapper({ children, onHome, onCourses, onRanking, onProfile }) {
  return (
    <View style={styles.root}>
      {children}

      <BottomNavBar
        active="courses"
        onNavigate={(tab) => {
          if (tab === "home") onHome();
          if (tab === "courses") onCourses();
          if (tab === "ranking") onRanking();
          if (tab === "profile") onProfile();
        }}
      />
    </View>
  );
}

export default function QuizScreen({
  lesson,
  attemptNumber = 1,
  onBack,
  onComplete,
  onHome,
  onCourses,
  onRanking,
  onProfile,
}) {
  const quiz = quizzes.find((item) => item.lessonId === lesson.id);

  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState(null);
  const [score, setScore] = useState(0);
  const [finished, setFinished] = useState(false);
  const [xpEarned, setXpEarned] = useState(0);

  const navProps = { onHome, onCourses, onRanking, onProfile };

  if (!quiz) {
    return (
      <NavBarWrapper {...navProps}>
        <View style={styles.container}>
          <Text style={styles.title}>Quiz coming soon</Text>

          <TouchableOpacity onPress={onBack}>
            <Text style={styles.backButton}>← Back to Lesson</Text>
          </TouchableOpacity>
        </View>
      </NavBarWrapper>
    );
  }

  const xpPerCorrect = getXpPerCorrectAnswer(attemptNumber);
  const question = quiz.questions[currentQuestion];

  const handleAnswer = (index) => {
    if (selectedAnswer !== null) {
      return;
    }

    setSelectedAnswer(index);
  };

  const handleNext = () => {
    if (selectedAnswer === null) {
      return;
    }

    const isLastQuestion = currentQuestion === quiz.questions.length - 1;
    const newScore =
      selectedAnswer === question.correctAnswer ? score + 1 : score;

    setScore(newScore);

    if (isLastQuestion) {
      const totalXp = Math.round(newScore * xpPerCorrect);
      setXpEarned(totalXp);
      setFinished(true);
      onComplete(totalXp, newScore);
      return;
    }

    setCurrentQuestion(currentQuestion + 1);
    setSelectedAnswer(null);
  };

  const handleTryAgain = () => {
    setCurrentQuestion(0);
    setSelectedAnswer(null);
    setScore(0);
    setFinished(false);
  };

  if (finished) {
    const totalQuestions = quiz.questions.length;
    const nextRate = getXpPerCorrectAnswer(attemptNumber + 1);
    const isPerfect = score === totalQuestions;

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

          <Text style={styles.resultTitle}>Quiz Complete!</Text>

          <Text style={styles.score}>
            {score}/{totalQuestions}
          </Text>

          <View style={styles.xpPill}>
            <Ionicons name="flash" size={16} color={colors.blueDark} />
            <Text style={styles.resultText}>You earned {xpEarned} XP</Text>
          </View>

          <Text style={styles.resultSubtext}>
            {isPerfect
              ? "Perfect score!"
              : "Nice work — review and try again anytime."}
          </Text>

          <DuoButton
            label="Back to Lesson"
            variant="primary"
            onPress={onBack}
            style={styles.mainButton}
          />

          <DuoButton
            label={`Try Again · ${formatXpRate(nextRate)} XP each`}
            variant="outline"
            onPress={handleTryAgain}
            style={styles.mainButton}
          />
        </ScrollView>
      </NavBarWrapper>
    );
  }

  const progressPercent =
    ((currentQuestion + (selectedAnswer !== null ? 1 : 0)) /
      quiz.questions.length) *
    100;

  return (
    <NavBarWrapper {...navProps}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.scrollContent}
      >
        <TouchableOpacity onPress={onBack}>
          <Text style={styles.backButton}>← Lesson</Text>
        </TouchableOpacity>

        <View style={styles.headerRow}>
          <Text style={styles.title}>Quick Quiz</Text>

          {attemptNumber > 1 && (
            <View style={styles.attemptBadge}>
              <Text style={styles.attemptBadgeText}>
                Attempt {attemptNumber}
              </Text>
            </View>
          )}
        </View>

        <Text style={styles.progress}>
          Question {currentQuestion + 1} of {quiz.questions.length} ·{" "}
          {formatXpRate(xpPerCorrect)} XP each
        </Text>

        <View style={styles.progressTrack}>
          <View
            style={[styles.progressFill, { width: `${progressPercent}%` }]}
          />
        </View>

        <View style={styles.questionCard}>
          <Text style={styles.question}>{question.question}</Text>

          {question.options.map((option, index) => {
            const isSelected = selectedAnswer === index;
            const isCorrectOption = index === question.correctAnswer;
            const hasAnswered = selectedAnswer !== null;

            const optionStyle = [
              styles.option,
              hasAnswered && isCorrectOption && styles.correctOption,
              hasAnswered &&
                isSelected &&
                !isCorrectOption &&
                styles.incorrectOption,
            ];

            const optionTextStyle = [
              styles.optionText,
              (isSelected || (hasAnswered && isCorrectOption)) &&
                styles.selectedOptionText,
            ];

            return (
              <TouchableOpacity
                key={index}
                style={optionStyle}
                onPress={() => handleAnswer(index)}
                disabled={hasAnswered}
              >
                <View style={styles.optionLetter}>
                  <Text style={styles.optionLetterText}>
                    {String.fromCharCode(65 + index)}
                  </Text>
                </View>

                <Text style={optionTextStyle}>{option}</Text>

                {hasAnswered && isCorrectOption && (
                  <Ionicons name="checkmark-circle" size={22} color={colors.green} />
                )}

                {hasAnswered && isSelected && !isCorrectOption && (
                  <Ionicons name="close-circle" size={22} color={colors.red} />
                )}
              </TouchableOpacity>
            );
          })}
        </View>

        <DuoButton
          label={
            currentQuestion === quiz.questions.length - 1
              ? "Finish Quiz"
              : "Next"
          }
          variant="primary"
          disabled={selectedAnswer === null}
          onPress={handleNext}
          style={styles.mainButton}
        />
      </ScrollView>
    </NavBarWrapper>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.screenBg,
  },

  container: {
    flex: 1,
    paddingHorizontal: 20,
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
    color: colors.text,
  },

  attemptBadge: {
    backgroundColor: colors.gold,
    borderRadius: radius.full,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },

  attemptBadgeText: {
    color: "#4a3900",
    fontSize: 12,
    fontWeight: "800",
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

  questionCard: {
    backgroundColor: "#fff",
    borderRadius: radius.lg,
    padding: 20,
    borderWidth: 2,
    borderColor: colors.border,
  },

  question: {
    fontSize: 19,
    fontWeight: "700",
    lineHeight: 26,
    marginBottom: 20,
    color: colors.text,
  },

  option: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 2,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: 14,
    marginBottom: 12,
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

  selectedOptionText: {
    fontWeight: "700",
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

  resultText: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.blueDark,
  },

  resultSubtext: {
    fontSize: 14,
    color: colors.textMuted,
    textAlign: "center",
    marginTop: 10,
  },
});
