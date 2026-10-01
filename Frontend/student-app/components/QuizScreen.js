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
  Pressable,
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { fetchQuizByLessonId, submitQuiz } from "../services/api";
import { radius, useTheme } from "../theme";
import BottomNavBar from "./BottomNavBar";
import DuoButton from "./DuoButton";

const formatXpRate = (rate) =>
  Number.isInteger(rate) ? `${rate}` : rate.toFixed(1);

const playEntrance = (values, delay = 60) => {
  values.forEach((value) => value.setValue(0));
  Animated.stagger(
    delay,
    values.map((value) =>
      Animated.timing(value, {
        toValue: 1,
        duration: 260,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ),
  ).start();
};

function PressScale({ children, onPress, style, disabled = false }) {
  const scale = useRef(new Animated.Value(1)).current;

  const pressIn = () => {
    if (!disabled) {
      Animated.timing(scale, {
        toValue: 0.97,
        duration: 75,
        useNativeDriver: true,
      }).start();
    }
  };

  const pressOut = () => {
    Animated.spring(scale, {
      toValue: 1,
      speed: 24,
      bounciness: 4,
      useNativeDriver: true,
    }).start();
  };

  return (
    <Pressable
      onPress={onPress}
      onPressIn={pressIn}
      onPressOut={pressOut}
      disabled={disabled}
      style={style}
    >
      <Animated.View style={{ transform: [{ scale }] }}>
        {children}
      </Animated.View>
    </Pressable>
  );
}

function AnswerOption({
  index,
  option,
  isSelected,
  showNeutralSelected,
  showCorrect,
  showIncorrect,
  disabled,
  onPress,
  styles,
  colors,
}) {
  const pressScale = useRef(new Animated.Value(1)).current;
  const selection = useRef(new Animated.Value(0)).current;
  const feedback = useRef(new Animated.Value(0)).current;
  const shake = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.spring(selection, {
      toValue: isSelected ? 1 : 0,
      speed: 22,
      bounciness: 5,
      useNativeDriver: true,
    }).start();
  }, [isSelected, selection]);

  useEffect(() => {
    if (showCorrect || showIncorrect) {
      feedback.setValue(0);
      Animated.spring(feedback, {
        toValue: 1,
        speed: 20,
        bounciness: 8,
        useNativeDriver: true,
      }).start();
    }

    if (showIncorrect) {
      shake.setValue(0);
      Animated.sequence([
        Animated.timing(shake, {
          toValue: 1,
          duration: 35,
          useNativeDriver: true,
        }),
        Animated.timing(shake, {
          toValue: -1,
          duration: 55,
          useNativeDriver: true,
        }),
        Animated.timing(shake, {
          toValue: 0.55,
          duration: 45,
          useNativeDriver: true,
        }),
        Animated.timing(shake, {
          toValue: 0,
          duration: 45,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [feedback, shake, showCorrect, showIncorrect]);

  const selectedScale = selection.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.025],
  });
  const shakeX = shake.interpolate({
    inputRange: [-1, 1],
    outputRange: [-4, 4],
  });
  const feedbackScale = feedback.interpolate({
    inputRange: [0, 1],
    outputRange: [0.55, 1],
  });
  const optionStyle = [
    styles.option,
    showNeutralSelected && styles.selectedOption,
    showCorrect && styles.correctOption,
    showIncorrect && styles.incorrectOption,
  ];
  const optionTextStyle = [
    styles.optionText,
    (showNeutralSelected || showCorrect || showIncorrect) &&
      styles.selectedOptionText,
  ];

  return (
    <Pressable
      onPress={onPress}
      onPressIn={() =>
        Animated.timing(pressScale, {
          toValue: 0.97,
          duration: 70,
          useNativeDriver: true,
        }).start()
      }
      onPressOut={() =>
        Animated.spring(pressScale, {
          toValue: 1,
          speed: 24,
          bounciness: 4,
          useNativeDriver: true,
        }).start()
      }
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ selected: isSelected, disabled }}
    >
      <Animated.View
        style={[
          optionStyle,
          {
            transform: [
              { scale: Animated.multiply(pressScale, selectedScale) },
              { translateX: shakeX },
            ],
          },
        ]}
      >
        <Animated.View
          style={[
            styles.optionLetter,
            showNeutralSelected && styles.optionLetterSelected,
            {
              transform: [
                {
                  scale: selection.interpolate({
                    inputRange: [0, 1],
                    outputRange: [1, 1.08],
                  }),
                },
              ],
            },
          ]}
        >
          <Text
            style={[
              styles.optionLetterText,
              showNeutralSelected && styles.optionLetterTextSelected,
            ]}
          >
            {String.fromCharCode(65 + index)}
          </Text>
        </Animated.View>

        <Text style={optionTextStyle}>{option}</Text>

        {(showCorrect || showIncorrect) && (
          <Animated.View
            style={{ opacity: feedback, transform: [{ scale: feedbackScale }] }}
          >
            <Ionicons
              name={showCorrect ? "checkmark-circle" : "close-circle"}
              size={22}
              color={showCorrect ? colors.correct : colors.red}
            />
          </Animated.View>
        )}
      </Animated.View>
    </Pressable>
  );
}

function CountUp({ value, style }) {
  const animatedValue = useRef(new Animated.Value(0)).current;
  const [count, setCount] = useState(0);

  useEffect(() => {
    animatedValue.setValue(0);
    setCount(0);
    const listenerId = animatedValue.addListener(({ value: nextValue }) => {
      setCount(Math.round(nextValue));
    });

    Animated.timing(animatedValue, {
      toValue: value,
      duration: 680,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();

    return () => {
      animatedValue.removeListener(listenerId);
      animatedValue.stopAnimation();
    };
  }, [animatedValue, value]);

  return <Text style={style}>{count}</Text>;
}

function QuestionCounter({ currentQuestion, totalQuestions, motion, styles }) {
  const previousQuestion = useRef(currentQuestion);

  useEffect(() => {
    if (previousQuestion.current === currentQuestion) {
      return;
    }

    previousQuestion.current = currentQuestion;
    motion.setValue(0);
    Animated.timing(motion, {
      toValue: 1,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [currentQuestion, motion]);

  return (
    <Animated.View
      style={{
        opacity: motion,
        transform: [
          {
            translateY: motion.interpolate({
              inputRange: [0, 1],
              outputRange: [7, 0],
            }),
          },
        ],
      }}
    >
      <Text style={styles.counterCaption}>QUESTION</Text>
      <View style={styles.counterRow}>
        <Text style={styles.counterNumber}>{currentQuestion + 1}</Text>
        <Text style={styles.counterTotal}>/ {totalQuestions}</Text>
      </View>
    </Animated.View>
  );
}

/**
 * Returns the correct option index if the API sent one, otherwise null.
 *
 * Accepts camelCase or snake_case, and numbers or numeric strings. It uses
 * null checks (not truthiness) so a valid index of 0 is never treated as
 * "missing". Returning null means "the server is hiding the answer key",
 * and the UI falls back to a neutral selection state.
 */
const getCorrectIndex = (question) => {
  const raw =
    question?.correctAnswer ??
    question?.correct_answer ??
    question?.correctIndex ??
    question?.correct_index;

  if (raw === null || raw === undefined || raw === "") {
    return null;
  }

  const index = Number(raw);
  const optionCount = question?.options?.length ?? 0;

  return Number.isInteger(index) && index >= 0 && index < optionCount
    ? index
    : null;
};

function NavBarWrapper({ children, onHome, onCourses, onRanking, onProfile }) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
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
  onBack,
  onComplete,
  onHome,
  onCourses,
  onRanking,
  onProfile,
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [quiz, setQuiz] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState(null);
  const [chosen, setChosen] = useState({});
  const [score, setScore] = useState(0);
  const [finished, setFinished] = useState(false);
  const [xpEarned, setXpEarned] = useState(0);
  const [nextXpPerCorrect, setNextXpPerCorrect] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [isTransitioning, setIsTransitioning] = useState(false);

  const totalQuestions = quiz?.questions?.length ?? 0;
  const question = quiz?.questions?.[currentQuestion];
  const correctIndex = getCorrectIndex(question);
  const revealsAnswers = correctIndex !== null;
  const hasAnswered = selectedAnswer !== null;
  const progressPercent = totalQuestions
    ? ((currentQuestion + (hasAnswered ? 1 : 0)) / totalQuestions) * 100
    : 0;

  const headerEntrance = useRef(new Animated.Value(0)).current;
  const progressEntrance = useRef(new Animated.Value(0)).current;
  const questionEntrance = useRef(new Animated.Value(0)).current;
  const actionEntrance = useRef(new Animated.Value(0)).current;
  const questionMotion = useRef(new Animated.Value(1)).current;
  const progressMotion = useRef(new Animated.Value(0)).current;
  const counterMotion = useRef(new Animated.Value(1)).current;
  const xpMotion = useRef(new Animated.Value(1)).current;
  const resultBadgeMotion = useRef(new Animated.Value(0)).current;
  const resultTitleMotion = useRef(new Animated.Value(0)).current;
  const resultScoreMotion = useRef(new Animated.Value(0)).current;
  const resultXpMotion = useRef(new Animated.Value(0)).current;
  const resultActionsMotion = useRef(new Animated.Value(0)).current;
  const resultExitMotion = useRef(new Animated.Value(1)).current;
  const entrancePlayedForQuiz = useRef(false);
  const transitionLock = useRef(false);

  const navProps = { onHome, onCourses, onRanking, onProfile };

  useEffect(() => {
    Animated.timing(progressMotion, {
      toValue: progressPercent / 100,
      duration: 380,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [progressMotion, progressPercent]);

  useEffect(() => {
    if (loading || finished || !quiz || entrancePlayedForQuiz.current) {
      return;
    }

    entrancePlayedForQuiz.current = true;
    playEntrance(
      [headerEntrance, progressEntrance, questionEntrance, actionEntrance],
      65,
    );
  }, [
    actionEntrance,
    finished,
    headerEntrance,
    loading,
    progressEntrance,
    questionEntrance,
    quiz,
  ]);

  useEffect(() => {
    if (!finished) {
      return;
    }

    resultExitMotion.setValue(1);
    playEntrance(
      [
        resultBadgeMotion,
        resultTitleMotion,
        resultScoreMotion,
        resultXpMotion,
        resultActionsMotion,
      ],
      75,
    );

    if (quiz && score === quiz.questions.length) {
      resultBadgeMotion.setValue(0);
      Animated.spring(resultBadgeMotion, {
        toValue: 1,
        speed: 16,
        bounciness: 11,
        useNativeDriver: true,
      }).start();
    }
  }, [
    finished,
    quiz,
    resultActionsMotion,
    resultBadgeMotion,
    resultExitMotion,
    resultScoreMotion,
    resultTitleMotion,
    resultXpMotion,
    score,
  ]);

  useEffect(() => {
    if (!hasAnswered) {
      return;
    }

    Animated.sequence([
      Animated.timing(xpMotion, {
        toValue: 1.08,
        duration: 100,
        useNativeDriver: true,
      }),
      Animated.spring(xpMotion, {
        toValue: 1,
        speed: 20,
        bounciness: 5,
        useNativeDriver: true,
      }),
    ]).start();
  }, [hasAnswered, xpMotion]);

  // Fetch the quiz from the server. The server also tells us which attempt
  // this is and what a correct answer is worth, so nothing is tracked here.
  const loadQuiz = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      setQuiz(await fetchQuizByLessonId(lesson.id));
    } catch (error) {
      setLoadError(error.message);
    } finally {
      setLoading(false);
    }
  }, [lesson.id]);

  useEffect(() => {
    loadQuiz();
  }, [loadQuiz]);

  if (loading) {
    return (
      <NavBarWrapper {...navProps}>
        <View style={[styles.container, { justifyContent: "center" }]}>
          <ActivityIndicator size="large" color={colors.correct} />
        </View>
      </NavBarWrapper>
    );
  }

  if (loadError) {
    return (
      <NavBarWrapper {...navProps}>
        <View style={styles.container}>
          <Text style={styles.title}>Couldn't load the quiz</Text>
          <Text style={styles.resultSubtext}>{loadError}</Text>

          <DuoButton
            label="Try Again"
            variant="primary"
            onPress={loadQuiz}
            style={styles.mainButton}
          />

          <PressScale onPress={onBack} style={styles.backPressable}>
            <Text style={styles.backButton}>← Back to Lesson</Text>
          </PressScale>
        </View>
      </NavBarWrapper>
    );
  }

  if (!quiz || !quiz.questions?.length) {
    return (
      <NavBarWrapper {...navProps}>
        <View style={styles.container}>
          <Text style={styles.title}>Quiz coming soon</Text>

          <PressScale onPress={onBack} style={styles.backPressable}>
            <Text style={styles.backButton}>← Back to Lesson</Text>
          </PressScale>
        </View>
      </NavBarWrapper>
    );
  }

  const handleAnswer = (index) => {
    // With an answer key, the first pick is final (instant feedback).
    // Without one, the user can change their mind until they press Next.
    if ((revealsAnswers && hasAnswered) || transitionLock.current) {
      return;
    }

    setSelectedAnswer(index);
  };

  const handleNext = async () => {
    if (selectedAnswer === null || submitting || transitionLock.current) {
      return;
    }

    const updatedChosen = { ...chosen, [question.id]: selectedAnswer };
    const isLastQuestion = currentQuestion === quiz.questions.length - 1;

    if (!isLastQuestion) {
      transitionLock.current = true;
      setIsTransitioning(true);
      Animated.timing(questionMotion, {
        toValue: 0,
        duration: 145,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }).start(({ finished: didExit }) => {
        if (!didExit) {
          transitionLock.current = false;
          setIsTransitioning(false);
          return;
        }

        setChosen(updatedChosen);
        setCurrentQuestion(currentQuestion + 1);
        setSelectedAnswer(null);
        questionMotion.setValue(0);
        requestAnimationFrame(() => {
          Animated.timing(questionMotion, {
            toValue: 1,
            duration: 220,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }).start(({ finished: didEnter }) => {
            if (didEnter) {
              transitionLock.current = false;
              setIsTransitioning(false);
            }
          });
        });
      });
      return;
    }

    // Last question: send the answers, and use the SERVER's grade.
    setSubmitting(true);
    try {
      const result = await submitQuiz(
        lesson.id,
        quiz.questions.map((item) => ({
          questionId: item.id,
          selectedIndex: updatedChosen[item.id],
        })),
      );

      setChosen(updatedChosen);
      setScore(result.score);
      setXpEarned(result.xpEarned);
      setNextXpPerCorrect(result.nextXpPerCorrect);
      setFinished(true);

      if (onComplete) {
        onComplete();
      }
    } catch (error) {
      Alert.alert("Couldn't submit your quiz", error.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleTryAgain = () => {
    Animated.timing(resultExitMotion, {
      toValue: 0,
      duration: 170,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start(({ finished: didExit }) => {
      if (!didExit) {
        return;
      }

      setCurrentQuestion(0);
      setSelectedAnswer(null);
      setChosen({});
      setScore(0);
      setXpEarned(0);
      setFinished(false);
      entrancePlayedForQuiz.current = false;
      progressMotion.setValue(0);
      loadQuiz();
    });
  };

  if (finished) {
    const nextRate = nextXpPerCorrect;
    const isPerfect = score === totalQuestions;

    return (
      <NavBarWrapper {...navProps}>
        <ScrollView
          style={styles.container}
          contentContainerStyle={styles.scrollContent}
        >
          <Animated.View
            style={[
              styles.resultContent,
              {
                opacity: resultExitMotion,
                transform: [
                  {
                    translateY: resultExitMotion.interpolate({
                      inputRange: [0, 1],
                      outputRange: [14, 0],
                    }),
                  },
                ],
              },
            ]}
          >
            <Animated.View
              style={[
                styles.resultBadge,
                { backgroundColor: isPerfect ? colors.gold : colors.correct },
                {
                  opacity: resultBadgeMotion,
                  transform: [
                    {
                      scale: resultBadgeMotion.interpolate({
                        inputRange: [0, 1],
                        outputRange: [0.72, isPerfect ? 1.08 : 1],
                      }),
                    },
                  ],
                  shadowColor: isPerfect ? colors.gold : colors.correct,
                  shadowOpacity: isPerfect ? 0.28 : 0.12,
                },
              ]}
            >
              <Ionicons
                name={isPerfect ? "trophy" : "checkmark-circle"}
                size={44}
                color="#fff"
              />
            </Animated.View>

            <Animated.View
              style={{
                opacity: resultTitleMotion,
                transform: [
                  {
                    translateY: resultTitleMotion.interpolate({
                      inputRange: [0, 1],
                      outputRange: [9, 0],
                    }),
                  },
                ],
              }}
            >
              <Text style={styles.resultTitle}>Quiz Complete!</Text>
            </Animated.View>

            <Animated.View
              style={[
                styles.resultScoreRow,
                {
                  opacity: resultScoreMotion,
                  transform: [
                    {
                      translateY: resultScoreMotion.interpolate({
                        inputRange: [0, 1],
                        outputRange: [10, 0],
                      }),
                    },
                  ],
                },
              ]}
            >
              <CountUp value={score} style={styles.score} />
              <Text style={styles.scoreTotal}>/ {totalQuestions}</Text>
            </Animated.View>

            <Animated.View
              style={[
                styles.xpPill,
                {
                  opacity: resultXpMotion,
                  transform: [
                    {
                      translateY: resultXpMotion.interpolate({
                        inputRange: [0, 1],
                        outputRange: [9, 0],
                      }),
                    },
                  ],
                },
              ]}
            >
              <Ionicons name="flash" size={17} color={colors.orange} />
              <Text style={styles.resultText}>You earned </Text>
              <CountUp value={xpEarned} style={styles.resultText} />
              <Text style={styles.resultText}> XP</Text>
            </Animated.View>

            <Text style={styles.resultSubtext}>
              {isPerfect
                ? "Perfect score!"
                : "Nice work — review and try again anytime."}
            </Text>

            <Animated.View
              style={{
                opacity: resultActionsMotion,
                transform: [
                  {
                    translateY: resultActionsMotion.interpolate({
                      inputRange: [0, 1],
                      outputRange: [8, 0],
                    }),
                  },
                ],
              }}
            >
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
            </Animated.View>
          </Animated.View>
        </ScrollView>
      </NavBarWrapper>
    );
  }

  const attemptNumber = quiz.attemptNumber;
  const xpPerCorrect = quiz.xpPerCorrect;
  const questionTranslate = questionMotion.interpolate({
    inputRange: [0, 1],
    outputRange: [-18, 0],
  });
  const questionOpacity = questionMotion;

  return (
    <NavBarWrapper {...navProps}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.scrollContent}
      >
        <PressScale onPress={onBack} style={styles.backPressable}>
          <Text style={styles.backButton}>← Lesson</Text>
        </PressScale>

        <Animated.View
          style={{
            opacity: headerEntrance,
            transform: [
              {
                translateY: headerEntrance.interpolate({
                  inputRange: [0, 1],
                  outputRange: [8, 0],
                }),
              },
            ],
          }}
        >
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
        </Animated.View>

        <Animated.View
          style={[
            styles.progressMeta,
            {
              opacity: progressEntrance,
              transform: [
                {
                  translateY: progressEntrance.interpolate({
                    inputRange: [0, 1],
                    outputRange: [8, 0],
                  }),
                },
              ],
            },
          ]}
        >
          <QuestionCounter
            currentQuestion={currentQuestion}
            totalQuestions={totalQuestions}
            motion={counterMotion}
            styles={styles}
          />
          <Animated.View
            style={[styles.xpRatePill, { transform: [{ scale: xpMotion }] }]}
          >
            <Ionicons name="flash" size={15} color={colors.orange} />
            <Text style={styles.xpRateText}>
              {formatXpRate(xpPerCorrect)} XP each
            </Text>
          </Animated.View>
        </Animated.View>

        <Animated.View
          style={{
            opacity: progressEntrance,
            transform: [
              {
                translateY: progressEntrance.interpolate({
                  inputRange: [0, 1],
                  outputRange: [6, 0],
                }),
              },
            ],
          }}
        >
          <View style={styles.progressTrack}>
            <Animated.View
              style={[
                styles.progressFill,
                {
                  width: progressMotion.interpolate({
                    inputRange: [0, 1],
                    outputRange: ["0%", "100%"],
                  }),
                },
              ]}
            />
          </View>
        </Animated.View>

        <Animated.View
          style={{
            opacity: questionOpacity,
            transform: [{ translateX: questionTranslate }],
          }}
        >
          <Animated.View
            style={{
              opacity: questionEntrance,
              transform: [
                {
                  translateY: questionEntrance.interpolate({
                    inputRange: [0, 1],
                    outputRange: [10, 0],
                  }),
                },
                {
                  scale: questionEntrance.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0.985, 1],
                  }),
                },
              ],
            }}
          >
            <View style={styles.questionCard}>
              <Text style={styles.question}>{question.question}</Text>
              {question.options.map((option, index) => {
                const isSelected = selectedAnswer === index;
                const isCorrectOption =
                  revealsAnswers && index === correctIndex;

                // Only judge right/wrong when the client actually knows the key.
                const showCorrect =
                  revealsAnswers && hasAnswered && isCorrectOption;
                const showIncorrect =
                  revealsAnswers &&
                  hasAnswered &&
                  isSelected &&
                  !isCorrectOption;

                // No key (or not judged): a picked option is simply "active".
                const showNeutralSelected =
                  !revealsAnswers &&
                  isSelected &&
                  !showCorrect &&
                  !showIncorrect;

                return (
                  <AnswerOption
                    key={index}
                    index={index}
                    option={option}
                    isSelected={isSelected}
                    showNeutralSelected={showNeutralSelected}
                    showCorrect={showCorrect}
                    showIncorrect={showIncorrect}
                    disabled={
                      (revealsAnswers && hasAnswered) || isTransitioning
                    }
                    onPress={() => handleAnswer(index)}
                    styles={styles}
                    colors={colors}
                  />
                );
              })}
              {hasAnswered && revealsAnswers && question.explanation && (
                <View style={styles.explanationBox}>
                  <Ionicons
                    name="information-circle"
                    size={18}
                    color={colors.textMuted}
                  />
                  <Text style={styles.explanationText}>
                    {question.explanation}
                  </Text>
                </View>
              )}
              
            </View>
          </Animated.View>
        </Animated.View>

        <Animated.View
          style={{
            opacity: actionEntrance,
            transform: [
              {
                translateY: actionEntrance.interpolate({
                  inputRange: [0, 1],
                  outputRange: [10, 0],
                }),
              },
            ],
          }}
        >
          <DuoButton
            label={
              currentQuestion === quiz.questions.length - 1
                ? submitting
                  ? "Submitting..."
                  : "Finish Quiz"
                : "Next"
            }
            variant="primary"
            disabled={selectedAnswer === null || submitting || isTransitioning}
            onPress={handleNext}
            style={styles.mainButton}
          />
        </Animated.View>
      </ScrollView>
    </NavBarWrapper>
  );
}

const createStyles = (colors) =>
  StyleSheet.create({
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

    backPressable: {
      alignSelf: "flex-start",
      minHeight: 38,
      justifyContent: "center",
      marginTop: 30,
    },

    backButton: {
      fontSize: 15,
      fontWeight: "700",
      color: colors.orangeDeep,
    },

    headerRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginTop: 10,
    },

    title: {
      fontSize: 26,
      fontWeight: "800",
      color: colors.text,
    },

    attemptBadge: {
      backgroundColor: colors.orangeLight,
      borderRadius: radius.full,
      paddingHorizontal: 12,
      paddingVertical: 6,
    },

    attemptBadgeText: {
      color: colors.orangeDeep,
      fontSize: 12,
      fontWeight: "800",
    },

    progressMeta: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginTop: 20,
      marginBottom: 12,
    },

    counterCaption: {
      color: colors.textMuted,
      fontSize: 10,
      fontWeight: "800",
      letterSpacing: 0.8,
    },

    counterRow: {
      flexDirection: "row",
      alignItems: "baseline",
      marginTop: 1,
    },

    counterNumber: {
      color: colors.text,
      fontSize: 24,
      fontWeight: "800",
      fontVariant: ["tabular-nums"],
    },

    counterTotal: {
      color: colors.textMuted,
      fontSize: 14,
      fontWeight: "700",
      marginLeft: 4,
    },

    xpRatePill: {
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
      backgroundColor: colors.orangeLight,
      borderRadius: radius.full,
      paddingHorizontal: 11,
      paddingVertical: 7,
    },

    xpRateText: {
      color: colors.orangeDeep,
      fontSize: 12,
      fontWeight: "800",
    },

    progressTrack: {
      height: 10,
      borderRadius: radius.full,
      backgroundColor: colors.border,
      overflow: "hidden",
      marginBottom: 20,
    },

    progressFill: {
      height: "100%",
      borderRadius: radius.full,
      backgroundColor: colors.orange,
    },

    questionCard: {
      backgroundColor: colors.card,
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
      backgroundColor: colors.card,
    },

    selectedOption: {
      backgroundColor: colors.orangeLight,
      borderColor: colors.orange,
    },

    correctOption: {
      backgroundColor: colors.correctBg,
      borderColor: colors.correct,
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
      backgroundColor: colors.orange,
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

    resultContent: {
      alignItems: "stretch",
    },

    resultBadge: {
      width: 88,
      height: 88,
      borderRadius: 44,
      justifyContent: "center",
      alignItems: "center",
      alignSelf: "center",
      marginTop: 60,
      shadowOffset: { width: 0, height: 7 },
      shadowRadius: 12,
      elevation: 5,
    },

    resultTitle: {
      fontSize: 24,
      fontWeight: "800",
      textAlign: "center",
      marginTop: 16,
      color: colors.text,
    },

    resultScoreRow: {
      flexDirection: "row",
      alignItems: "baseline",
      justifyContent: "center",
      marginTop: 12,
    },

    score: {
      fontSize: 48,
      fontWeight: "800",
      textAlign: "center",
      color: colors.text,
      fontVariant: ["tabular-nums"],
    },

    scoreTotal: {
      fontSize: 21,
      fontWeight: "700",
      color: colors.textMuted,
      marginLeft: 5,
    },

    xpPill: {
      flexDirection: "row",
      alignItems: "center",
      gap: 2,
      alignSelf: "center",
      backgroundColor: colors.orangeLight,
      borderRadius: radius.full,
      paddingHorizontal: 14,
      paddingVertical: 9,
      marginTop: 14,
    },

    resultText: {
      fontSize: 15,
      fontWeight: "700",
      color: colors.orangeDeep,
    },

    resultSubtext: {
      fontSize: 14,
      color: colors.textMuted,
      textAlign: "center",
      marginTop: 12,
    },
  });
