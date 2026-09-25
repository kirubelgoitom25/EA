import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Linking,
  Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import YoutubePlayer from "react-native-youtube-iframe";

import { colors, radius } from "../theme";
import BottomNavBar from "./BottomNavBar";
import DuoButton from "./DuoButton";

export default function LessonScreen({
  lesson,
  onBack,
  onQuiz,
  onPractice,
  onHome,
  onCourses,
  onRanking,
  onProfile,
}) {
  const [playing, setPlaying] = useState(false);

  const getYouTubeVideoId = (url) => {
    if (!url) {
      return null;
    }

    const match = url.match(
      /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&?/]+)/
    );

    if (!match) {
      return null;
    }

    return match[1];
  };

  const videoId = getYouTubeVideoId(lesson.videoUrl);

  const onStateChange = useCallback((state) => {
    if (state === "ended") {
      setPlaying(false);
    }
  }, []);

  const openInYouTube = async () => {
    if (!videoId) {
      return;
    }

    const appUrl = `youtube://watch?v=${videoId}`;
    const webUrl = `https://www.youtube.com/watch?v=${videoId}`;

    try {
      const canOpenApp = await Linking.canOpenURL(appUrl);
      await Linking.openURL(canOpenApp ? appUrl : webUrl);
    } catch (error) {
      Alert.alert(
        "Couldn't open video",
        "Please check your connection and try again."
      );
    }
  };

  return (
    <View style={styles.root}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.scrollContent}
      >
        <TouchableOpacity onPress={onBack}>
          <Text style={styles.backButton}>← Course</Text>
        </TouchableOpacity>

        <Text style={styles.title}>{lesson.title}</Text>

        <View style={styles.durationPill}>
          <Ionicons name="videocam" size={14} color={colors.blue} />
          <Text style={styles.duration}>{lesson.duration}</Text>
        </View>

        {videoId ? (
          <View>
            <View style={styles.videoContainer}>
              <YoutubePlayer
                height={220}
                play={playing}
                videoId={videoId}
                onChangeState={onStateChange}
                webViewProps={{
                  allowsInlineMediaPlayback: true,
                  mediaPlaybackRequiresUserAction: false,
                }}
              />
            </View>

            <TouchableOpacity onPress={openInYouTube}>
              <Text style={styles.externalLink}>
                Having trouble? Open in YouTube app →
              </Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.videoBox}>
            <Text style={styles.videoText}>Video unavailable</Text>
          </View>
        )}

        <View style={styles.infoCard}>
          <View style={styles.infoIconWrap}>
            <Ionicons name="bulb" size={18} color={colors.gold} />
          </View>

          <View style={styles.infoTextBlock}>
            <Text style={styles.infoTitle}>After this lesson</Text>
            <Text style={styles.infoText}>
              Complete the short quiz to check your understanding.
            </Text>
          </View>
        </View>

        <DuoButton
          label="Take Quiz"
          variant="primary"
          onPress={onQuiz}
          icon={<Ionicons name="flash" size={18} color="#fff" />}
          style={styles.actionButton}
        />

        <DuoButton
          label="Practice"
          variant="blue"
          onPress={onPractice}
          icon={<Ionicons name="barbell" size={18} color="#fff" />}
          style={styles.actionButton}
        />
      </ScrollView>

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

  title: {
    fontSize: 26,
    fontWeight: "800",
    marginTop: 20,
    color: colors.text,
  },

  durationPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.blueLight,
    alignSelf: "flex-start",
    borderRadius: radius.full,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginTop: 10,
    marginBottom: 18,
  },

  duration: {
    color: colors.blueDark,
    fontWeight: "700",
    fontSize: 12,
  },

  videoContainer: {
    height: 220,
    borderRadius: radius.lg,
    overflow: "hidden",
    backgroundColor: "#000",
  },

  externalLink: {
    color: colors.textMuted,
    fontSize: 13,
    textAlign: "center",
    marginTop: 10,
  },

  videoBox: {
    height: 220,
    backgroundColor: "#111",
    borderRadius: radius.lg,
    justifyContent: "center",
    alignItems: "center",
  },

  videoText: {
    color: "#fff",
    fontSize: 16,
  },

  infoCard: {
    flexDirection: "row",
    backgroundColor: colors.greenBg,
    padding: 16,
    borderRadius: radius.lg,
    marginTop: 20,
    borderWidth: 2,
    borderColor: colors.greenLight,
  },

  infoIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#fff",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },

  infoTextBlock: {
    flex: 1,
  },

  infoTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: colors.text,
  },

  infoText: {
    color: colors.textMuted,
    marginTop: 4,
    lineHeight: 19,
    fontSize: 13,
  },

  actionButton: {
    marginTop: 16,
  },
});
