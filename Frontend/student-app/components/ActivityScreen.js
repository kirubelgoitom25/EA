import React, { useState } from "react";
import { StyleSheet, View } from "react-native";
import { Feather } from "@expo/vector-icons";

import { completeActivity } from "../services/api";
import { feedback } from "../services/feedback";
import { youtubeId } from "../services/activitySteps";
import { cheerFor } from "../services/journeyModel";
import { level, space, tokens } from "../theme";
import AppText from "./ui/AppText";
import Button from "./ui/Button";
import { Entrance } from "./ui/anim";
import { useFoxReact } from "./ui/FoxContext";
import FoxSay from "./ui/FoxSay";
import Header from "./ui/Header";
import Screen from "./ui/Screen";
import YouTubePlayer from "./ui/YouTubePlayer";

// A video or a reading from a Course Studio lesson. Opening it never counts as done: the student
// presses "Mark complete", which also completes the lesson (the server does that).
//
// The student always sees where they are (course, chapter, step n of m) and what comes next:
// once the activity is done the fox cheers and the main button leads straight to the next step.
//
// - context: { courseTitle, chapterNumber, chapterTitle, step, steps }
// - next: what follows ({ type: "video" | "reading", activity } | { type: "questions" } | null)
// - onNext(next): go to that step
// - closing: { label, onPress } shown instead when nothing is left in the chapter
export default function ActivityScreen({ activity, context, next, onNext, closing, onBack, onCompleted }) {
  const foxReact = useFoxReact();
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(!!activity.completed);
  const [error, setError] = useState("");

  const markComplete = async () => {
    setSaving(true);
    setError("");
    try {
      await completeActivity(activity.id);
      setDone(true);
      feedback.complete({ xp: 0 });
      foxReact("stageDone");
      onCompleted?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const nextLabel = next
    ? next.type === "questions"
      ? "Next: Questions"
      : `Next: ${next.activity.title}`
    : null;

  const footer = done ? (
    <View style={styles.footer}>
      {next ? (
        <>
          <Button label={nextLabel} onPress={() => onNext(next)} />
          <Button label="Back to chapter" variant="text" onPress={onBack} />
        </>
      ) : (
        <Button label={closing?.label ?? "Back to chapter"} onPress={closing?.onPress ?? onBack} />
      )}
    </View>
  ) : (
    <View style={styles.footer}>
      {error ? (
        <AppText tone="wrong" style={styles.error} accessibilityRole="alert">
          {error}
        </AppText>
      ) : null}
      <Button label="Mark complete" onPress={markComplete} loading={saving} />
    </View>
  );

  const where = context
    ? [context.chapterNumber ? `Chapter ${context.chapterNumber}` : null, context.chapterTitle].filter(Boolean).join(" · ")
    : null;

  return (
    <Screen footer={footer} background={level.lessonBg}>
      <Header title={activity.title} subtitle={where} backLabel="chapter" onBack={onBack} />
      {context?.steps > 1 ? <StepBar step={context.step} steps={context.steps} course={context.courseTitle} /> : null}

      <Entrance key={activity.id} distance={18} style={styles.body}>
        {activity.kind === "video" ? (
          <VideoBlock url={activity.videoUrl} />
        ) : (
          <Reading text={activity.readingBody} />
        )}
      </Entrance>

      {done ? (
        <FoxSay style={styles.fox}>
          {next
            ? `${cheerFor(activity.kind)} ${next.type === "questions" ? "Questions are next." : "Next up is ready."}`
            : `${cheerFor(activity.kind)} That finishes this chapter.`}
        </FoxSay>
      ) : null}
    </Screen>
  );
}

// "Step 2 of 4" with one segment per step: the steps behind you in the Tail, this one in ember.
function StepBar({ step, steps, course }) {
  return (
    <View style={styles.stepBar} accessible accessibilityLabel={`${course ? `${course}, ` : ""}step ${step} of ${steps}`}>
      <AppText variant="overline" tone="secondary" numberOfLines={1}>
        {course ? `${course.toUpperCase()} · ` : ""}STEP {step} OF {steps}
      </AppText>
      <View style={styles.segments}>
        {Array.from({ length: steps }, (_, i) => (
          <View
            key={i}
            style={[
              styles.segment,
              i < step - 1 && styles.segmentDone,
              i === step - 1 && styles.segmentNow,
            ]}
          />
        ))}
      </View>
    </View>
  );
}

function VideoBlock({ url }) {
  const id = youtubeId(url);
  return (
    <View style={styles.videoWrap}>
      {id ? (
        <YouTubePlayer videoId={id} url={url} />
      ) : (
        <AppText tone="secondary">This video link can't be played. Ask your teacher to check it.</AppText>
      )}
      <AppText variant="caption" tone="secondary" style={styles.hint}>
        <Feather name="info" size={12} color={tokens.textSecondary} /> When you've watched it, press Mark complete.
      </AppText>
    </View>
  );
}

// Blank lines start a new paragraph, the same way the teacher wrote them.
function Reading({ text }) {
  const paragraphs = (text ?? "").split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  return (
    <View style={styles.reading}>
      {paragraphs.map((paragraph, index) => (
        <AppText key={index} style={styles.paragraph}>
          {paragraph}
        </AppText>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  body: { marginTop: space.lg },
  stepBar: { marginTop: space.lg, gap: space.sm },
  segments: { flexDirection: "row", gap: 6 },
  segment: { flex: 1, height: 6, borderRadius: 3, backgroundColor: level.segmentAhead },
  segmentDone: { backgroundColor: level.segmentDone },
  segmentNow: { backgroundColor: level.segmentNow },
  videoWrap: { gap: space.md },
  hint: { textAlign: "center" },
  reading: { gap: space.lg },
  paragraph: { lineHeight: 26 },
  fox: { marginTop: space.xl },
  footer: { gap: space.sm, paddingTop: space.md },
  error: { textAlign: "center" },
});
