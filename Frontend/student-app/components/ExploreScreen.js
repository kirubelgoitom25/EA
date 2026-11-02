import React, { useMemo, useState } from "react";
import { FlatList, Pressable, ScrollView, StyleSheet, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { layout, space, tokens } from "../theme";
import AppText from "./ui/AppText";
import CourseRow from "./ui/CourseRow";
import EmptyState from "./ui/EmptyState";
import Header from "./ui/Header";
import { subjectFor } from "./ui/subjects";

// Explore: every course the student hasn't added yet, built to stay quick
// and findable with a hundred of them — slim rows, a search box and subject
// chips. Tap a row to look inside, or + to add it to your Courses.
// Reached from Home and from the + on the Courses page.
export default function ExploreScreen({
  courses = [],
  myCourseIds = [],
  onAddCourse,
  onSelectCourse,
  onBack,
  backLabel,
  onCourses,
}) {
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState("");
  const [subject, setSubject] = useState(null); // subject key, or null = all

  const available = useMemo(
    () =>
      courses
        .filter((course) => !myCourseIds.includes(course.id))
        .map((course) => ({ ...course, subject: subjectFor(course.title) })),
    [courses, myCourseIds],
  );

  // One chip per subject that has courses, most courses first.
  const chips = useMemo(() => {
    const counts = new Map();
    for (const { subject: s } of available) {
      counts.set(s.key, { ...s, count: (counts.get(s.key)?.count ?? 0) + 1 });
    }
    return [...counts.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  }, [available]);

  const needle = query.trim().toLowerCase();
  const shown = useMemo(
    () =>
      available.filter(
        (course) =>
          (!subject || course.subject.key === subject) &&
          (!needle || course.title.toLowerCase().includes(needle)),
      ),
    [available, subject, needle],
  );

  const clearFilters = () => {
    setQuery("");
    setSubject(null);
  };

  const header = (
    <View style={styles.header}>
      <View style={styles.title}>
        <Header title="Explore" backLabel={backLabel} onBack={onBack} />
      </View>

      {available.length > 0 ? (
        <>
          <View style={styles.search}>
            <Ionicons name="search" size={18} color={tokens.textSecondary} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search courses"
              placeholderTextColor={tokens.textTertiary}
              autoCorrect={false}
              autoCapitalize="none"
              returnKeyType="search"
              accessibilityLabel="Search courses"
              style={styles.input}
            />
            {query ? (
              <Pressable
                onPress={() => setQuery("")}
                hitSlop={space.sm}
                accessibilityRole="button"
                accessibilityLabel="Clear search"
              >
                <Ionicons name="close-circle" size={18} color={tokens.textTertiary} />
              </Pressable>
            ) : null}
          </View>

          {chips.length > 1 ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.chips}
              style={styles.chipScroll}
              keyboardShouldPersistTaps="handled"
            >
              <Chip label="All" count={available.length} active={!subject} onPress={() => setSubject(null)} />
              {chips.map((chip) => (
                <Chip
                  key={chip.key}
                  label={chip.label}
                  count={chip.count}
                  active={subject === chip.key}
                  onPress={() => setSubject(subject === chip.key ? null : chip.key)}
                />
              ))}
            </ScrollView>
          ) : null}
        </>
      ) : null}
    </View>
  );

  const empty =
    available.length === 0 ? (
      <EmptyState
        pose="waving"
        title={courses.length === 0 ? "No courses yet" : "You've added everything"}
        message={
          courses.length === 0
            ? "Your teacher hasn't added courses to your class yet."
            : "New courses will show up here."
        }
        actionLabel={courses.length === 0 ? undefined : "Go to my courses"}
        onAction={onCourses}
      />
    ) : (
      <EmptyState
        title="No courses match"
        message="Try another word or subject."
        actionLabel="Clear filters"
        onAction={clearFilters}
      />
    );

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <FlatList
        data={shown}
        keyExtractor={(course) => course.id}
        renderItem={({ item }) => <CourseRow course={item} onOpen={onSelectCourse} onAdd={onAddCourse} />}
        ListHeaderComponent={header}
        ListEmptyComponent={<View style={styles.empty}>{empty}</View>}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
        initialNumToRender={14}
        windowSize={7}
        contentContainerStyle={{ paddingBottom: insets.bottom + space.xxl }}
      />
    </View>
  );
}

function Chip({ label, count, active, onPress }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityLabel={`${label}, ${count} courses`}
      style={({ pressed }) => [styles.chip, active && styles.chipActive, pressed && styles.pressed]}
    >
      <AppText variant="label" style={active ? styles.chipTextActive : undefined}>
        {label}
      </AppText>
      <AppText variant="caption" tone="secondary" style={active ? styles.chipTextActive : undefined}>
        {count}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: tokens.bg,
  },

  header: {
    paddingTop: space.lg,
    marginBottom: space.sm,
  },

  title: {
    paddingHorizontal: layout.gutter,
  },

  pressed: {
    opacity: 0.7,
  },

  search: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    height: 48,
    marginHorizontal: layout.gutter,
    paddingHorizontal: space.lg,
    borderRadius: 24,
    backgroundColor: tokens.surface,
    borderWidth: 1,
    borderColor: tokens.divider,
  },

  input: {
    flex: 1,
    height: 48,
    padding: 0,
    fontSize: 16,
    color: tokens.text,
  },

  chipScroll: {
    marginTop: space.md,
  },

  chips: {
    paddingHorizontal: layout.gutter,
    gap: space.sm,
  },

  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs + 2,
    height: 36,
    paddingHorizontal: space.md + 2,
    borderRadius: 18,
    backgroundColor: tokens.surface,
    borderWidth: 1,
    borderColor: tokens.divider,
  },

  chipActive: {
    backgroundColor: tokens.accentTint,
    borderColor: tokens.accent,
  },

  chipTextActive: {
    color: tokens.accentText,
  },

  empty: {
    paddingHorizontal: layout.gutter,
  },
});
