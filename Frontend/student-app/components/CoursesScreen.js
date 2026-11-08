import React from "react";
import { StyleSheet, View } from "react-native";
import Svg, { Path } from "react-native-svg";

import { space, tokens } from "../theme";
import BottomNavBar from "./BottomNavBar";
import AppText from "./ui/AppText";
import CourseCard, { NAME_LEFT } from "./ui/CourseCard";
import EmptyState from "./ui/EmptyState";
import PressLip from "./ui/PressLip";
import Screen from "./ui/Screen";
import { RowsSkeleton } from "./ui/Skeleton";

// The Courses tab: the courses the student added, one full-width tinted card each. Finding more is on the Explore page (the + at the top right).
export default function CoursesScreen({
  courses = [],
  myCourseIds = [],
  loading = false, // "Your courses" is still being read from the phone
  onExplore,
  onSelectCourse,
  onHome,
  onCourses,
  onRanking,
  onProfile,
}) {
  const mine = courses.filter((course) => myCourseIds.includes(course.id));

  return (
    <View style={styles.root}>
      <Screen withTabBar contentStyle={styles.content}>
        <View style={styles.header}>
          <AppText variant="display" accessibilityRole="header" style={styles.title}>
            Courses
          </AppText>
          {courses.length > 0 ? (
            <PressLip
              onPress={onExplore}
              hitSlop={space.sm}
              accessibilityLabel="Explore courses"
              lip={ADD_LIP}
              lipSize={4}
              radius={16}
              faceStyle={styles.addFace}
            >
              <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
                <Path d="M12 5v14M5 12h14" stroke={tokens.accentLip} strokeWidth={2.75} strokeLinecap="round" />
              </Svg>
            </PressLip>
          ) : null}
        </View>

        {courses.length === 0 ? (
          <EmptyState title="No courses yet" message="New courses will show up here soon." />
        ) : (
          <>
            {loading ? (
              <RowsSkeleton count={2} height={72} />
            ) : mine.length === 0 ? (
              <AppText tone="secondary" style={styles.hint}>
                Tap + to find your first course.
              </AppText>
            ) : (
              <View>
                {mine.map((course, index) => (
                  <React.Fragment key={course.id}>
                    {index > 0 ? <View style={styles.divider} /> : null}
                    <CourseCard course={course} onPress={onSelectCourse} />
                  </React.Fragment>
                ))}
              </View>
            )}
          </>
        )}
      </Screen>

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

const ADD_LIP = "#CBE0D3"; // the add button's solid bottom edge

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },

  // rows sit 16 dp from the screen edges; the title keeps 24 and the add button 20
  content: {
    paddingHorizontal: 16,
  },

  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingLeft: 8,
    paddingRight: 4,
    marginBottom: 36,
  },

  // between rows: from under the name to 24 dp from the right edge, 16 dp above and below
  divider: {
    height: 1,
    marginVertical: 16,
    marginLeft: NAME_LEFT,
    marginRight: 8,
    backgroundColor: "#EEEEEE",
  },

  title: {
    letterSpacing: -0.96,
  },

  hint: {
    paddingVertical: space.lg,
  },

  // a pale sage tile with a green plus
  addFace: {
    width: 52,
    height: 52,
    backgroundColor: tokens.accentTint,
    alignItems: "center",
    justifyContent: "center",
  },
});
